import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: authHeader ? { headers: { Authorization: authHeader } } : undefined }
    );
    const authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

    const { dossier_id, option } = await req.json();

    if (!dossier_id || !option || !["A", "B", "C"].includes(option)) {
      return new Response(JSON.stringify({ error: "dossier_id et option (A/B/C) requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch dossier with neutral letter
    const { data: dossier, error: dossierErr } = await supabase
      .from("dossiers").select("*").eq("id", dossier_id).single();

    if (dossierErr || !dossier) {
      return new Response(JSON.stringify({ error: "Dossier introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    assertDossierAccess(authContext, dossier);

    if (!dossier.lettre_neutre_contenu) {
      return new Response(JSON.stringify({ error: "Lettre neutre non générée. Générez d'abord la lettre." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientName = dossier.client_last_name?.toUpperCase() || "";
    const clientPrenom = dossier.client_first_name || "";
    let letter = dossier.lettre_neutre_contenu as string;
    let typeSignataire = "client";
    let optionEnvoi = "";
    let newStatus = "";

    // Fetch pieces count for certificate reference
    const { count: piecesCount } = await supabase
      .from("pieces_justificatives")
      .select("*", { count: "exact", head: true })
      .eq("dossier_id", dossier_id);

    const certPieceNum = (piecesCount || 0) + 1;

    switch (option) {
      case "A": {
        // Option A: Client signs, downloads
        letter = letter.replace(
          "{{QUALITE_SIGNATAIRE}}",
          "J'ai l'honneur de former le présent recours en ma qualité de demandeur au visa."
        );
        letter = letter.replace(
          "{{SIGNATURE}}",
          `${clientName} ${clientPrenom}\nSignature électronique apposée via YouSign — Certificat eIDAS joint en pièce n°${certPieceNum}`
        );
        optionEnvoi = "A_telechargement";
        typeSignataire = "client";
        newStatus = "lettre_finalisee";
        break;
      }
      case "B": {
        // Option B: Client signs, IZY sends via MySendingBox
        letter = letter.replace(
          "{{QUALITE_SIGNATAIRE}}",
          "J'ai l'honneur de former le présent recours en ma qualité de demandeur au visa."
        );
        letter = letter.replace(
          "{{SIGNATURE}}",
          `${clientName} ${clientPrenom}\nSignature électronique apposée via YouSign — Certificat eIDAS joint en pièce n°${certPieceNum}`
        );
        optionEnvoi = "B_mysendingbox";
        typeSignataire = "client";
        newStatus = "lettre_finalisee";
        break;
      }
      case "C": {
        // Option C: Avocat signs and sends
        // First, assign avocat if not already assigned
        let avocatId = dossier.avocat_id;
        let avocatNom = dossier.avocat_nom;
        let avocatPrenom = dossier.avocat_prenom;
        let avocatBarreau = dossier.avocat_barreau;

        if (!avocatId) {
          // Try to assign an avocat
          try {
            const assignResp = await fetch(`${SUPABASE_URL}/functions/v1/assign-avocat-partenaire`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authContext.authHeader,
              },
              body: JSON.stringify({ dossier_id }),
            });
            const assignData = await assignResp.json();
            if (assignData.error) {
              return new Response(JSON.stringify({
                error: "Aucun avocat partenaire disponible",
                code: "NO_AVOCAT_AVAILABLE",
                message: "L'option avocat est temporairement indisponible. Choisissez l'Option A ou B.",
              }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            avocatId = assignData.avocat_id;
            avocatNom = assignData.nom;
            avocatPrenom = assignData.prenom;
            avocatBarreau = assignData.barreau;
          } catch (e) {
            console.error("Assign avocat error:", e);
            return new Response(JSON.stringify({ error: "Erreur lors de l'assignation de l'avocat" }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const procurationDate = dossier.date_signature_procuration
          ? new Date(dossier.date_signature_procuration).toLocaleDateString("fr-FR")
          : "[DATE PROCURATION]";

        letter = letter.replace(
          "{{QUALITE_SIGNATAIRE}}",
          `J'ai l'honneur de former le présent recours au nom et pour le compte de ${clientName} ${clientPrenom}, en vertu de la procuration en date du ${procurationDate} jointe en pièce n°1.\n\n${(avocatNom || "").toUpperCase()} ${avocatPrenom || ""}\nAvocat au Barreau de ${avocatBarreau || "[BARREAU]"}`
        );
        letter = letter.replace(
          "{{SIGNATURE}}",
          `${(avocatNom || "").toUpperCase()} ${avocatPrenom || ""}\nAvocat au Barreau de ${avocatBarreau || "[BARREAU]"}\nAgissant au nom et pour le compte de ${clientName} ${clientPrenom} en vertu de la procuration jointe en pièce n°1\nSignature électronique apposée via YouSign — Certificat eIDAS joint en pièce n°${certPieceNum}`
        );
        optionEnvoi = "C_avocat_partenaire";
        typeSignataire = "avocat_partenaire";
        newStatus = "en_relecture_avocat";
        break;
      }
    }

    // Add footer
    const footer = option === "C" && avocatNom
      ? `\n\n---\nDocument généré par IZY Visa\nLettre rédigée et signée par ${avocatNom}, Avocat au Barreau de ${avocatBarreau}\nwww.izy-visa.fr`
      : "\n\n---\nDocument généré par IZY Visa\nwww.izy-visa.fr";

    // Collect avocat info for C option
    const avocatNom2 = option === "C" ? dossier.avocat_nom : undefined;
    const avocatBarreau2 = option === "C" ? dossier.avocat_barreau : undefined;

    letter += footer;

    // Update dossier
    await supabase.from("dossiers").update({
      option_envoi: optionEnvoi,
      type_signataire: typeSignataire,
      lettre_neutre_contenu: dossier.lettre_neutre_contenu, // preserve neutral
      lrar_status: newStatus,
    }).eq("id", dossier_id);

    return new Response(JSON.stringify({
      letter_definitive: letter,
      option: option,
      option_envoi: optionEnvoi,
      type_signataire: typeSignataire,
      status: newStatus,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Finalize letter error:", error);
    if (error instanceof HttpError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
