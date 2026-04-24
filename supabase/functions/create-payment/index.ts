import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";
import { assertPaymentPrerequisites, PAYMENT_DOSSIER_SELECT } from "../_shared/payment_prerequisites.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAppBaseUrl(req: Request): string {
  const configuredBaseUrl = Deno.env.get("APP_BASE_URL")?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    throw new Error("APP_BASE_URL not configured and request origin missing");
  }

  const parsedOrigin = new URL(origin);
  return `${parsedOrigin.protocol}//${parsedOrigin.host}`;
}

type SendOption = "A" | "B" | "C";

type Tarification = {
  generation_lettre_eur?: number | null;
  envoi_mysendingbox_eur?: number | null;
  honoraires_avocat_eur?: number | null;
};

const OPTION_LABELS: Record<SendOption, string> = {
  A: "Téléchargement direct",
  B: "Envoi MySendingBox automatique",
  C: "Relecture avocat, signature et envoi",
};

function assertSendOption(option: unknown): asserts option is SendOption {
  if (option !== "A" && option !== "B" && option !== "C") {
    throw new HttpError(400, "option must be A, B or C");
  }
}

function eurToCents(value: number): number {
  return Math.round(value * 100);
}

function getPriceBreakdown(option: SendOption, tarifs: Tarification | null) {
  const generationLettre = Number(tarifs?.generation_lettre_eur ?? 49);
  const envoiMysendingbox = Number(tarifs?.envoi_mysendingbox_eur ?? 30);
  const honorairesAvocat = Number(tarifs?.honoraires_avocat_eur ?? 70);

  const breakdown = {
    generation_lettre_eur: generationLettre,
    envoi_mysendingbox_eur: option === "A" ? 0 : envoiMysendingbox,
    honoraires_avocat_eur: option === "C" ? honorairesAvocat : 0,
  };
  const totalEur =
    breakdown.generation_lettre_eur +
    breakdown.envoi_mysendingbox_eur +
    breakdown.honoraires_avocat_eur;

  return {
    ...breakdown,
    total_eur: totalEur,
    total_cents: eurToCents(totalEur),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      }
    );
    const authContext = await requireAuthenticatedContext(req, supabaseAdmin, supabaseUser);
    if (!authContext.user.email) throw new Error("User not authenticated or email not available");

    const body = await req.json();
    const { action, session_id, dossier_ref, option, from_tunnel } = body;

    if (action === "confirm_session") {
      if (!session_id || typeof session_id !== "string") {
        throw new HttpError(400, "session_id is required");
      }

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== "paid") {
        throw new HttpError(409, "Paiement Stripe non confirme.");
      }

      const sessionUserId = session.metadata?.user_id;
      const sessionDossierRef = session.metadata?.dossier_ref;
      const sessionOption = session.metadata?.option;

      if (sessionUserId !== authContext.user.id || !sessionDossierRef) {
        throw new HttpError(403, "Session Stripe non autorisee.");
      }

      const { error: paymentUpdateError } = await supabaseAdmin
        .from("payments")
        .update({
          status: "paid",
          stripe_payment_intent_id: session.payment_intent as string,
          verified_by_webhook: true,
        })
        .eq("stripe_session_id", session.id)
        .eq("user_id", authContext.user.id);

      if (paymentUpdateError) throw paymentUpdateError;

      const { error: dossierUpdateError } = await supabaseAdmin
        .from("dossiers")
        .update({
          lrar_status: "paiement_confirme",
          ...(sessionOption ? { option_choisie: sessionOption } : {}),
        })
        .eq("dossier_ref", sessionDossierRef)
        .eq("user_id", authContext.user.id);

      if (dossierUpdateError) throw dossierUpdateError;

      return new Response(JSON.stringify({
        confirmed: true,
        dossier_ref: sessionDossierRef,
        option: sessionOption,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!dossier_ref) throw new Error("dossier_ref is required");
    assertSendOption(option);

    // Fetch dossier and verify ownership
    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .select(PAYMENT_DOSSIER_SELECT)
      .eq("dossier_ref", dossier_ref)
      .single();

    if (dossierError || !dossier) throw new Error("Dossier introuvable: " + dossier_ref);
    assertDossierAccess(authContext, dossier);
    await assertPaymentPrerequisites(supabaseAdmin, dossier, option, { fromTunnel: from_tunnel === true });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check existing customer after local prerequisites pass.
    const customers = await stripe.customers.list({ email: authContext.user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const { data: tarifs } = await supabaseAdmin
      .from("tarification")
      .select("generation_lettre_eur, envoi_mysendingbox_eur, honoraires_avocat_eur")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const price = getPriceBreakdown(option, tarifs);
    const appBaseUrl = getAppBaseUrl(req);

    await supabaseAdmin
      .from("dossiers")
      .update({
        option_choisie: option,
        lrar_status: "paiement_en_attente",
      })
      .eq("dossier_ref", dossier_ref)
      .eq("user_id", authContext.user.id);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : authContext.user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: price.total_cents,
            product_data: {
              name: `Recours Visa IZY — Option ${option}`,
              description: `${OPTION_LABELS[option]} — dossier ${dossier_ref} (${dossier.visa_type}) pour ${dossier.client_first_name} ${dossier.client_last_name}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        user_id: authContext.user.id,
        dossier_ref,
        option,
      },
      payment_intent_data: {
        metadata: {
          user_id: authContext.user.id,
          dossier_ref,
          option,
        },
      },
      success_url: `${appBaseUrl}/client?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/client?payment=cancelled`,
    });

    // Record pending payment
    await supabaseAdmin.from("payments").insert({
      user_id: authContext.user.id,
      dossier_ref,
      amount: price.total_cents,
      currency: "eur",
      payment_method: "stripe",
      stripe_session_id: session.id,
      option_choisie: option,
      pricing_details: price,
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error creating payment session:", error);
    if (error instanceof HttpError) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.status,
      });
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
