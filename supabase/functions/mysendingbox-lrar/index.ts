import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MSB_API_URL = "https://api.mysendingbox.fr";

// ── Adresses de routage ─────────────────────────────────────────────────────

const ADDRESSES = {
  long_sejour: {
    name: "CRRV - Centre de Réception des Retours Visa",
    address_line1: "BP 83609",
    city: "Nantes Cedex 01",
    postal_code: "44036",
    country: "France",
  },
  court_sejour: {
    name: "Sous-direction des visas",
    address_line1: "Service des visas",
    address_line2: "Ministère de l'Intérieur",
    city: "Nantes Cedex 01",
    postal_code: "44036",
    country: "France",
  },
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMSBHeaders() {
  const key = Deno.env.get("MSB_API_KEY_TEST");
  if (!key) throw new Error("MSB_API_KEY_TEST not configured");
  return {
    Authorization: `Basic ${btoa(key + ":")}`,
    "Content-Type": "application/json",
  };
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
      case "status":
        return await handleStatus(req);
      default:
        return jsonResponse({ error: "Unknown action. Use: send, webhook, status" }, 400);
    }
  } catch (error) {
    console.error("[MSB] Error:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

// ── 1. Send LRAR ────────────────────────────────────────────────────────────

async function handleSend(req: Request) {
  const {
    dossierRef,
    visaType,
    signatureRequestId,
    userId,
    senderName,
    senderAddressLine1,
    senderCity,
    senderPostalCode,
    clientPhone,
  } = await req.json();

  if (!dossierRef || !visaType || !userId) {
    return jsonResponse({ error: "Missing: dossierRef, visaType, userId" }, 400);
  }

  if (!["long_sejour", "court_sejour"].includes(visaType)) {
    return jsonResponse({ error: "visaType must be 'long_sejour' or 'court_sejour'" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const dest = ADDRESSES[visaType as keyof typeof ADDRESSES];

  // If signatureRequestId provided, fetch the signed PDF from YouSign
  let pdfUrl: string | undefined;
  if (signatureRequestId) {
    const { data: sig } = await supabase
      .from("signatures")
      .select("certificate_path")
      .eq("yousign_signature_request_id", signatureRequestId)
      .single();

    if (sig?.certificate_path) {
      const { data: urlData } = await supabase.storage
        .from("signature-certificates")
        .createSignedUrl(sig.certificate_path, 3600);
      pdfUrl = urlData?.signedUrl;
    }
  }

  if (!pdfUrl) {
    return jsonResponse({ error: "No signed PDF found for this signature request" }, 400);
  }

  // Send LRAR via MySendingBox
  const letterBody: Record<string, unknown> = {
    to: {
      name: dest.name,
      address_line1: dest.address_line1,
      address_line2: (dest as Record<string, string>).address_line2 || undefined,
      address_city: dest.city,
      address_postalcode: dest.postal_code,
      address_country: dest.country,
    },
    from: {
      name: senderName || "Cabinet juridique",
      address_line1: senderAddressLine1 || "Adresse expéditeur",
      address_city: senderCity || "Paris",
      address_postalcode: senderPostalCode || "75001",
      address_country: "France",
    },
    postage_type: "lrar",
    source_file: pdfUrl,
    color: "bw",
    manage_delivery_proof: true,
  };

  console.log(`[MSB] Sending LRAR for dossier ${dossierRef} to ${dest.name}`);

  const res = await fetch(`${MSB_API_URL}/letters`, {
    method: "POST",
    headers: getMSBHeaders(),
    body: JSON.stringify(letterBody),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[MSB] Send letter failed:", err);
    return jsonResponse({ error: "Failed to send LRAR", details: err }, 502);
  }

  const letter = await res.json();
  console.log(`[MSB] Letter created: ${letter.id}, tracking: ${letter.tracking_number}`);

  // Get signature ID if available
  let signatureId: string | undefined;
  if (signatureRequestId) {
    const { data: sigRow } = await supabase
      .from("signatures")
      .select("id")
      .eq("yousign_signature_request_id", signatureRequestId)
      .single();
    signatureId = sigRow?.id;
  }

  // Save to database
  const { error: dbError } = await supabase.from("envois_lrar").insert({
    user_id: userId,
    dossier_ref: dossierRef,
    signature_id: signatureId || null,
    visa_type: visaType,
    recipient_name: dest.name,
    recipient_address_line1: dest.address_line1,
    recipient_address_line2: (dest as Record<string, string>).address_line2 || null,
    recipient_city: dest.city,
    recipient_postal_code: dest.postal_code,
    mysendingbox_letter_id: letter.id,
    tracking_number: letter.tracking_number || null,
    status: "sent",
    pdf_url: pdfUrl,
  });

  if (dbError) {
    console.error("[MSB] DB insert error:", dbError);
  }

  // Send WhatsApp notification
  if (clientPhone) {
    await sendWhatsAppNotification(
      clientPhone,
      `📬 Votre dossier ${dossierRef} a été envoyé en LRAR. Numéro de suivi : ${letter.tracking_number || "en attente"}.`
    );
  }

  return jsonResponse({
    letterId: letter.id,
    trackingNumber: letter.tracking_number,
    status: "sent",
    destination: dest.name,
  });
}

// ── 2. Webhook handler ──────────────────────────────────────────────────────

async function handleWebhook(req: Request) {
  const payload = await req.json();
  const eventType = payload.event?.type;
  const letterId = payload.letter?.id;

  console.log(`[MSB-WEBHOOK] Event: ${eventType}, Letter: ${letterId}`);

  if (!letterId) {
    console.warn("[MSB-WEBHOOK] No letter ID in payload");
    return jsonResponse({ received: true });
  }

  const supabase = getSupabaseAdmin();

  // Get current envoi
  const { data: envoi } = await supabase
    .from("envois_lrar")
    .select("*")
    .eq("mysendingbox_letter_id", letterId)
    .single();

  if (!envoi) {
    console.warn(`[MSB-WEBHOOK] No envoi found for letter ${letterId}`);
    return jsonResponse({ received: true });
  }

  // Map MSB event types to our statuses
  const statusMap: Record<string, string> = {
    "letter.created": "created",
    "letter.filing_proof": "filing_proof",
    "letter.sent": "in_transit",
    "letter.in_transit": "in_transit",
    "letter.waiting_to_be_withdrawn": "waiting_withdrawal",
    "letter.delivered": "delivered",
    "letter.returned_to_sender": "returned",
    "letter.wrong_address": "wrong_address",
    "letter.error": "error",
  };

  const newStatus = statusMap[eventType] || envoi.status;
  const trackingNumber = payload.letter?.tracking_number || envoi.tracking_number;

  // Append webhook event to history
  const webhookEvents = Array.isArray(envoi.webhook_events) ? envoi.webhook_events : [];
  webhookEvents.push({
    type: eventType,
    received_at: new Date().toISOString(),
    data: payload,
  });

  await supabase
    .from("envois_lrar")
    .update({
      status: newStatus,
      tracking_number: trackingNumber,
      webhook_events: webhookEvents,
    })
    .eq("mysendingbox_letter_id", letterId);

  console.log(`[MSB-WEBHOOK] Updated envoi ${envoi.id}: status=${newStatus}`);

  // Send WhatsApp notification on status change
  if (newStatus !== envoi.status) {
    // Retrieve user phone from the associated signature
    const { data: sig } = await supabase
      .from("signatures")
      .select("signer_phone")
      .eq("id", envoi.signature_id)
      .single();

    if (sig?.signer_phone) {
      const statusMessages: Record<string, string> = {
        in_transit: `📮 Votre LRAR pour le dossier ${envoi.dossier_ref} est en cours d'acheminement. Suivi : ${trackingNumber}`,
        delivered: `✅ Votre LRAR pour le dossier ${envoi.dossier_ref} a été distribuée avec succès !`,
        waiting_withdrawal: `📬 Votre LRAR pour le dossier ${envoi.dossier_ref} est en attente de retrait au bureau de poste.`,
        returned: `⚠️ Votre LRAR pour le dossier ${envoi.dossier_ref} a été retournée à l'expéditeur.`,
        wrong_address: `❌ Votre LRAR pour le dossier ${envoi.dossier_ref} n'a pas pu être distribuée (adresse incorrecte).`,
        error: `⚠️ Une erreur est survenue avec l'envoi LRAR du dossier ${envoi.dossier_ref}. Contactez votre avocat.`,
        filing_proof: `📋 La preuve de dépôt de votre LRAR pour le dossier ${envoi.dossier_ref} est disponible.`,
      };

      const message = statusMessages[newStatus];
      if (message) {
        await sendWhatsAppNotification(sig.signer_phone, message);
      }
    }
  }

  return jsonResponse({ received: true });
}

// ── 3. Status check ─────────────────────────────────────────────────────────

async function handleStatus(req: Request) {
  const { dossierRef, userId } = await req.json();

  if (!dossierRef || !userId) {
    return jsonResponse({ error: "Missing: dossierRef, userId" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("envois_lrar")
    .select("*")
    .eq("dossier_ref", dossierRef)
    .eq("user_id", userId);

  if (error) {
    return jsonResponse({ error: "Failed to fetch envoi status" }, 500);
  }

  return jsonResponse({ envois: data });
}

// ── WhatsApp notification ───────────────────────────────────────────────────

async function sendWhatsAppNotification(phone: string, message: string) {
  try {
    // Using WhatsApp Business API via Meta's Cloud API
    const whatsappToken = Deno.env.get("WHATSAPP_API_TOKEN");
    const whatsappPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!whatsappToken || !whatsappPhoneId) {
      console.warn("[MSB] WhatsApp not configured (WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing). Skipping notification.");
      return;
    }

    const formattedPhone = phone.replace(/[^0-9+]/g, "");
    const cleanPhone = formattedPhone.startsWith("+") ? formattedPhone.slice(1) : formattedPhone;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
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
      console.error("[MSB] WhatsApp send failed:", err);
    } else {
      console.log(`[MSB] WhatsApp notification sent to ${cleanPhone}`);
    }
  } catch (err) {
    console.error("[MSB] WhatsApp error:", err);
  }
}
