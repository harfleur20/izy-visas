import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { letterId, eventType } = await req.json();

    if (!letterId || !eventType) {
      return new Response(
        JSON.stringify({ error: "Missing letterId or eventType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get envoi
    const { data: envoi } = await supabase
      .from("envois_lrar")
      .select("*")
      .eq("mysendingbox_letter_id", letterId)
      .single();

    if (!envoi) {
      return new Response(
        JSON.stringify({ error: `No envoi found for letter ${letterId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map event to statuses
    const statusMap: Record<string, string> = {
      "letter.created": "created",
      "letter.filing_proof": "filing_proof",
      "letter.sent": "in_transit",
      "letter.delivered": "delivered",
      "letter.returned_to_sender": "returned",
    };

    const dossierStatusMap: Record<string, string> = {
      "letter.created": "lrar_cree",
      "letter.filing_proof": "depose_poste",
      "letter.sent": "en_transit",
      "letter.delivered": "livre",
      "letter.returned_to_sender": "retourne",
    };

    const newStatus = statusMap[eventType] || envoi.status;
    const newDossierStatus = dossierStatusMap[eventType];

    // Update envois_lrar
    await supabase
      .from("envois_lrar")
      .update({ status: newStatus })
      .eq("mysendingbox_letter_id", letterId);

    // Update dossiers
    if (newDossierStatus) {
      const dossierUpdate: Record<string, unknown> = {
        lrar_status: newDossierStatus,
      };
      if (eventType === "letter.delivered") {
        dossierUpdate.delivered_at = new Date().toISOString();
      }

      await supabase
        .from("dossiers")
        .update(dossierUpdate)
        .eq("dossier_ref", envoi.dossier_ref);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dossier_ref: envoi.dossier_ref,
        envoi_status: newStatus,
        dossier_lrar_status: newDossierStatus,
        event: eventType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
