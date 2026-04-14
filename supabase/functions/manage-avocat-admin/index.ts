import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MANAGER_ROLES = new Set(["super_admin", "admin_delegue"]);

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

function getAppBaseUrl(req: Request) {
  return Deno.env.get("APP_BASE_URL")?.trim()
    || req.headers.get("origin")?.trim()
    || "https://izy-visas.lovable.app";
}

function normalizeSpecialites(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
    const action = String(body.action || "").trim();

    if (action === "update_avocat") {
      const avocatId = String(body.avocat_id || "").trim();
      if (!avocatId) throw new HttpError(400, "avocat_id requis");

      const capaciteMax = Number.parseInt(String(body.capacite_max || ""), 10);
      const delaiMoyenJours = Number.parseInt(String(body.delai_moyen_jours || ""), 10);
      const specialites = normalizeSpecialites(body.specialites);

      if (!Number.isFinite(capaciteMax) || capaciteMax < 1 || capaciteMax > 100) {
        throw new HttpError(400, "Capacite maximale invalide");
      }

      if (!Number.isFinite(delaiMoyenJours) || delaiMoyenJours < 1 || delaiMoyenJours > 30) {
        throw new HttpError(400, "Delai moyen invalide");
      }

      const updatePayload = {
        capacite_max: capaciteMax,
        delai_moyen_jours: delaiMoyenJours,
        specialites,
      };

      const { data: avocat, error } = await supabaseAdmin
        .from("avocats_partenaires")
        .update(updatePayload)
        .eq("id", avocatId)
        .select("id, user_id, email, nom, prenom, capacite_max, delai_moyen_jours, specialites")
        .single();

      if (error || !avocat) {
        throw new Error(error?.message || "Mise a jour avocat impossible");
      }

      await logAudit(supabaseAdmin, req, {
        action_type: "mise_a_jour_avocat_partenaire",
        admin_id: authContext.user.id,
        admin_role: adminRole,
        cible_type: "avocat_partenaire",
        cible_id: avocat.id,
        details: { avocat, update: updatePayload },
      });

      return jsonResponse({ success: true, avocat, message: "Profil avocat mis a jour" });
    }

    if (action === "toggle_avocat") {
      const avocatId = String(body.avocat_id || "").trim();
      const disponible = Boolean(body.disponible);
      if (!avocatId) throw new HttpError(400, "avocat_id requis");

      const { data: avocat, error } = await supabaseAdmin
        .from("avocats_partenaires")
        .update({ disponible })
        .eq("id", avocatId)
        .select("id, user_id, email, nom, prenom, disponible")
        .single();

      if (error || !avocat) {
        throw new Error(error?.message || "Changement de disponibilite impossible");
      }

      await logAudit(supabaseAdmin, req, {
        action_type: disponible ? "reactivation_avocat_partenaire" : "suspension_avocat_partenaire",
        admin_id: authContext.user.id,
        admin_role: adminRole,
        cible_type: "avocat_partenaire",
        cible_id: avocat.id,
        details: { avocat },
      });

      await supabaseAdmin.from("notifications").insert({
        user_id: avocat.user_id,
        titre: disponible ? "Compte avocat reactive" : "Compte avocat suspendu",
        message: disponible
          ? "Votre compte avocat partenaire est de nouveau disponible pour recevoir des dossiers."
          : "Votre compte avocat partenaire a ete suspendu par l'administration.",
        type: "admin",
      });

      return jsonResponse({
        success: true,
        avocat,
        message: disponible ? "Avocat reactive" : "Avocat suspendu",
      });
    }

    if (action === "revoke_invitation") {
      const invitationId = String(body.invitation_id || "").trim();
      if (!invitationId) throw new HttpError(400, "invitation_id requis");

      const { data: invitation, error } = await supabaseAdmin
        .from("avocat_invitations")
        .update({ revoked: true })
        .eq("id", invitationId)
        .is("used_at", null)
        .select("id, email, nom, prenom, revoked")
        .single();

      if (error || !invitation) {
        throw new Error(error?.message || "Revocation impossible");
      }

      await logAudit(supabaseAdmin, req, {
        action_type: "revocation_invitation_avocat",
        admin_id: authContext.user.id,
        admin_role: adminRole,
        cible_type: "avocat_invitation",
        cible_id: invitation.id,
        details: { invitation },
      });

      return jsonResponse({ success: true, invitation, message: "Invitation avocat revoquee" });
    }

    if (action === "renew_invitation") {
      const invitationId = String(body.invitation_id || "").trim();
      if (!invitationId) throw new HttpError(400, "invitation_id requis");

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error } = await supabaseAdmin
        .from("avocat_invitations")
        .update({ expires_at: expiresAt, revoked: false })
        .eq("id", invitationId)
        .is("used_at", null)
        .select("id, email, nom, prenom, token, expires_at")
        .single();

      if (error || !invitation) {
        throw new Error(error?.message || "Prolongation impossible");
      }

      const activationUrl = `${getAppBaseUrl(req)}/activate-avocat?token=${encodeURIComponent(invitation.token)}`;

      await logAudit(supabaseAdmin, req, {
        action_type: "prolongation_invitation_avocat",
        admin_id: authContext.user.id,
        admin_role: adminRole,
        cible_type: "avocat_invitation",
        cible_id: invitation.id,
        details: { email: invitation.email, expires_at: invitation.expires_at },
      });

      return jsonResponse({
        success: true,
        invitation,
        activation_url: activationUrl,
        message: "Invitation prolongee de 7 jours",
      });
    }

    throw new HttpError(400, "Action inconnue");
  } catch (error) {
    console.error("[MANAGE-AVOCAT-ADMIN] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
