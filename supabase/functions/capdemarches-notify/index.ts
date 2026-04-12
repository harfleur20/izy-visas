import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";
import type { AuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-webhook-secret, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ExpiringDossier = {
  id: string;
  dossier_ref: string;
  client_last_name: string | null;
  client_first_name: string | null;
  procuration_expiration: string | null;
  user_id: string | null;
};

async function notifyCapdemarchesEndpoint(payload: Record<string, unknown>): Promise<{ sent: boolean; reason?: string }> {
  const endpoint = Deno.env.get("CAPDEMARCHES_NOTIFY_URL");
  if (!endpoint) return { sent: false, reason: "CAPDEMARCHES_NOTIFY_URL not configured" };

  const secret = Deno.env.get("CAPDEMARCHES_WEBHOOK_SECRET");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { sent: false, reason: await res.text() };
  }

  return { sent: true };
}

function hasServerSecret(req: Request): boolean {
  const expectedSecret = Deno.env.get("CAPDEMARCHES_WEBHOOK_SECRET");
  if (!expectedSecret) return false;

  const auth = req.headers.get("Authorization");
  const headerSecret = req.headers.get("x-webhook-secret");
  return auth === `Bearer ${expectedSecret}` || headerSecret === expectedSecret;
}

function requirePrivilegedOrSecret(req: Request, authContext: AuthenticatedContext | null) {
  if (authContext?.isPrivileged || hasServerSecret(req)) {
    return;
  }

  throw new HttpError(403, "Acces admin requis");
}

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
    const serverSecretOk = hasServerSecret(req);
    const authContext = authHeader && !serverSecretOk
      ? await requireAuthenticatedContext(req, supabase, supabaseUser)
      : null;

    const { action, dossier_id, dossier_ref: inputDossierRef } = await req.json();

    if (action === "notify_capdemarches") {
      // After procuration is signed, send notification to CAPDEMARCHES
      const { data: dossier, error: dossierErr } = await supabase
        .from("dossiers")
        .select("*")
        .eq("id", dossier_id)
        .single();

      if (dossierErr || !dossier) {
        return new Response(JSON.stringify({ error: "Dossier not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (authContext) {
        assertDossierAccess(authContext, dossier);
      } else if (!hasServerSecret(req)) {
        throw new HttpError(401, "Non authentifie");
      }

      const notification = {
        to: "contact@capdemarches.fr",
        subject: `Nouvelle procuration — ${dossier.client_last_name} ${dossier.client_first_name} — ${dossier.dossier_ref}`,
        body: `Bonjour,

Veuillez trouver ci-joint la procuration signée électroniquement par ${dossier.client_last_name} ${dossier.client_first_name} vous autorisant à réceptionner son courrier officiel dans le cadre de son recours visa ${dossier.dossier_ref}.

Le courrier attendu provient de la CRRV ou du Sous-directeur des visas — BP 83609 — 44036 Nantes Cedex 01.

Merci de notifier IZY dès réception à l'adresse ops@izy-visa.fr

Cordialement,
L'équipe IZY Visa`,
        pdf_url: dossier.url_procuration_pdf,
      };

      const outbound = await notifyCapdemarchesEndpoint({
        action: "nouvelle_procuration",
        dossier_ref: dossier.dossier_ref,
        client_first_name: dossier.client_first_name,
        client_last_name: dossier.client_last_name,
        client_email: dossier.client_email,
        procuration_signed_at: dossier.date_signature_procuration,
        procuration_expires_at: dossier.procuration_expiration,
        notification,
      });

      await supabase.from("notifications").insert({
        user_id: dossier.user_id,
        titre: `Procuration transmise — ${dossier.dossier_ref}`,
        message: outbound.sent
          ? "La procuration CAPDEMARCHES a été transmise automatiquement."
          : "La procuration CAPDEMARCHES est prête. Transmission externe à vérifier par l'équipe.",
        type: outbound.sent ? "info" : "alerte",
        lien: "/client",
      });

      if (!outbound.sent) {
        await supabase.from("admin_tasks").insert({
          task_type: "capdemarches_notification_a_envoyer",
          dossier_ref: dossier.dossier_ref,
          client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
          user_id: dossier.user_id,
          description: `Notification CAPDEMARCHES à vérifier/envoyer manuellement. Cause: ${outbound.reason}`,
          statut: "en_attente",
        });
      }

      return new Response(JSON.stringify({
        success: true,
        notification,
        outbound,
        message: outbound.sent ? "Notification CAPDEMARCHES transmise" : "Notification CAPDEMARCHES préparée avec tâche de suivi",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "check_renewals") {
      requirePrivilegedOrSecret(req, authContext);

      // Check for procurations expiring in 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data: expiring } = await supabase
        .from("dossiers")
        .select("id, dossier_ref, client_last_name, client_first_name, procuration_expiration, user_id")
        .eq("procuration_active", true)
        .lte("procuration_expiration", thirtyDaysFromNow.toISOString().split("T")[0]);

      const today = new Date().toISOString().split("T")[0];
      const expired: ExpiringDossier[] = [];
      const expiringSoon: ExpiringDossier[] = [];

      for (const d of expiring || []) {
        if (d.procuration_expiration && d.procuration_expiration <= today) {
          expired.push(d);
          // Mark as inactive
          await supabase
            .from("dossiers")
            .update({ procuration_active: false })
            .eq("id", d.id);
        } else {
          expiringSoon.push(d);
        }
      }

      // Create admin tasks for expired
      for (const d of expired) {
        await supabase.from("admin_tasks").insert({
          task_type: "procuration_expiree",
          dossier_ref: d.dossier_ref,
          client_name: `${d.client_last_name} ${d.client_first_name}`,
          user_id: d.user_id,
          description: `Procuration expirée — ${d.dossier_ref} — Action requise`,
          statut: "en_attente",
        });
      }

      return new Response(JSON.stringify({
        expired: expired.length,
        expiring_soon: expiringSoon.length,
        details: { expired, expiringSoon },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "remind_procuration") {
      requirePrivilegedOrSecret(req, authContext);

      const { data: dossier } = await supabase
        .from("dossiers")
        .select("id, dossier_ref, client_last_name, client_first_name, client_phone, client_email, user_id")
        .eq("dossier_ref", inputDossierRef)
        .single();

      if (!dossier) {
        return new Response(JSON.stringify({ error: "Dossier not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log the reminder in admin tasks
      await supabase.from("admin_tasks").insert({
        task_type: "rappel_procuration",
        dossier_ref: dossier.dossier_ref,
        client_name: `${dossier.client_last_name} ${dossier.client_first_name}`,
        user_id: dossier.user_id,
        description: `Rappel envoyé au client pour signer sa procuration CAPDEMARCHES`,
        statut: "termine",
      });

      await supabase.from("notifications").insert({
        user_id: dossier.user_id,
        titre: `Signature de procuration requise — ${dossier.dossier_ref}`,
        message: `Bonjour ${dossier.client_first_name}, votre procuration CAPDEMARCHES n'est pas encore signée. Connectez-vous à votre espace IZY Visa pour la signer.`,
        type: "alerte",
        lien: "/client",
      });

      return new Response(JSON.stringify({
        success: true,
        message: "Rappel envoyé au client",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "check_overdue_tasks") {
      requirePrivilegedOrSecret(req, authContext);

      // Check for tasks past deadline
      const now = new Date().toISOString();
      const { data: overdue } = await supabase
        .from("admin_tasks")
        .select("*")
        .eq("statut", "en_attente")
        .lt("deadline", now);

      for (const task of overdue || []) {
        await supabase
          .from("admin_tasks")
          .update({ statut: "en_retard" })
          .eq("id", task.id);
      }

      return new Response(JSON.stringify({
        overdue_count: overdue?.length || 0,
        tasks: overdue,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CAPDEMARCHES notify error:", error);
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
