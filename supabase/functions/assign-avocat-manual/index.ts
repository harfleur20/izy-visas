import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MANAGER_ROLES = new Set(["super_admin", "admin_delegue"]);

type DossierRow = {
  id: string;
  dossier_ref: string;
  user_id: string;
  avocat_id: string | null;
  avocat_nom: string | null;
  avocat_prenom: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  visa_type: string | null;
  validation_juridique_status: string | null;
};

type AvocatRow = {
  id: string;
  user_id: string;
  nom: string;
  prenom: string;
  barreau: string;
  email: string;
  disponible: boolean;
  capacite_max: number;
  dossiers_en_cours: number;
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequestMetadata(req: Request) {
  return {
    adresse_ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown",
    user_agent: req.headers.get("user-agent") || "unknown",
  };
}

async function logAudit(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
  payload: {
    action_type: string;
    admin_id: string;
    admin_role: string;
    cible_type?: string;
    cible_id?: string;
    details?: Record<string, unknown>;
  },
) {
  const { adresse_ip, user_agent } = getRequestMetadata(req);
  await supabaseAdmin.from("audit_admin").insert({
    ...payload,
    details: payload.details ?? {},
    adresse_ip,
    user_agent,
  });
}

async function requireAvocatManager(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const authHeader = req.headers.get("Authorization");
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    },
  );

  const authContext = await requireAuthenticatedContext(req, supabaseAdmin, supabaseUser);
  const adminRole = authContext.roles.find((role) => MANAGER_ROLES.has(role));

  if (!adminRole) {
    throw new HttpError(403, "Acces reserve aux administrateurs habilites");
  }

  return { supabaseAdmin, authContext, adminRole };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabaseAdmin, authContext, adminRole } = await requireAvocatManager(req);
    const body = await req.json();
    const dossierId = String(body.dossier_id || "").trim();
    const avocatPartenaireId = String(body.avocat_partenaire_id || "").trim();
    const motif = String(body.motif || "Réassignation admin").trim();
    const note = String(body.note || "").trim() || null;

    if (!dossierId || !avocatPartenaireId) {
      throw new HttpError(400, "dossier_id et avocat_partenaire_id requis");
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .select("id, dossier_ref, user_id, avocat_id, avocat_nom, avocat_prenom, client_first_name, client_last_name, visa_type, validation_juridique_status")
      .eq("id", dossierId)
      .single();

    if (dossierError || !dossier) {
      throw new HttpError(404, "Dossier introuvable");
    }

    const typedDossier = dossier as DossierRow;

    const { data: avocat, error: avocatError } = await supabaseAdmin
      .from("avocats_partenaires")
      .select("id, user_id, nom, prenom, barreau, email, disponible, capacite_max, dossiers_en_cours")
      .eq("id", avocatPartenaireId)
      .single();

    if (avocatError || !avocat) {
      throw new HttpError(404, "Avocat partenaire introuvable");
    }

    const typedAvocat = avocat as AvocatRow;
    const sameAvocat = typedDossier.avocat_id === typedAvocat.user_id;

    if (!typedAvocat.disponible && !sameAvocat) {
      throw new HttpError(409, "Cet avocat n'est pas disponible");
    }

    if (!sameAvocat && typedAvocat.dossiers_en_cours >= typedAvocat.capacite_max) {
      throw new HttpError(409, "Cet avocat a atteint sa capacite maximale");
    }

    const previousAvocatUserId = typedDossier.avocat_id;
    const previousAvocatLabel = [typedDossier.avocat_prenom, typedDossier.avocat_nom].filter(Boolean).join(" ") || null;

    const shouldMarkForReview = !["validee_avocat", "validee_automatique", "bloquee"].includes(
      typedDossier.validation_juridique_status || "",
    );

    const dossierUpdate: Record<string, unknown> = {
      avocat_id: typedAvocat.user_id,
      avocat_nom: typedAvocat.nom,
      avocat_prenom: typedAvocat.prenom,
      avocat_barreau: typedAvocat.barreau,
    };

    if (shouldMarkForReview) {
      dossierUpdate.validation_juridique_status = "a_verifier_avocat";
    }

    const { error: updateDossierError } = await supabaseAdmin
      .from("dossiers")
      .update(dossierUpdate)
      .eq("id", typedDossier.id);

    if (updateDossierError) {
      throw new Error(updateDossierError.message);
    }

    if (!sameAvocat) {
      await supabaseAdmin
        .from("avocats_partenaires")
        .update({ dossiers_en_cours: typedAvocat.dossiers_en_cours + 1 })
        .eq("id", typedAvocat.id);

      if (previousAvocatUserId) {
        const { data: previousAvocat } = await supabaseAdmin
          .from("avocats_partenaires")
          .select("id, dossiers_en_cours")
          .eq("user_id", previousAvocatUserId)
          .maybeSingle();

        if (previousAvocat) {
          await supabaseAdmin
            .from("avocats_partenaires")
            .update({ dossiers_en_cours: Math.max(0, (previousAvocat.dossiers_en_cours || 0) - 1) })
            .eq("id", previousAvocat.id);
        }
      }
    }

    await supabaseAdmin.from("notifications").insert([
      {
        user_id: typedAvocat.user_id,
        titre: `Nouveau dossier assigne - ${typedDossier.dossier_ref}`,
        message: `Le dossier ${typedDossier.dossier_ref} vous a ete assigne par l'administration.`,
        type: "dossier",
      },
      {
        user_id: typedDossier.user_id,
        titre: `Avocat assigne - ${typedDossier.dossier_ref}`,
        message: `Me ${typedAvocat.prenom} ${typedAvocat.nom} a ete assigne a votre dossier.`,
        type: "info",
      },
    ]);

    await logAudit(supabaseAdmin, req, {
      action_type: previousAvocatUserId ? "reassignation_avocat_dossier" : "assignation_avocat_dossier",
      admin_id: authContext.user.id,
      admin_role: adminRole,
      cible_type: "dossier",
      cible_id: typedDossier.id,
      details: {
        dossier_ref: typedDossier.dossier_ref,
        motif,
        note,
        previous_avocat_user_id: previousAvocatUserId,
        previous_avocat_label: previousAvocatLabel,
        new_avocat_user_id: typedAvocat.user_id,
        new_avocat_label: `Me ${typedAvocat.prenom} ${typedAvocat.nom}`,
      },
    });

    return jsonResponse({
      success: true,
      dossier_id: typedDossier.id,
      dossier_ref: typedDossier.dossier_ref,
      avocat_id: typedAvocat.user_id,
      avocat_nom: typedAvocat.nom,
      avocat_prenom: typedAvocat.prenom,
      avocat_barreau: typedAvocat.barreau,
      message: `Dossier assigne a Me ${typedAvocat.prenom} ${typedAvocat.nom}`,
    });
  } catch (error) {
    console.error("[ASSIGN-AVOCAT-MANUAL] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
