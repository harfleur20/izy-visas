import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MSB_API_URL = "https://api.mysendingbox.fr";

function getMSBHeaders() {
  const key = Deno.env.get("MSB_API_KEY_TEST");
  if (!key) throw new Error("MSB_API_KEY_TEST not configured");
  return {
    Authorization: `Basic ${btoa(key + ":")}`,
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { page_count } = await req.json();

    if (!page_count || typeof page_count !== "number" || page_count < 1) {
      return new Response(
        JSON.stringify({ error: "page_count must be a positive integer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${MSB_API_URL}/letters/price`, {
      method: "POST",
      headers: getMSBHeaders(),
      body: JSON.stringify({
        color: "bw",
        postage_type: "lrar",
        postage_speed: "D1",
        both_sides: false,
        page_count,
        address_country: "France",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[MSB-PRICING] Error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch pricing", details: err }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pricing = await res.json();
    console.log(`[MSB-PRICING] ${page_count} pages -> ${JSON.stringify(pricing)}`);

    return new Response(JSON.stringify(pricing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[MSB-PRICING] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
