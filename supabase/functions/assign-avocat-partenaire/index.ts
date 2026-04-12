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

    const { dossier_id } = await req.json();

    if (!dossier_id) {
      return new Response(JSON.stringify({ error: "dossier_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch dossier
    const { data: dossier, error: dossierErr } = await supabase
      .from("dossiers").select("*").eq("id", dossier_id).single();

    if (dossierErr || !dossier) {
      return new Response(JSON.stringify({ error: "Dossier introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    assertDossierAccess(authContext, dossier);

    // Find available avocat
    const { data: avocats, error: avocatsErr } = await supabase
      .from("avocats_partenaires")
      .select("*")
      .eq("disponible", true)
      .order("delai_moyen_jours", { ascending: true });

    if (avocatsErr || !avocats || avocats.length === 0) {
      // Alert admin
      await supabase.from("admin_tasks").insert({
        user_id: dossier.user_id,
        dossier_ref: dossier.dossier_ref,
        client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
        task_type: "alerte_avocat_indisponible",
        description: `⚠️ Aucun avocat disponible pour IZY-${dossier.dossier_ref}. Assignation manuelle requise.`,
        statut: "urgente",
      });

      return new Response(JSON.stringify({
        error: "Aucun avocat partenaire disponible",
        code: "NO_AVOCAT_AVAILABLE",
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Select best match: capacity available + matching speciality
    const visaType = dossier.visa_type || "";
    let selectedAvocat = avocats.find((a) => {
      const hasCapacity = a.dossiers_en_cours < a.capacite_max;
      const matchSpec = (a.specialites || []).some((s: string) =>
        s.toLowerCase().includes(visaType.toLowerCase()) || s === "tous"
      );
      return hasCapacity && matchSpec;
    });

    // Fallback: any with capacity
    if (!selectedAvocat) {
      selectedAvocat = avocats.find((a) => a.dossiers_en_cours < a.capacite_max);
    }

    if (!selectedAvocat) {
      await supabase.from("admin_tasks").insert({
        user_id: dossier.user_id,
        dossier_ref: dossier.dossier_ref,
        client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
        task_type: "alerte_avocat_indisponible",
        description: `⚠️ Tous les avocats partenaires sont à capacité maximale pour ${dossier.dossier_ref}.`,
        statut: "urgente",
      });

      return new Response(JSON.stringify({
        error: "Aucun avocat partenaire disponible",
        code: "NO_AVOCAT_AVAILABLE",
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Assign avocat to dossier
    await supabase.from("dossiers").update({
      avocat_id: selectedAvocat.user_id,
      avocat_nom: selectedAvocat.nom,
      avocat_prenom: selectedAvocat.prenom,
      avocat_barreau: selectedAvocat.barreau,
    }).eq("id", dossier_id);

    // Increment dossiers_en_cours
    await supabase.from("avocats_partenaires").update({
      dossiers_en_cours: (selectedAvocat.dossiers_en_cours || 0) + 1,
    }).eq("id", selectedAvocat.id);

    // Notify avocat
    await supabase.from("notifications").insert({
      user_id: selectedAvocat.user_id,
      titre: `⚖️ Nouveau dossier — ${dossier.dossier_ref}`,
      message: `Nouveau dossier assigné : ${dossier.dossier_ref}. Type visa : ${dossier.visa_type}. Motifs : ${(dossier.motifs_refus || []).join(", ")}. Consultez votre espace IZY.`,
      type: "dossier",
    });

    // Notify client
    await supabase.from("notifications").insert({
      user_id: dossier.user_id,
      titre: `⚖️ Avocat assigné — ${dossier.dossier_ref}`,
      message: `Me ${selectedAvocat.prenom} ${selectedAvocat.nom} a été assigné à votre dossier. Relecture sous 48 heures.`,
      type: "info",
    });

    console.log(`[ASSIGN-AVOCAT] ${selectedAvocat.prenom} ${selectedAvocat.nom} → ${dossier.dossier_ref}`);

    return new Response(JSON.stringify({
      avocat_id: selectedAvocat.user_id,
      nom: selectedAvocat.nom,
      prenom: selectedAvocat.prenom,
      barreau: selectedAvocat.barreau,
      email: selectedAvocat.email,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Assign avocat error:", error);
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
