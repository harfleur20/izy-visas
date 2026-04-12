import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

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

    const { dossier_ref } = await req.json();
    if (!dossier_ref) throw new Error("dossier_ref is required");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check existing customer
    const customers = await stripe.customers.list({ email: authContext.user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Fetch dossier to get LRAR cost
    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .select("user_id, cout_mysendingbox_total, visa_type, client_first_name, client_last_name")
      .eq("dossier_ref", dossier_ref)
      .single();

    if (dossierError || !dossier) throw new Error("Dossier introuvable: " + dossier_ref);
    assertDossierAccess(authContext, dossier);

    const appBaseUrl = getAppBaseUrl(req);

    // Service fee: 150 € (15000 cents) + LRAR cost from MySendingBox
    const SERVICE_FEE_CENTS = 15000;
    const lrarCostCents = Math.round((dossier.cout_mysendingbox_total || 0) * 100);
    const totalAmountCents = SERVICE_FEE_CENTS + lrarCostCents;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : authContext.user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: totalAmountCents,
            product_data: {
              name: `Recours Visa IZY — ${dossier_ref}`,
              description: `Recours ${dossier.visa_type} pour ${dossier.client_first_name} ${dossier.client_last_name} (Service 150 € + LRAR ${((dossier.cout_mysendingbox_total || 0)).toFixed(2)} €)`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        user_id: authContext.user.id,
        dossier_ref,
      },
      success_url: `${appBaseUrl}/client?payment=success`,
      cancel_url: `${appBaseUrl}/client?payment=cancelled`,
    });

    // Record pending payment
    await supabaseAdmin.from("payments").insert({
      user_id: authContext.user.id,
      dossier_ref,
      amount: totalAmountCents,
      currency: "eur",
      payment_method: "stripe",
      stripe_session_id: session.id,
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
