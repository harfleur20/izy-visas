import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENLEGI_BASE_URL = "https://mcp.openlegi.fr/legifrance/mcp";
const CESEDA_CODE_NAME = "Code de l'entrée et du séjour des étrangers et du droit d'asile";

interface McpSession {
  sessionId: string;
  nextId: number;
}

function getMcpUrl(): string {
  const token = Deno.env.get("OPENLEGI_MCP_TOKEN");
  if (!token) {
    throw new Error("OPENLEGI_MCP_TOKEN not configured");
  }
  return `${OPENLEGI_BASE_URL}?token=${token}`;
}

async function initMcpSession(): Promise<McpSession> {
  const mcpUrl = getMcpUrl();
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };

  const initResp = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "izy-visa", version: "1.0.0" },
      },
      id: 1,
    }),
  });

  const sessionId = initResp.headers.get("Mcp-Session-Id") || "";
  await initResp.text(); // consume body

  // Send initialized notification
  await fetch(mcpUrl, {
    method: "POST",
    headers: { ...headers, "Mcp-Session-Id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });

  return { sessionId, nextId: 2 };
}

function parseSseResponse(text: string): any {
  for (const line of text.split("\n")) {
    if (line.startsWith("data:")) {
      return JSON.parse(line.slice(5).trim());
    }
  }
  return null;
}

async function callMcpTool(session: McpSession, toolName: string, args: Record<string, any>): Promise<any> {
  const mcpUrl = getMcpUrl();
  const id = session.nextId++;
  const resp = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Mcp-Session-Id": session.sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id,
    }),
  });

  const text = await resp.text();
  const data = parseSseResponse(text);
  if (!data) return null;

  const result = data.result;
  if (result?.isError) {
    return { error: true, text: result.content?.[0]?.text || "Unknown error" };
  }

  return { error: false, text: result?.content?.[0]?.text || "" };
}

// Search for CESEDA articles by article number or keywords
async function searchCesedaArticles(
  session: McpSession,
  articles: string[]
): Promise<Record<string, { found: boolean; content: string; url: string }>> {
  const results: Record<string, { found: boolean; content: string; url: string }> = {};

  for (const article of articles) {
    // Strategy 1: Search in code by article number
    let result = await callMcpTool(session, "rechercher_code", {
      search: article,
      code_name: CESEDA_CODE_NAME,
      champ: "NUM_ARTICLE",
      page_size: 3,
    });

    // Strategy 2: If code search fails, try LODA search
    if (result?.error) {
      result = await callMcpTool(session, "rechercher_dans_texte_legal", {
        search: `${article} étrangers séjour visa`,
        champ: "ALL",
        type_recherche: "UN_DES_MOTS",
        page_size: 5,
      });
    }

    // Strategy 3: Try broader LODA search with just article number
    if (result?.error) {
      result = await callMcpTool(session, "rechercher_dans_texte_legal", {
        search: article,
        champ: "NUM_ARTICLE",
        page_size: 3,
      });
    }

    if (result && !result.error && result.text) {
      // Extract URL and content from the formatted text
      const urlMatch = result.text.match(/Lien article.*?:\s*(https:\/\/[^\s\n]+)/);
      const contentMatch = result.text.match(/Texte de l'article:\s*([\s\S]*?)(?:\n={3,}|\n\n===|$)/);

      results[article] = {
        found: true,
        content: contentMatch?.[1]?.trim() || result.text,
        url: urlMatch?.[1] || "",
      };
    } else {
      results[article] = {
        found: false,
        content: result?.text || "Article non trouvé",
        url: "",
      };
    }
  }

  return results;
}

// Verify that references in a letter text exist in OpenLégi
async function verifyReferences(
  session: McpSession,
  references: string[]
): Promise<Array<{ reference: string; valid: boolean; details: string; url: string }>> {
  const verifications = [];

  for (const ref of references) {
    // Clean the reference to extract article number
    const articleMatch = ref.match(/[LRD]\.\s*\d+[-\d]*/i) || ref.match(/article\s+([LRD]?\d+[-\d]*)/i);
    const searchTerm = articleMatch ? articleMatch[0].replace(/\s/g, "") : ref;

    // Try code search first
    let result = await callMcpTool(session, "rechercher_code", {
      search: searchTerm,
      code_name: CESEDA_CODE_NAME,
      champ: "NUM_ARTICLE",
      page_size: 1,
    });

    if (result?.error) {
      // Try LODA
      result = await callMcpTool(session, "rechercher_dans_texte_legal", {
        search: searchTerm,
        champ: "NUM_ARTICLE",
        page_size: 1,
      });
    }

    const urlMatch = result?.text?.match(/Lien article.*?:\s*(https:\/\/[^\s\n]+)/);

    verifications.push({
      reference: ref,
      valid: result ? !result.error : false,
      details: result?.error ? "Référence non trouvée dans Légifrance" : "Référence validée",
      url: urlMatch?.[1] || "",
    });
  }

  return verifications;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, articles, references, visa_type, motif_refus } = await req.json();
    const session = await initMcpSession();

    if (action === "fetch_context") {
      // Fetch CESEDA articles for letter generation context
      const defaultArticles = ["L211-2", "L211-3", "R211-13", "R312-7", "R312-8", "R312-7-3"];
      const targetArticles = articles || defaultArticles;
      const results = await searchCesedaArticles(session, targetArticles);

      // Also search for jurisprudence related to the visa type
      let jurisprudence = null;
      if (visa_type || motif_refus) {
        const searchTerms = [visa_type, motif_refus, "refus visa CESEDA"].filter(Boolean).join(" ");
        jurisprudence = await callMcpTool(session, "rechercher_jurisprudence_administrative", {
          search: searchTerms,
          champ: "ALL",
          page_size: 3,
        });
      }

      return new Response(
        JSON.stringify({ articles: results, jurisprudence: jurisprudence?.error ? null : jurisprudence?.text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      // Verify references in a generated letter
      if (!references || !Array.isArray(references)) {
        return new Response(
          JSON.stringify({ error: "references array is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const verifications = await verifyReferences(session, references);
      const allValid = verifications.every((v) => v.valid);

      return new Response(
        JSON.stringify({
          verifications,
          allValid,
          summary: allValid
            ? "Toutes les références sont validées par Légifrance"
            : `${verifications.filter((v) => !v.valid).length} référence(s) non validée(s)`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'fetch_context' or 'verify'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OpenLégi error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
