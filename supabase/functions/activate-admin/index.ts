import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError } from "../_shared/security.ts";

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

function validateInvitation(
  invitation: {
    revoked: boolean;
    used_at: string | null;
    expires_at: string;
  } | null,
) {
  if (!invitation) {
    throw new HttpError(404, "Invitation introuvable");
  }

  if (invitation.revoked) {
    throw new HttpError(410, "Invitation revoquee");
  }

  if (invitation.used_at) {
    throw new HttpError(409, "Invitation deja utilisee");
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw new HttpError(410, "Invitation expiree");
  }
}

function validatePassword(password: string) {
  if (password.length < 12) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 12 caracteres");
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "preview");
    const token = String(body.token || "").trim();

    if (!token) {
      throw new HttpError(400, "Token d'invitation requis");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("admin_invitations")
      .select("id, email, role, nom, prenom, expires_at, used_at, revoked")
      .eq("token", token)
      .single();

    if (invitationError || !invitation) {
      throw new HttpError(404, "Invitation introuvable");
    }

    validateInvitation(invitation);

    if (action === "preview") {
      return jsonResponse({
        email: invitation.email,
        role: invitation.role,
        nom: invitation.nom,
        prenom: invitation.prenom,
        expires_at: invitation.expires_at,
      });
    }

    if (action !== "activate") {
      throw new HttpError(400, "Action invalide");
    }

    const password = String(body.password || "");
    validatePassword(password);

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: invitation.prenom || "",
        last_name: invitation.nom || "",
        invited_admin: true,
        skip_default_client_role: true,
      },
    });

    if (createUserError || !createdUser.user) {
      const authMessage = createUserError?.message || "Impossible de creer le compte";
      if (authMessage.toLowerCase().includes("already")) {
        throw new HttpError(409, "Un compte existe deja pour cette invitation. Demandez une nouvelle invitation ou connectez-vous.");
      }
      throw new Error(authMessage);
    }

    const userId = createdUser.user.id;

    await supabaseAdmin
      .from("profiles")
      .update({
        first_name: invitation.prenom || "",
        last_name: invitation.nom || "",
        actif: true,
      })
      .eq("id", userId);

    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "client");

    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: invitation.role,
      });

    if (roleInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(roleInsertError.message);
    }

    const { error: invitationUpdateError } = await supabaseAdmin
      .from("admin_invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (invitationUpdateError) {
      throw new Error(invitationUpdateError.message);
    }

    await logAudit(supabaseAdmin, req, {
      action_type: "activation_compte_admin",
      admin_id: userId,
      admin_role: invitation.role,
      cible_type: "invitation",
      cible_id: invitation.id,
      details: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return jsonResponse({
      success: true,
      email: invitation.email,
      role: invitation.role,
      user_id: userId,
      message: "Compte administrateur active",
    });
  } catch (error) {
    console.error("[ACTIVATE-ADMIN] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
