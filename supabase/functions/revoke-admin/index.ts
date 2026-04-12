import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only super_admin can revoke
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès réservé au super administrateur" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target user's role before revoking
    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", target_user_id)
      .single();

    if (!targetRole || !["admin_delegue", "admin_juridique"].includes(targetRole.role)) {
      return new Response(JSON.stringify({ error: "Utilisateur non admin ou introuvable" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Delete user role (demote to no admin access)
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", target_user_id);

    // 2. Disable the user account (ban)
    await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      ban_duration: "876000h", // ~100 years
    });

    // 3. Revoke all invitations for this email
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
    if (targetUser?.user?.email) {
      await supabaseAdmin
        .from("admin_invitations")
        .update({ revoked: true })
        .eq("email", targetUser.user.email);
    }

    // 4. Log the revocation
    await supabaseAdmin.from("audit_admin").insert({
      action_type: "revocation_compte_admin",
      admin_id: user.id,
      admin_role: "super_admin",
      cible_type: "user",
      cible_id: target_user_id,
      details: {
        revoked_role: targetRole.role,
        target_email: targetUser?.user?.email,
      },
      adresse_ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Compte admin révoqué. Sessions invalidées.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
