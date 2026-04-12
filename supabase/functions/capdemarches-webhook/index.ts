import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { HttpError, requireSharedWebhookSecret } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-webhook-secret, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function insertNotification(
  supabase: unknown,
  userId: string,
  titre: string,
  message: string,
  type = "info",
) {
  const client = supabase as {
    from: (table: string) => {
      insert: (values: Record<string, unknown>) => PromiseLike<unknown>;
    };
  };

  await client.from("notifications").insert({
    user_id: userId,
    titre,
    message,
    type,
    lien: "/client",
  });
}

async function sendWhatsApp(phone: string | null | undefined, message: string) {
  if (!phone) return;

  const token = Deno.env.get("WHATSAPP_API_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    console.warn("[CAPDEMARCHES] WhatsApp non configuré. Notification conservée en base uniquement.");
    return;
  }

  const cleanPhone = formatPhone(phone).replace(/^\+/, "");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
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
  });

  if (!res.ok) {
    console.error("[CAPDEMARCHES] WhatsApp error:", await res.text());
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    requireSharedWebhookSecret(req, "CAPDEMARCHES_WEBHOOK_SECRET");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action, dossier_ref, expediteur, scan_url, type_decision, notes } = body;

    if (!dossier_ref) {
      return jsonResponse({ error: "dossier_ref is required" }, 400);
    }

    // Find the dossier
    const { data: dossier, error: dossierErr } = await supabase
      .from("dossiers")
      .select("*")
      .eq("dossier_ref", dossier_ref)
      .single();

    if (dossierErr || !dossier) {
      return jsonResponse({ error: "Dossier not found" }, 404);
    }

    if (action === "courrier_recu") {
      // CAPDEMARCHES notifies that mail was received
      const { data: courrier, error: courrierErr } = await supabase
        .from("courriers_capdemarches")
        .insert({
          dossier_id: dossier.id,
          dossier_ref,
          user_id: dossier.user_id,
          expediteur: expediteur || "CRRV",
          statut: "recu",
          notes,
        })
        .select()
        .single();

      if (courrierErr) {
        console.error("Insert courrier error:", courrierErr);
        throw courrierErr;
      }

      // Create admin task: "Courrier à transmettre"
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 24);

      await supabase.from("admin_tasks").insert({
        task_type: "courrier_a_transmettre",
        dossier_ref,
        client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
        user_id: dossier.user_id,
        description: `Courrier reçu de ${expediteur || "CRRV"} — à scanner et transmettre sous 24h`,
        deadline: deadline.toISOString(),
        statut: "en_attente",
        related_courrier_id: courrier.id,
      });

      const message = `📬 CAPDEMARCHES a reçu un courrier officiel pour votre dossier ${dossier_ref}. Il sera scanné et transmis sous 24 heures.`;
      await insertNotification(supabase, dossier.user_id, `Courrier reçu — ${dossier_ref}`, message, "courrier");
      await sendWhatsApp(dossier.client_phone, message);
      await supabase
        .from("dossiers")
        .update({ lrar_status: "courrier_capdemarches_recu" })
        .eq("id", dossier.id);

      return jsonResponse({
        success: true,
        courrier_id: courrier.id,
        message: "Courrier enregistré, tâche admin créée",
      });
    }

    if (action === "courrier_transmis") {
      // CAPDEMARCHES has scanned and transmitted the mail
      if (!scan_url) {
        return jsonResponse({ error: "scan_url is required" }, 400);
      }

      // Update the latest unscanned courrier
      const { data: courriers } = await supabase
        .from("courriers_capdemarches")
        .select("*")
        .eq("dossier_ref", dossier_ref)
        .eq("statut", "recu")
        .order("created_at", { ascending: false })
        .limit(1);

      if (courriers && courriers.length > 0) {
        const courrier = courriers[0];
        await supabase
          .from("courriers_capdemarches")
          .update({
            statut: "transmis",
            date_transmission: new Date().toISOString(),
            url_courrier_pdf: scan_url,
            type_decision: type_decision || null,
          })
          .eq("id", courrier.id);

        // Mark admin task as done
        await supabase
          .from("admin_tasks")
          .update({ statut: "termine" })
          .eq("related_courrier_id", courrier.id);
      }

      const statusByDecision: Record<string, string> = {
        visa_obtenu: "decision_favorable_recue",
        favorable: "decision_favorable_recue",
        rejet: "decision_defavorable_recue",
        defavorable: "decision_defavorable_recue",
        demande_complement: "demande_complement_recue",
      };
      const nextStatus = statusByDecision[String(type_decision || "").toLowerCase()] || "courrier_capdemarches_transmis";
      await supabase
        .from("dossiers")
        .update({ lrar_status: nextStatus })
        .eq("id", dossier.id);

      const message = `📄 Le courrier reçu par CAPDEMARCHES pour votre dossier ${dossier_ref} est disponible dans votre espace IZY Visa.`;
      await insertNotification(supabase, dossier.user_id, `Courrier transmis — ${dossier_ref}`, message, "courrier");
      await sendWhatsApp(dossier.client_phone, message);

      return jsonResponse({
        success: true,
        message: "Courrier marqué comme transmis",
        type_decision,
      });
    }

    return jsonResponse({ error: "Invalid action. Use 'courrier_recu' or 'courrier_transmis'" }, 400);
  } catch (error) {
    console.error("CAPDEMARCHES webhook error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
