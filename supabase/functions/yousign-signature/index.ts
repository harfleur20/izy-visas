import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { HttpError, requireYousignWebhookSignature } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-yousign-signature-256, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YOUSIGN_API_URL = Deno.env.get("YOUSIGN_API_URL") || "https://api-sandbox.yousign.app/v3";
const IS_SANDBOX = YOUSIGN_API_URL.includes("sandbox");
const ALLOW_TEST_OTP = IS_SANDBOX && isTruthy(Deno.env.get("YOUSIGN_ALLOW_TEST_OTP"));

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
}

function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function getYouSignHeaders() {
  return {
    Authorization: `Bearer ${getRequiredEnv("YOUSIGN_API_KEY")}`,
    "Content-Type": "application/json",
  };
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    switch (action) {
      case "create":
        return await handleCreate(req);
      case "verify-otp":
        return await handleVerifyOtp(req);
      case "webhook":
        return await handleWebhook(req);
      case "download-certificate":
        return await handleDownloadCertificate(req);
      default:
        return jsonResponse({ error: "Unknown action. Use: create, verify-otp, webhook, download-certificate" }, 400);
    }
  } catch (error) {
    console.error("[YOUSIGN] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

// ── 1. Create signature request ──────────────────────────────────────────────

async function handleCreate(req: Request) {
  const { dossierRef, documentName, documentBase64, signerEmail, signerPhone, userId } = await req.json();

  if (!dossierRef || !documentName || !documentBase64 || !signerEmail || !userId) {
    return jsonResponse({ error: "Missing required fields: dossierRef, documentName, documentBase64, signerEmail, userId" }, 400);
  }

  // 1. Create signature request
  const sigReqRes = await fetch(`${YOUSIGN_API_URL}/signature_requests`, {
    method: "POST",
    headers: getYouSignHeaders(),
    body: JSON.stringify({
      name: `Signature - ${dossierRef}`,
      delivery_mode: "none",
      timezone: "Europe/Paris",
      ordered_signers: false,
      signers_allowed_to_decline: false,
    }),
  });

  if (!sigReqRes.ok) {
    const err = await sigReqRes.text();
    console.error("[YOUSIGN] Create signature request failed:", err);
    return jsonResponse({ error: "Failed to create signature request" }, 502);
  }

  const sigReq = await sigReqRes.json();
  console.log(`[YOUSIGN] Signature request created: ${sigReq.id}`);

  // 2. Upload document
  const formData = new FormData();
  const blob = base64ToBlob(documentBase64, "application/pdf");
  formData.append("file", blob, documentName);
  formData.append("nature", "signable_document");

  const docRes = await fetch(`${YOUSIGN_API_URL}/signature_requests/${sigReq.id}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getRequiredEnv("YOUSIGN_API_KEY")}` },
    body: formData,
  });

  if (!docRes.ok) {
    const err = await docRes.text();
    console.error("[YOUSIGN] Upload document failed:", err);
    return jsonResponse({ error: "Failed to upload document" }, 502);
  }

  const doc = await docRes.json();
  console.log(`[YOUSIGN] Document uploaded: ${doc.id}`);

  // In sandbox mode, YouSign only accepts French phone numbers — fall back to OTP email
  const usePhone = signerPhone && !IS_SANDBOX;
  const signerRes = await fetch(`${YOUSIGN_API_URL}/signature_requests/${sigReq.id}/signers`, {
    method: "POST",
    headers: getYouSignHeaders(),
    body: JSON.stringify({
      info: {
        first_name: "Signataire",
        last_name: dossierRef,
        email: signerEmail,
        ...(usePhone ? { phone_number: formatPhone(signerPhone) } : {}),
        locale: "fr",
      },
      signature_authentication_mode: usePhone ? "otp_sms" : "otp_email",
      signature_level: "electronic_signature",
      fields: [
        {
          type: "signature",
          document_id: doc.id,
          page: 1,
          x: 77,
          y: 581,
          width: 222,
          height: 104,
        },
      ],
    }),
  });

  if (!signerRes.ok) {
    const err = await signerRes.text();
    console.error("[YOUSIGN] Add signer failed:", err);
    return jsonResponse({ error: "Failed to add signer" }, 502);
  }

  const signer = await signerRes.json();
  console.log(`[YOUSIGN] Signer added: ${signer.id}`);

  // 4. Activate signature request
  const activateRes = await fetch(`${YOUSIGN_API_URL}/signature_requests/${sigReq.id}/activate`, {
    method: "POST",
    headers: getYouSignHeaders(),
  });

  if (!activateRes.ok) {
    const err = await activateRes.text();
    console.error("[YOUSIGN] Activate failed:", err);
    return jsonResponse({ error: "Failed to activate signature request" }, 502);
  }

  console.log(`[YOUSIGN] Signature request activated: ${sigReq.id}`);

  // 5. Save to database
  const supabase = getSupabaseAdmin();
  const { error: dbError } = await supabase.from("signatures").insert({
    user_id: userId,
    dossier_ref: dossierRef,
    yousign_signature_request_id: sigReq.id,
    yousign_signer_id: signer.id,
    document_name: documentName,
    signer_email: signerEmail,
    signer_phone: signerPhone || null,
    status: "active",
  });

  if (dbError) {
    console.error("[YOUSIGN] DB insert error:", dbError);
  }

  return jsonResponse({
    signatureRequestId: sigReq.id,
    signerId: signer.id,
    status: "active",
    sandbox: IS_SANDBOX,
    sandboxTestOtpEnabled: ALLOW_TEST_OTP,
  });
}

