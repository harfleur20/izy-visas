import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function getAppBaseUrl(req: Request) {
  return Deno.env.get("APP_BASE_URL")?.trim()
    || req.headers.get("origin")?.trim()
    || "https://izy-visas.lovable.app";
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

async function requireSuperAdmin(req: Request) {
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

  if (!authContext.roles.includes("super_admin")) {
    await logAudit(supabaseAdmin, req, {
      action_type: "tentative_creation_admin_non_autorisee",
      admin_id: authContext.user.id,
      admin_role: authContext.roles[0] || "unknown",
      details: { email: authContext.user.email || null },
    });

    throw new HttpError(403, "Acces reserve au super administrateur");
  }

  return { supabaseAdmin, authContext };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabaseAdmin, authContext } = await requireSuperAdmin(req);
    const body = await req.json();

    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "").trim();
    const nom = String(body.nom || "").trim() || null;
    const prenom = String(body.prenom || "").trim() || null;
    const motif = String(body.motif || "").trim() || null;
    const perimetre = String(body.perimetre || "").trim() || null;
    const date_debut = String(body.date_debut || "").trim() || null;
    const date_fin = String(body.date_fin || "").trim() || null;

    if (!email || !role) {
      throw new HttpError(400, "Email et role requis");
    }

    if (!["super_admin", "admin_delegue", "admin_juridique"].includes(role)) {
      throw new HttpError(400, "Role invalide");
    }

    if (!date_debut) {
      throw new HttpError(400, "La date de debut est obligatoire");
    }

    if (date_debut && date_fin && date_fin < date_debut) {
      throw new HttpError(400, "La date de fin doit etre posterieure a la date de debut");
    }

    const { data: existingInvitation } = await supabaseAdmin
      .from("admin_invitations")
      .select("id, used_at, revoked, expires_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInvitation) {
      const isActive = !existingInvitation.revoked
        && !existingInvitation.used_at
        && new Date(existingInvitation.expires_at).getTime() > Date.now();
      if (isActive) {
        throw new HttpError(409, "Une invitation active existe deja pour cet email");
      }
      if (existingInvitation.used_at) {
        throw new HttpError(409, "Cet email a deja ete utilise pour activer un compte administrateur");
      }
    }

    // Check if an admin user already exists with this email
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existingUser = usersList?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (existingUser) {
      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", existingUser.id);
      const hasAdminRole = (existingRoles || []).some((r) =>
        ["super_admin", "admin_delegue", "admin_juridique"].includes(r.role as string),
      );
      if (hasAdminRole) {
        throw new HttpError(409, "Un compte administrateur existe deja pour cet email");
      }
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("admin_invitations")
      .insert({
        email,
        role,
        created_by: authContext.user.id,
        nom,
        prenom,
        motif,
        perimetre,
        date_debut,
        date_fin,
      })
      .select("id, email, role, token, expires_at")
      .single();

    if (invitationError || !invitation) {
      throw new Error(invitationError?.message || "Impossible de creer l'invitation");
    }

    const activationUrl = `${getAppBaseUrl(req)}/activate-admin?token=${encodeURIComponent(invitation.token)}`;

    await logAudit(supabaseAdmin, req, {
      action_type: "creation_invitation_admin",
      admin_id: authContext.user.id,
      admin_role: "super_admin",
      cible_type: "invitation",
      cible_id: invitation.id,
      details: {
        email,
        role,
        nom,
        prenom,
        motif,
        perimetre,
        date_debut,
        date_fin,
      },
    });

    return jsonResponse({
      success: true,
      invitation_id: invitation.id,
      activation_url: activationUrl,
      expires_at: invitation.expires_at,
      message: "Invitation creee. Copiez le lien d'activation et transmettez-le au futur administrateur.",
    });
  } catch (error) {
    console.error("[INVITE-ADMIN] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
