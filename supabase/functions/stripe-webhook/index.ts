import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    console.error("Missing stripe-signature header or STRIPE_WEBHOOK_SECRET");
    return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook signature";
    console.error("Webhook signature verification failed:", message);
    return new Response(JSON.stringify({ error: `Webhook Error: ${message}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  console.log(`[STRIPE-WEBHOOK] Event received: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[STRIPE-WEBHOOK] Checkout completed: ${session.id}`);

        const { error } = await supabaseAdmin
          .from("payments")
          .update({
            status: "paid",
            stripe_payment_intent_id: session.payment_intent as string,
            verified_by_webhook: true,
          })
          .eq("stripe_session_id", session.id);

        if (error) {
          console.error("[STRIPE-WEBHOOK] Error updating payment:", error);
          throw error;
        }

        const dossierRef = session.metadata?.dossier_ref;
        const userId = session.metadata?.user_id;
        const option = session.metadata?.option;

        if (dossierRef && userId) {
          const { error: dossierUpdateError } = await supabaseAdmin
            .from("dossiers")
            .update({
              lrar_status: "paiement_confirme",
              ...(option ? { option_choisie: option } : {}),
            })
            .eq("dossier_ref", dossierRef)
            .eq("user_id", userId);

          if (dossierUpdateError) {
            console.error("[STRIPE-WEBHOOK] Error updating dossier after payment:", dossierUpdateError);
            throw dossierUpdateError;
          }
        }

        console.log(`[STRIPE-WEBHOOK] Payment marked as paid for session ${session.id}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[STRIPE-WEBHOOK] Payment failed: ${paymentIntent.id}`);

        const { error } = await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", paymentIntent.id);

        if (error) console.error("[STRIPE-WEBHOOK] Error updating failed payment:", error);

        const dossierRef = paymentIntent.metadata?.dossier_ref;
        const userId = paymentIntent.metadata?.user_id;
        if (dossierRef && userId) {
          await supabaseAdmin
            .from("dossiers")
            .update({ lrar_status: "paiement_echoue" })
            .eq("dossier_ref", dossierRef)
            .eq("user_id", userId);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        console.log(`[STRIPE-WEBHOOK] Charge refunded: ${charge.payment_intent}`);

        const { error } = await supabaseAdmin
          .from("payments")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", charge.payment_intent as string);

        if (error) console.error("[STRIPE-WEBHOOK] Error updating refunded payment:", error);

        if (typeof charge.payment_intent === "string") {
          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("dossier_ref, user_id")
            .eq("stripe_payment_intent_id", charge.payment_intent)
            .maybeSingle();

          if (payment?.dossier_ref && payment?.user_id) {
            await supabaseAdmin
              .from("dossiers")
              .update({ lrar_status: "paiement_rembourse" })
              .eq("dossier_ref", payment.dossier_ref)
              .eq("user_id", payment.user_id);
          }
        }
        break;
      }

      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Processing error:", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
