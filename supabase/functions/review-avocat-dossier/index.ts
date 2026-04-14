import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type DossierRow = {
  id: string;
  dossier_ref: string;
  user_id: string;
  avocat_id: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  lrar_status: string | null;
  validation_juridique_status: string | null;
  lettre_neutre_contenu: string | null;
};

type ReviewChecklist = Partial<Record<
  | "adresse_crrv"
  | "delai_30j"
  | "arguments_refs"
  | "inventaire_pieces"
  | "signataire_qualifie"
  | "redige_francais"
  | "references_verifiees",
  boolean
>>;

const CHECKLIST_KEYS: Array<keyof ReviewChecklist> = [
  "adresse_crrv",
  "delai_30j",
  "arguments_refs",
  "inventaire_pieces",
  "signataire_qualifie",
  "redige_francais",
  "references_verifiees",
];

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

function assertChecklistComplete(checklist: unknown) {
  const data = (checklist || {}) as ReviewChecklist;
  const missing = CHECKLIST_KEYS.filter((key) => data[key] !== true);

  if (missing.length > 0) {
    throw new HttpError(400, "Checklist avocat incomplete");
  }
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
    actor_id: string;
    actor_role: string;
    cible_type?: string;
    cible_id?: string;
    details?: Record<string, unknown>;
  },
) {
  const { adresse_ip, user_agent } = getRequestMetadata(req);
  await supabaseAdmin.from("audit_admin").insert({
    action_type: payload.action_type,
    admin_id: payload.actor_id,
    admin_role: payload.actor_role,
    cible_type: payload.cible_type,
    cible_id: payload.cible_id,
    details: payload.details ?? {},
    adresse_ip,
    user_agent,
  });
}

async function requireAvocat(req: Request) {
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

  if (!authContext.roles.includes("avocat")) {
    throw new HttpError(403, "Acces reserve aux avocats");
  }

  return { supabaseAdmin, authContext };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabaseAdmin, authContext } = await requireAvocat(req);
    const body = await req.json();
    const dossierId = String(body.dossier_id || "").trim();
    const action = String(body.action || "").trim();
    const note = String(body.note || "").trim();
    const checklist = body.checklist;

    if (!dossierId) throw new HttpError(400, "dossier_id requis");
    if (!["validate", "block"].includes(action)) throw new HttpError(400, "Action inconnue");
    if (action === "block" && note.length < 8) {
      throw new HttpError(400, "Une note de correction est requise pour bloquer le dossier");
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .select("id, dossier_ref, user_id, avocat_id, client_first_name, client_last_name, lrar_status, validation_juridique_status, lettre_neutre_contenu")
      .eq("id", dossierId)
      .single();

    if (dossierError || !dossier) throw new HttpError(404, "Dossier introuvable");

    const typedDossier = dossier as DossierRow;
    if (typedDossier.avocat_id !== authContext.user.id) {
      throw new HttpError(403, "Ce dossier n'est pas assigne a cet avocat");
    }

    if (typedDossier.validation_juridique_status !== "a_verifier_avocat") {
      throw new HttpError(409, "Ce dossier n'est pas en attente de validation avocat");
    }

    if (!typedDossier.lettre_neutre_contenu) {
      throw new HttpError(409, "Lettre de recours absente. Generez la lettre avant validation");
    }

    if (action === "validate") {
      assertChecklistComplete(checklist);
    }

    const wasOpen = !["validee_avocat", "bloquee"].includes(typedDossier.validation_juridique_status || "");
    const nextStatus = action === "validate" ? "validee_avocat" : "bloquee";
    const nextLrarStatus = action === "validate" ? "lettre_finalisee" : "validation_avocat_bloquee";

    const { error: updateError } = await supabaseAdmin
      .from("dossiers")
      .update({
        validation_juridique_status: nextStatus,
        validation_juridique_mode: "manuelle_avocat",
        validation_juridique_note: note || null,
        date_validation_juridique: new Date().toISOString(),
        lrar_status: nextLrarStatus,
      })
      .eq("id", typedDossier.id);

    if (updateError) throw new Error(updateError.message);

    if (wasOpen) {
      const { data: avocatProfile } = await supabaseAdmin
        .from("avocats_partenaires")
        .select("id, dossiers_en_cours")
        .eq("user_id", authContext.user.id)
        .maybeSingle();

      if (avocatProfile) {
        await supabaseAdmin
          .from("avocats_partenaires")
          .update({ dossiers_en_cours: Math.max(0, (avocatProfile.dossiers_en_cours || 0) - 1) })
          .eq("id", avocatProfile.id);
      }
    }

    const clientName = [typedDossier.client_first_name, typedDossier.client_last_name].filter(Boolean).join(" ") || "votre dossier";
    await supabaseAdmin.from("notifications").insert({
      user_id: typedDossier.user_id,
      titre: action === "validate"
        ? `Relecture avocat validee - ${typedDossier.dossier_ref}`
        : `Corrections requises - ${typedDossier.dossier_ref}`,
      message: action === "validate"
        ? `La relecture avocat du dossier ${typedDossier.dossier_ref} est validee. Vous pouvez poursuivre l'envoi LRAR.`
        : `La relecture avocat du dossier ${typedDossier.dossier_ref} demande des corrections: ${note}`,
      type: action === "validate" ? "dossier" : "alert",
      lien: "/client",
    });

    await logAudit(supabaseAdmin, req, {
      action_type: action === "validate" ? "validation_avocat_dossier" : "blocage_avocat_dossier",
      actor_id: authContext.user.id,
      actor_role: "avocat",
      cible_type: "dossier",
      cible_id: typedDossier.id,
      details: {
        dossier_ref: typedDossier.dossier_ref,
        client: clientName,
        previous_status: typedDossier.validation_juridique_status,
        next_status: nextStatus,
        note: note || null,
      },
    });

    return jsonResponse({
      success: true,
      dossier_id: typedDossier.id,
      dossier_ref: typedDossier.dossier_ref,
      validation_juridique_status: nextStatus,
      lrar_status: nextLrarStatus,
      message: action === "validate"
        ? "Dossier valide. Le client peut poursuivre l'envoi LRAR."
        : "Dossier bloque et renvoye au client pour correction.",
    });
  } catch (error) {
    console.error("[REVIEW-AVOCAT-DOSSIER] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
