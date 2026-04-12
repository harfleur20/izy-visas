import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isAuthorizedWebhook(req: Request): boolean {
  const expectedSecret = Deno.env.get("CAPDEMARCHES_WEBHOOK_SECRET");
  if (!expectedSecret) {
    throw new Error("CAPDEMARCHES_WEBHOOK_SECRET not configured");
  }

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-webhook-secret")?.trim();

  return bearerToken === expectedSecret || headerSecret === expectedSecret;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedWebhook(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized webhook" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action, dossier_ref, expediteur, scan_url, type_decision, notes } = body;

    if (!dossier_ref) {
      return new Response(JSON.stringify({ error: "dossier_ref is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the dossier
    const { data: dossier, error: dossierErr } = await supabase
      .from("dossiers")
      .select("*")
      .eq("dossier_ref", dossier_ref)
      .single();

    if (dossierErr || !dossier) {
      return new Response(JSON.stringify({ error: "Dossier not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      // TODO: Send WhatsApp notification to client
      // "📬 CAPDEMARCHES a reçu un courrier officiel pour votre dossier IZY-[REF]."

      return new Response(JSON.stringify({
        success: true,
        courrier_id: courrier.id,
        message: "Courrier enregistré, tâche admin créée",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "courrier_transmis") {
      // CAPDEMARCHES has scanned and transmitted the mail
      if (!scan_url) {
        return new Response(JSON.stringify({ error: "scan_url is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

      // TODO: Send WhatsApp notification
      // "📄 Le courrier de la CRRV concernant votre dossier IZY-[REF] est disponible."

      return new Response(JSON.stringify({
        success: true,
        message: "Courrier marqué comme transmis",
        type_decision,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'courrier_recu' or 'courrier_transmis'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CAPDEMARCHES webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
