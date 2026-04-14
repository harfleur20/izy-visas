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
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
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

    const email = String(body.email || "").trim().toLowerCase();
    const nom = String(body.nom || "").trim();
    const prenom = String(body.prenom || "").trim();
    const barreau = String(body.barreau || "").trim();
    const phone = String(body.phone || "").trim() || null;
    const specialites = normalizeSpecialites(body.specialites);
    const capaciteMax = Number.parseInt(String(body.capacite_max || "5"), 10);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Email avocat invalide");
    }

    if (!nom || !prenom || !barreau) {
      throw new HttpError(400, "Nom, prenom et barreau sont requis");
    }

    if (!Number.isFinite(capaciteMax) || capaciteMax < 1 || capaciteMax > 100) {
      throw new HttpError(400, "Capacite maximale invalide");
    }

    const { data: existingAvocat } = await supabaseAdmin
      .from("avocats_partenaires")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingAvocat) {
      throw new HttpError(409, "Un avocat partenaire existe deja avec cet email");
    }

    const { data: existingInvitation } = await supabaseAdmin
      .from("avocat_invitations")
      .select("id")
      .eq("email", email)
      .eq("revoked", false)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (existingInvitation) {
      throw new HttpError(409, "Une invitation active existe deja pour cet email");
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("avocat_invitations")
      .insert({
        email,
        nom,
        prenom,
        barreau,
        phone,
        specialites,
        capacite_max: capaciteMax,
        created_by: authContext.user.id,
      })
      .select("id, email, token, expires_at")
      .single();

    if (invitationError || !invitation) {
      throw new Error(invitationError?.message || "Impossible de creer l'invitation avocat");
    }

    const activationUrl = `${getAppBaseUrl(req)}/activate-avocat?token=${encodeURIComponent(invitation.token)}`;

    await logAudit(supabaseAdmin, req, {
      action_type: "creation_invitation_avocat",
      admin_id: authContext.user.id,
      admin_role: adminRole,
      cible_type: "avocat_invitation",
      cible_id: invitation.id,
      details: {
        email,
        nom,
        prenom,
        barreau,
        specialites,
        capacite_max: capaciteMax,
      },
    });

    return jsonResponse({
      success: true,
      invitation_id: invitation.id,
      activation_url: activationUrl,
      expires_at: invitation.expires_at,
      message: "Invitation avocat creee. Transmettez le lien d'activation a l'avocat.",
    });
  } catch (error) {
    console.error("[INVITE-AVOCAT] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
