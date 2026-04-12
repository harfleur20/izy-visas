import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { HttpError } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-webhook-secret, x-taramoney-webhook-secret, x-tara-webhook-secret, x-client-info, apikey, content-type",
};

type WebhookBody = Record<string, unknown>;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const maxLength = Math.max(aBytes.length, bBytes.length);

  for (let i = 0; i < maxLength; i++) {
    diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
  }

  return diff === 0;
}

function requireTaraSecret(req: Request) {
  const expectedSecret = Deno.env.get("TARAMONEY_WEBHOOK_SECRET")?.trim();
  if (!expectedSecret) {
    throw new HttpError(500, "TARAMONEY_WEBHOOK_SECRET not configured");
  }

  const url = new URL(req.url);
  const authorization = req.headers.get("Authorization")?.trim();
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const candidates = [
    url.searchParams.get("token"),
    url.searchParams.get("secret"),
    url.searchParams.get("webhook_secret"),
    req.headers.get("x-webhook-secret"),
    req.headers.get("x-taramoney-webhook-secret"),
    req.headers.get("x-tara-webhook-secret"),
    bearer,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (!candidates.some((candidate) => timingSafeEqual(candidate.trim(), expectedSecret))) {
    throw new HttpError(401, "Unauthorized Taramoney webhook");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findStringByKey(value: unknown, wantedKeys: Set<string>): string | null {
  if (!isRecord(value)) return null;

  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    if (wantedKeys.has(normalized) && (typeof entry === "string" || typeof entry === "number")) {
      return String(entry);
    }
  }

  for (const entry of Object.values(value)) {
    if (isRecord(entry)) {
      const nested = findStringByKey(entry, wantedKeys);
      if (nested) return nested;
    }
  }

  return null;
}

function classifyStatus(rawStatus: string | null): "paid" | "failed" | "pending" {
  const status = (rawStatus || "").toLowerCase();
  if (/(success|succeeded|paid|completed|complete|confirmed|confirm[eé]|valid[eé]|pay[eé])/.test(status)) {
    return "paid";
  }
  if (/(fail|failed|cancel|canceled|cancelled|expired|reject|rejected|error|declined)/.test(status)) {
    return "failed";
  }
  return "pending";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireTaraSecret(req);

    const rawBody = await req.text();
    let body: WebhookBody;
    try {
      body = JSON.parse(rawBody || "{}") as WebhookBody;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const productId = findStringByKey(body, new Set(["productid", "product", "reference", "paymentreference"]));
    const transactionId = findStringByKey(body, new Set(["transactionid", "transaction", "paymentid", "paymentlinkid"]));
    const rawStatus = findStringByKey(body, new Set(["status", "paymentstatus", "event", "type"]));
    const nextStatus = classifyStatus(rawStatus);

    if (!productId) {
      console.error("[TARAMONEY-WEBHOOK] Missing productId/reference:", body);
      throw new HttpError(400, "Missing productId or reference");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, dossier_ref, user_id, option_choisie")
      .eq("payment_method", "taramoney")
      .eq("provider_payment_id", productId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error("[TARAMONEY-WEBHOOK] Payment lookup error:", paymentError);
      throw paymentError;
    }

    if (!payment) {
      console.error("[TARAMONEY-WEBHOOK] Unknown payment reference:", productId, body);
      throw new HttpError(404, "Payment not found");
    }

    const paymentUpdate = {
      status: nextStatus,
      provider_status: rawStatus || nextStatus,
      provider_payload: body,
      provider_payment_id: productId,
      provider_transaction_id: transactionId || null,
      verified_by_webhook: nextStatus === "paid",
    };

    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update(paymentUpdate)
      .eq("id", payment.id);

    if (updateError) {
      console.error("[TARAMONEY-WEBHOOK] Payment update error:", updateError);
      throw updateError;
    }

    if (nextStatus === "paid" || nextStatus === "failed") {
      const { error: dossierError } = await supabaseAdmin
        .from("dossiers")
        .update({
          lrar_status: nextStatus === "paid" ? "paiement_confirme" : "paiement_echoue",
          ...(payment.option_choisie ? { option_choisie: payment.option_choisie } : {}),
        })
        .eq("dossier_ref", payment.dossier_ref)
        .eq("user_id", payment.user_id);

      if (dossierError) {
        console.error("[TARAMONEY-WEBHOOK] Dossier update error:", dossierError);
        throw dossierError;
      }
    }

    return jsonResponse({
      received: true,
      provider: "taramoney",
      status: nextStatus,
      productId,
    });
  } catch (error) {
    console.error("[TARAMONEY-WEBHOOK] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
