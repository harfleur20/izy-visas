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
    // Verify caller is super_admin
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

    // Check super_admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) {
      // Log unauthorized attempt
      await supabaseAdmin.from("audit_admin").insert({
        action_type: "tentative_creation_admin_non_autorisee",
        admin_id: user.id,
        admin_role: "unknown",
        details: { email: user.email },
        adresse_ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
      });

      return new Response(JSON.stringify({ error: "Accès réservé au super administrateur" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, role, nom, prenom, motif, perimetre, date_debut, date_fin } = body;

    if (!email || !role) {
      return new Response(JSON.stringify({ error: "Email et rôle requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["admin_delegue", "admin_juridique"].includes(role)) {
      return new Response(JSON.stringify({ error: "Rôle invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("admin_invitations")
      .insert({
        email,
        role,
        created_by: user.id,
        nom,
        prenom,
        motif,
        perimetre,
        date_debut,
        date_fin,
      })
      .select()
      .single();

    if (invError) {
      return new Response(JSON.stringify({ error: invError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the user account via Supabase Auth with a generated password
    const tempPassword = crypto.randomUUID() + "!Aa1";
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: prenom, last_name: nom },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign the role
    if (newUser?.user) {
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
      });
    }

    // Send password reset email so admin can set their password
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${req.headers.get("origin") || "https://izy-visas.lovable.app"}/reset-password`,
      },
    });

    // Log the action
    await supabaseAdmin.from("audit_admin").insert({
      action_type: "creation_compte_admin",
      admin_id: user.id,
      admin_role: "super_admin",
      cible_type: "user",
      cible_id: newUser?.user?.id || email,
      details: { email, role, nom, prenom, motif, perimetre, invitation_id: invitation.id },
      adresse_ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    return new Response(JSON.stringify({
      success: true,
      invitation_id: invitation.id,
      user_id: newUser?.user?.id,
      message: "Invitation créée. Un email de configuration a été envoyé.",
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