// ── 2. Verify OTP ───────────────────────────────────────────────────────────

async function handleVerifyOtp(req: Request) {
  const { signatureRequestId, signerId, otp } = await req.json();

  if (!signatureRequestId || !signerId || !otp) {
    return jsonResponse({ error: "Missing: signatureRequestId, signerId, otp" }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Explicit test bypass for sandbox only.
  if (ALLOW_TEST_OTP && otp === "123456") {
    console.log("[YOUSIGN-SANDBOX] Auto-accepting OTP 123456 for sandbox mode");
    await supabase
      .from("signatures")
      .update({ otp_verified: true, status: "signed", signed_at: new Date().toISOString() })
      .eq("yousign_signature_request_id", signatureRequestId);
    return jsonResponse({ success: true, message: "Signature completed (sandbox)" });
  }

  const res = await fetch(
    `${YOUSIGN_API_URL}/signature_requests/${signatureRequestId}/signers/${signerId}/sign`,
    {
      method: "POST",
      headers: getYouSignHeaders(),
      body: JSON.stringify({ otp }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[YOUSIGN] OTP verification failed:", err);
    return jsonResponse({ error: "OTP verification failed", details: err }, 400);
  }

  // Update DB
  await supabase
    .from("signatures")
    .update({ otp_verified: true, status: "signed" })
    .eq("yousign_signature_request_id", signatureRequestId);

  return jsonResponse({ success: true, message: "Signature completed" });
}

// ── 3. Webhook handler ──────────────────────────────────────────────────────

async function handleWebhook(req: Request) {
  const rawBody = await req.text();
  await requireYousignWebhookSignature(req, rawBody);

  const payload = JSON.parse(rawBody);
  const eventType = payload.event_name;

  console.log(`[YOUSIGN-WEBHOOK] Event: ${eventType}`);

  const supabase = getSupabaseAdmin();
  const signatureRequestId = payload.data?.signature_request?.id;

  if (!signatureRequestId) {
    console.warn("[YOUSIGN-WEBHOOK] No signature_request.id in payload");
    return jsonResponse({ received: true });
  }

  switch (eventType) {
    case "signature_request.done": {
      // Update status
      await supabase
        .from("signatures")
        .update({ status: "done", signed_at: new Date().toISOString() })
        .eq("yousign_signature_request_id", signatureRequestId);

      // Download and archive the signed document + audit trail
      await archiveCertificate(supabase, signatureRequestId);
      break;
    }

    case "signature_request.declined": {
      await supabase
        .from("signatures")
        .update({ status: "declined" })
        .eq("yousign_signature_request_id", signatureRequestId);
      break;
    }

    case "signature_request.expired": {
      await supabase
        .from("signatures")
        .update({ status: "expired" })
        .eq("yousign_signature_request_id", signatureRequestId);
      break;
    }

    default:
      console.log(`[YOUSIGN-WEBHOOK] Unhandled event: ${eventType}`);
  }

  return jsonResponse({ received: true });
}

// ── 4. Download certificate ──────────────────────────────────────────────────

async function handleDownloadCertificate(req: Request) {
  const { signatureRequestId } = await req.json();

  if (!signatureRequestId) {
    return jsonResponse({ error: "Missing signatureRequestId" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const { data: sig, error } = await supabase
    .from("signatures")
    .select("certificate_path, user_id")
    .eq("yousign_signature_request_id", signatureRequestId)
    .single();

  if (error || !sig?.certificate_path) {
    return jsonResponse({ error: "Certificate not found" }, 404);
  }

  const { data: urlData } = await supabase.storage
    .from("signature-certificates")
    .createSignedUrl(sig.certificate_path, 3600);

  if (!urlData?.signedUrl) {
    return jsonResponse({ error: "Failed to generate download URL" }, 500);
  }

  return jsonResponse({ url: urlData.signedUrl });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function archiveCertificate(supabase: ReturnType<typeof createClient>, signatureRequestId: string) {
  try {
    // Get the signature record
    const { data: sig } = await supabase
      .from("signatures")
      .select("user_id, dossier_ref")
      .eq("yousign_signature_request_id", signatureRequestId)
      .single();

    if (!sig) {
      console.error("[YOUSIGN] Signature record not found for archiving");
      return;
    }

    // Download audit trail from YouSign
    const auditRes = await fetch(
      `${YOUSIGN_API_URL}/signature_requests/${signatureRequestId}/audit_trails/download`,
      { headers: getYouSignHeaders() }
    );

    if (!auditRes.ok) {
      console.error("[YOUSIGN] Failed to download audit trail:", await auditRes.text());
      return;
    }

    const auditBlob = await auditRes.blob();
    const certPath = `${sig.user_id}/${sig.dossier_ref}_audit_trail.pdf`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("signature-certificates")
      .upload(certPath, auditBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[YOUSIGN] Failed to upload certificate:", uploadError);
      return;
    }

    // Update DB with certificate path
    await supabase
      .from("signatures")
      .update({ certificate_path: certPath })
      .eq("yousign_signature_request_id", signatureRequestId);

    console.log(`[YOUSIGN] Certificate archived: ${certPath}`);
  } catch (err) {
    console.error("[YOUSIGN] Archive error:", err);
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function formatPhone(phone: string): string {
  if (phone.startsWith("+")) return phone;
  if (phone.startsWith("0")) return `+33${phone.slice(1)}`;
  return `+${phone}`;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
