import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assertDossierAccess, HttpError, requireAuthenticatedContext, requireSharedWebhookSecret } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-webhook-secret, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MSB_API_URL = "https://api.mysendingbox.fr";

const DESTINATIONS: Record<string, { name: string; address: string; postal_code: string; city: string }> = {
  crrv_nantes: {
    name: "Commission de recours contre les décisions de refus de visa d'entrée en France",
    address: "BP 83609",
    postal_code: "44036",
    city: "Nantes",
  },
  sous_directeur_visas: {
    name: "Sous-directeur des visas — Ministère de l'Europe et des Affaires Étrangères",
    address: "BP 83609",
    postal_code: "44036",
    city: "Nantes",
  },
  // Legacy mappings
  long_sejour: {
    name: "Commission de recours contre les décisions de refus de visa d'entrée en France",
    address: "BP 83609",
    postal_code: "44036",
    city: "Nantes",
  },
  court_sejour: {
    name: "Sous-directeur des visas — Ministère de l'Europe et des Affaires Étrangères",
    address: "BP 83609",
    postal_code: "44036",
    city: "Nantes",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMSBApiKey(): string {
  const env = Deno.env.get("MSB_ENV") || "test";
  const key = env === "live"
    ? Deno.env.get("MSB_API_KEY_LIVE")
    : Deno.env.get("MSB_API_KEY_TEST");
  if (!key) throw new Error(`MSB_API_KEY_${env.toUpperCase()} not configured`);
  return key;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0")) return `+33${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

// ── Router ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    switch (action) {
      case "send":
        return await handleSend(req);
      case "webhook":
        return await handleWebhook(req);
      default:
        return jsonResponse({ error: "Unknown action. Use: send, webhook" }, 400);
    }
  } catch (error) {
    console.error("[SEND-LRAR] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});

// ── 1. Envoi LRAR ───────────────────────────────────────────────────────────

async function handleSend(req: Request) {
  const body = await req.json();
  const { dossierId } = body;

  if (!dossierId) {
    return jsonResponse({ error: "Champ requis : dossierId" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const authHeader = req.headers.get("Authorization");
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    },
  );
  const authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

  // ── Fetch dossier ──
  const { data: dossier, error: dossierErr } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", dossierId)
    .single();

  if (dossierErr || !dossier) {
    return jsonResponse({ error: "Dossier introuvable" }, 404);
  }

  assertDossierAccess(authContext, dossier);

  // ── Vérification 1 : Procuration signée ──
  if (!dossier.procuration_signee) {
    // Alert admin
    await supabase.from("admin_tasks").insert({
      user_id: dossier.user_id,
      dossier_ref: dossier.dossier_ref,
      client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
      task_type: "alerte_procuration",
      description: `Tentative d'envoi LRAR sans procuration signée pour le dossier ${dossier.dossier_ref}.`,
      statut: "urgente",
    });
    return jsonResponse({
      error: "Procuration non signée. L'envoi LRAR est bloqué. L'administrateur a été alerté.",
      code: "PROCURATION_NOT_SIGNED",
    }, 403);
  }

  // ── Vérification 2 : Procuration non expirée ──
  if (dossier.procuration_valide_jusqu_au) {
    const expiry = new Date(dossier.procuration_valide_jusqu_au);
    if (expiry < new Date()) {
      // Notify client via WhatsApp
      if (dossier.client_phone) {
        await sendWhatsApp(
          formatPhone(dossier.client_phone),
          `⚠️ Votre procuration pour le dossier ${dossier.dossier_ref} a expiré le ${expiry.toLocaleDateString("fr-FR")}. Veuillez la renouveler avant l'envoi LRAR.`
        );
      }
      return jsonResponse({
        error: "Procuration expirée. Veuillez la renouveler avant l'envoi.",
        code: "PROCURATION_EXPIRED",
        expiredAt: dossier.procuration_valide_jusqu_au,
      }, 403);
    }
  }

  // ── Vérification 3 : PDF fusionné prêt ──
  const storagePath = `${dossierId}/lrar_complet_${dossier.dossier_ref}.pdf`;
  const { data: pdfUrlData, error: pdfUrlErr } = await supabase.storage
    .from("dossiers")
    .createSignedUrl(storagePath, 7200);

  if (pdfUrlErr || !pdfUrlData?.signedUrl) {
    return jsonResponse({
      error: "Le PDF fusionné n'est pas prêt. Veuillez d'abord lancer build-lrar-pdf.",
      code: "PDF_NOT_READY",
    }, 400);
  }

  // Download the PDF for MySendingBox upload
  const pdfRes = await fetch(pdfUrlData.signedUrl);
  if (!pdfRes.ok) {
    return jsonResponse({ error: "Impossible de télécharger le PDF fusionné" }, 500);
  }
  const pdfArrayBuffer = await pdfRes.arrayBuffer();

  // ── Determine destination ──
  const destKey = dossier.destinataire_recours || (dossier.visa_type === "long_sejour" ? "crrv_nantes" : "sous_directeur_visas");
  const dest = DESTINATIONS[destKey] || DESTINATIONS.sous_directeur_visas;

  console.log(`[SEND-LRAR] Envoi LRAR dossier=${dossier.dossier_ref} dest=${dest.name}`);

  // ── Build FormData for MySendingBox ──
  const formData = new FormData();

  // Destinataire
  formData.append("to[name]", dest.name);
  formData.append("to[address_line1]", dest.address);
  formData.append("to[address_city]", dest.city);
  formData.append("to[address_postalcode]", dest.postal_code);
  formData.append("to[address_country]", "France");

  // Expéditeur — toujours c/o CAPDEMARCHES
  formData.append("from[name]", `${dossier.client_last_name} ${dossier.client_first_name} c/o CAPDEMARCHES`);
  formData.append("from[address_line1]", "105 rue des Moines");
  formData.append("from[address_city]", "Paris");
  formData.append("from[address_postalcode]", "75017");
  formData.append("from[address_country]", "France");

  // Options LRAR
  formData.append("postage_type", "lrar");
  formData.append("postage_speed", "D1");
  formData.append("color", "bw");
  formData.append("both_sides", "false");
  formData.append("manage_returned_mail", "true");
  formData.append("staple", "false");
  formData.append("manage_delivery_proof", "true");
  formData.append("source_file_type", "file");

  // PDF file
  const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
  formData.append("source_file", pdfBlob, `${dossier.dossier_ref}.pdf`);

  // ── Appel API MySendingBox ──
  const apiKey = getMSBApiKey();
  const res = await fetch(`${MSB_API_URL}/letters`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(apiKey + ":")}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[SEND-LRAR] MySendingBox error:", err);
    return jsonResponse({ error: "Échec de l'envoi LRAR", details: err }, 502);
  }

  const letter = await res.json();
  console.log(`[SEND-LRAR] Lettre créée: id=${letter.id} tracking=${letter.tracking_number}`);

  // ── Mise à jour dossier ──
  await supabase
    .from("dossiers")
    .update({
      mysendingbox_letter_id: letter.id,
      tracking_number: letter.tracking_number || null,
      lrar_status: "lrar_envoye",
      sent_at: new Date().toISOString(),
      recipient_name: dest.name,
      recipient_address: dest.address,
      recipient_postal_code: dest.postal_code,
      recipient_city: dest.city,
    })
    .eq("id", dossierId);

  // ── Notification WhatsApp ──
  if (dossier.client_phone) {
    await sendWhatsApp(
      formatPhone(dossier.client_phone),
      `📬 Votre recours ${dossier.dossier_ref} a été envoyé en LRAR.\n` +
      `N° de suivi : ${letter.tracking_number || "en attente"}\n` +
      `Livraison estimée : J+2 ouvrés.\n` +
      `CAPDEMARCHES recevra l'accusé de réception et vous le transmettra sous 24 heures.`
    );
  }

  return jsonResponse({
    letterId: letter.id,
    trackingNumber: letter.tracking_number,
    status: "lrar_envoye",
    destination: dest.name,
  });
}

// ── 2. Webhook MySendingBox ─────────────────────────────────────────────────

async function handleWebhook(req: Request) {
  requireSharedWebhookSecret(req, "MSB_WEBHOOK_SECRET");

  const payload = await req.json();
  const eventType = payload.event?.type || payload.event?.name;
  const letterId = payload.letter?.id || payload.letter?._id || payload.event?.letter;

  console.log(`[SEND-LRAR-WEBHOOK] Event=${eventType} Letter=${letterId}`);

  if (!letterId) {
    console.warn("[SEND-LRAR-WEBHOOK] No letter ID in payload");
    return jsonResponse({ received: true });
  }

  const supabase = getSupabaseAdmin();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("*")
    .eq("mysendingbox_letter_id", letterId)
    .single();

  if (!dossier) {
    console.warn(`[SEND-LRAR-WEBHOOK] No dossier for letter ${letterId}`);
    return jsonResponse({ received: true });
  }

  // Map MSB events → statuses
  const statusMap: Record<string, string> = {
    "letter.created": "lrar_cree",
    "letter.filing_proof": "depose_poste",
    "letter.sent": "en_transit",
    "letter.in_transit": "en_transit",
    "letter.waiting_to_be_withdrawn": "attente_retrait",
    "letter.delivered": "livre",
    "letter.delivery_proof": "ar_signe",
    "letter.returned_to_sender": "retourne",
    "letter.wrong_address": "adresse_incorrecte",
    "letter.error": "erreur",
  };

  const newStatus = statusMap[eventType] || dossier.lrar_status;
  const trackingNumber = payload.letter?.tracking_number || dossier.tracking_number;

  // Append event to history
  const events = Array.isArray(dossier.webhook_events) ? dossier.webhook_events : [];
  events.push({
    type: eventType,
    received_at: new Date().toISOString(),
    data: payload,
  });

  const updateData: Record<string, unknown> = {
    lrar_status: newStatus,
    tracking_number: trackingNumber,
    webhook_events: events,
  };

  if (newStatus === "livre" || newStatus === "ar_signe") {
    updateData.delivered_at = new Date().toISOString();
  }

  await supabase
    .from("dossiers")
    .update(updateData)
    .eq("mysendingbox_letter_id", letterId);

  console.log(`[SEND-LRAR-WEBHOOK] Dossier ${dossier.dossier_ref} → ${newStatus}`);

  // ── WhatsApp notifications by status ──
  if (newStatus !== dossier.lrar_status && dossier.client_phone) {
    const deliveredDate = new Date().toLocaleDateString("fr-FR");
    const decisionDate = new Date(Date.now() + 60 * 86400000).toLocaleDateString("fr-FR");

    const messages: Record<string, string> = {
      en_transit: `📬 Votre recours ${dossier.dossier_ref} est en transit vers la CRRV. Livraison estimée sous 2 jours.`,
      depose_poste: `📮 Dossier ${dossier.dossier_ref} : votre LRAR a été déposée à La Poste. Suivi : ${trackingNumber}`,
      livre: `✅ Votre recours a été remis et signé par la CRRV le ${deliveredDate}. Le délai de 2 mois d'instruction commence aujourd'hui. Décision attendue avant le ${decisionDate}. CAPDEMARCHES vous transmettra l'accusé de réception sous 24h.`,
      ar_signe: `🖊️ Dossier ${dossier.dossier_ref} : l'accusé de réception a été signé !`,
      retourne: `⚠️ Votre courrier a été retourné. L'équipe IZY vous contacte dans les 2 heures.`,
      adresse_incorrecte: `❌ Dossier ${dossier.dossier_ref} : adresse incorrecte, la LRAR n'a pas pu être distribuée.`,
      erreur: `🚨 Incident postal sur votre dossier ${dossier.dossier_ref}. L'équipe IZY prend en charge un renvoi immédiat.`,
    };

    const msg = messages[newStatus];
    if (msg) {
      await sendWhatsApp(formatPhone(dossier.client_phone), msg);
    }

    // ── Create admin alerts for critical statuses ──
    if (["retourne", "adresse_incorrecte", "erreur"].includes(newStatus)) {
      await supabase.from("admin_tasks").insert({
        user_id: dossier.user_id,
        dossier_ref: dossier.dossier_ref,
        client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
        task_type: "alerte_lrar_critique",
        description: `🚨 LRAR ${newStatus === "retourne" ? "retournée" : newStatus === "erreur" ? "en erreur" : "adresse incorrecte"} pour le dossier ${dossier.dossier_ref}. Action immédiate requise.`,
        statut: "urgente",
      });

      // Notification admin
      await supabase.from("notifications").insert({
        user_id: dossier.user_id,
        titre: `🚨 Alerte LRAR — ${dossier.dossier_ref}`,
        message: `Le courrier LRAR du dossier ${dossier.dossier_ref} a le statut : ${newStatus}. Action urgente requise.`,
        type: "alerte",
      });
    }
  }

  return jsonResponse({ received: true });
}

// ── Notification WhatsApp via Meta Cloud API ────────────────────────────────

async function sendWhatsApp(phone: string, message: string) {
  try {
    const token = Deno.env.get("WHATSAPP_API_TOKEN");
    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!token || !phoneId) {
      console.warn("[SEND-LRAR] WhatsApp non configuré. Notification ignorée.");
      return;
    }

    const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[SEND-LRAR] WhatsApp error:", err);
    } else {
      console.log(`[SEND-LRAR] WhatsApp envoyé à ${cleanPhone}`);
    }
  } catch (err) {
    console.error("[SEND-LRAR] WhatsApp exception:", err);
  }
}
