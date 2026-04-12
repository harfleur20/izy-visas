import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SendOption = "A" | "B" | "C";

type Tarification = {
  generation_lettre_eur?: number | null;
  envoi_mysendingbox_eur?: number | null;
  honoraires_avocat_eur?: number | null;
};

type TaraLinksResponse = {
  status?: string;
  message?: string;
  whatsappLink?: string;
  telegramLink?: string;
  dikaloLink?: string;
  smsLink?: string;
  [key: string]: unknown;
};

const OPTION_LABELS: Record<SendOption, string> = {
  A: "Téléchargement direct",
  B: "Envoi MySendingBox automatique",
  C: "Relecture avocat, signature et envoi",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAppBaseUrl(req: Request): string {
  const configuredBaseUrl = Deno.env.get("APP_BASE_URL")?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    throw new HttpError(500, "APP_BASE_URL not configured and request origin missing");
  }

  const parsedOrigin = new URL(origin);
  return `${parsedOrigin.protocol}//${parsedOrigin.host}`;
}

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

function pickPrimaryLink(links: TaraLinksResponse): string | null {
  return links.whatsappLink || links.dikaloLink || links.telegramLink || links.smsLink || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiUrl = Deno.env.get("TARAMONEY_API_URL")?.trim() || "https://www.dklo.co/api/tara/paymentlinks";
    const apiKey = Deno.env.get("TARAMONEY_API_KEY")?.trim();
    const businessId = Deno.env.get("TARAMONEY_BUSINESS_ID")?.trim();
    const webhookSecret = Deno.env.get("TARAMONEY_WEBHOOK_SECRET")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    if (!apiKey || !businessId || !webhookSecret) {
      throw new HttpError(500, "Taramoney secrets are not configured");
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const supabaseUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      },
    );

    const authContext = await requireAuthenticatedContext(req, supabaseAdmin, supabaseUser);
    const { dossier_ref, option } = await req.json();
    if (!dossier_ref) throw new HttpError(400, "dossier_ref is required");
    assertSendOption(option);

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .select("user_id, visa_type, client_first_name, client_last_name")
      .eq("dossier_ref", dossier_ref)
      .single();

    if (dossierError || !dossier) throw new HttpError(404, `Dossier introuvable: ${dossier_ref}`);
    assertDossierAccess(authContext, dossier);

    const { data: tarifs } = await supabaseAdmin
      .from("tarification")
      .select("generation_lettre_eur, envoi_mysendingbox_eur, honoraires_avocat_eur")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const price = getPriceBreakdown(option, tarifs);
    const appBaseUrl = getAppBaseUrl(req);
    const productId = `IZY-${dossier_ref}-${crypto.randomUUID()}`;
    const returnUrl = `${appBaseUrl}/client?payment=taramoney_pending`;
    const webHookUrl = `${supabaseUrl}/functions/v1/taramoney-webhook?token=${encodeURIComponent(webhookSecret)}`;

    const payload = {
      apiKey,
      businessId,
      productId,
      productName: `Recours Visa IZY — Option ${option}`,
      productPrice: price.total_eur,
      productDescription: `${OPTION_LABELS[option]} — dossier ${dossier_ref} (${dossier.visa_type}) pour ${dossier.client_first_name} ${dossier.client_last_name}`,
      productPictureUrl: `${appBaseUrl}/favicon.ico`,
      returnUrl,
      webHookUrl,
    };

    const taraResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseText = await taraResponse.text();
    let taraData: TaraLinksResponse;
    try {
      taraData = JSON.parse(responseText) as TaraLinksResponse;
    } catch {
      throw new HttpError(502, "Réponse Taramoney invalide");
    }

    if (!taraResponse.ok || String(taraData.status || "").toLowerCase() !== "success") {
      console.error("[TARAMONEY] Payment link error:", taraResponse.status, taraData);
      throw new HttpError(502, taraData.message || "Impossible de créer le lien Taramoney");
    }

    const primaryLink = pickPrimaryLink(taraData);
    if (!primaryLink) {
      throw new HttpError(502, "Taramoney n'a retourné aucun lien de paiement");
    }

    const links = {
      whatsappLink: taraData.whatsappLink || null,
      telegramLink: taraData.telegramLink || null,
      dikaloLink: taraData.dikaloLink || null,
      smsLink: taraData.smsLink || null,
    };

    await supabaseAdmin
      .from("dossiers")
      .update({
        option_choisie: option,
        lrar_status: "paiement_en_attente",
      })
      .eq("dossier_ref", dossier_ref)
      .eq("user_id", authContext.user.id);

    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      user_id: authContext.user.id,
      dossier_ref,
      amount: price.total_cents,
      currency: "eur",
      payment_method: "taramoney",
      option_choisie: option,
      pricing_details: price,
      provider_payment_id: productId,
      provider_status: "payment_link_created",
      provider_checkout_url: primaryLink,
      provider_payload: taraData,
      payment_links: links,
      status: "pending",
    });

    if (paymentError) {
      console.error("[TARAMONEY] Payment insert error:", paymentError);
      throw paymentError;
    }

    return jsonResponse({
      provider: "taramoney",
      status: "pending",
      productId,
      primaryLink,
      links,
      amount: price.total_cents,
      currency: "eur",
    });
  } catch (error) {
    console.error("[TARAMONEY] create payment error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
