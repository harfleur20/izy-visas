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
    const { target_user_id, invitation_id } = await req.json();

    if (!target_user_id && !invitation_id) {
      throw new HttpError(400, "target_user_id ou invitation_id requis");
    }

    if (invitation_id) {
      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from("admin_invitations")
        .select("id, email, role, used_at, revoked")
        .eq("id", invitation_id)
        .single();

      if (invitationError || !invitation) {
        throw new HttpError(404, "Invitation introuvable");
      }

      if (invitation.revoked) {
        throw new HttpError(409, "Invitation deja revoquee");
      }

      if (invitation.used_at) {
        throw new HttpError(409, "Invitation deja utilisee");
      }

      const { error: revokeInvitationError } = await supabaseAdmin
        .from("admin_invitations")
        .update({ revoked: true })
        .eq("id", invitation.id);

      if (revokeInvitationError) {
        throw new Error(revokeInvitationError.message);
      }

      await logAudit(supabaseAdmin, req, {
        action_type: "revocation_invitation_admin",
        admin_id: authContext.user.id,
        admin_role: "super_admin",
        cible_type: "invitation",
        cible_id: invitation.id,
        details: {
          email: invitation.email,
          role: invitation.role,
        },
      });

      return jsonResponse({
        success: true,
        message: "Invitation revoquee",
      });
    }

    const { data: targetRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", target_user_id);

    if (roleError || !targetRoles?.length) {
      throw new HttpError(404, "Utilisateur introuvable");
    }

    const adminRoles = targetRoles
      .map((row) => row.role)
      .filter((role): role is string => Boolean(role) && ["admin", "admin_delegue", "admin_juridique", "super_admin"].includes(role));

    if (!adminRoles.length) {
      throw new HttpError(400, "Utilisateur non admin");
    }

    if (adminRoles.includes("super_admin")) {
      throw new HttpError(403, "La revocation d'un super administrateur est interdite");
    }

    const { data: targetUserData } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
    const targetEmail = targetUserData?.user?.email || null;

    const { error: deleteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", target_user_id)
      .in("role", ["admin", "admin_delegue", "admin_juridique"]);

    if (deleteRoleError) {
      throw new Error(deleteRoleError.message);
    }

    await supabaseAdmin
      .from("profiles")
      .update({ actif: false })
      .eq("id", target_user_id);

    await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      ban_duration: "876000h",
    });

    if (targetEmail) {
      await supabaseAdmin
        .from("admin_invitations")
        .update({ revoked: true })
        .eq("email", targetEmail)
        .is("used_at", null);
    }

    await logAudit(supabaseAdmin, req, {
      action_type: "revocation_compte_admin",
      admin_id: authContext.user.id,
      admin_role: "super_admin",
      cible_type: "user",
      cible_id: target_user_id,
      details: {
        revoked_roles: adminRoles,
        target_email: targetEmail,
      },
    });

    return jsonResponse({
      success: true,
      message: "Compte administrateur revoque. Les acces ont ete supprimes.",
    });
  } catch (error) {
    console.error("[REVOKE-ADMIN] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
