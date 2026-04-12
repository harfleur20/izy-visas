import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.102.1/cors";

const PISTE_TOKEN_URL = "https://oauth.piste.gouv.fr/api/oauth/token";
const LEGIFRANCE_API_URL = "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";

// CESEDA articles to track
const CESEDA_ARTICLES = [
  { id: "L211-2", cid: "LEGIARTI000006362169" },
  { id: "L211-3", cid: "LEGIARTI000006362170" },
  { id: "R211-13", cid: "LEGIARTI000006362251" },
  { id: "R312-7", cid: "LEGIARTI000042776407" },
  { id: "R312-8", cid: "LEGIARTI000042776409" },
  { id: "R312-7-3", cid: "LEGIARTI000042776413" },
];

async function getOAuthToken(): Promise<string> {
  const clientId = Deno.env.get("PISTE_CLIENT_ID");
  const clientSecret = Deno.env.get("PISTE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("PISTE_CLIENT_ID or PISTE_CLIENT_SECRET not configured");
  }

  const res = await fetch(PISTE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token error [${res.status}]: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchArticle(
  token: string,
  articleId: string,
  _cid: string
): Promise<{ title: string; content: string; url: string } | null> {
  // Use the consult/getArticle endpoint with article number search
  const res = await fetch(`${LEGIFRANCE_API_URL}/consult/code/article`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: "CESEDA",
      article: articleId,
    }),
  });

  if (!res.ok) {
    // Fallback: try search endpoint
    const searchRes = await fetch(`${LEGIFRANCE_API_URL}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recherche: {
          champs: [
            {
              typeChamp: "NUM_ARTICLE",
              criteres: [{ typeRecherche: "EXACTE", valeur: articleId }],
              operateur: "ET",
            },
          ],
          filtres: [
            { facette: "NOM_CODE", valeurs: ["Code de l'entrée et du séjour des étrangers et du droit d'asile"] },
          ],
          pageNumber: 1,
          pageSize: 1,
          typePagination: "ARTICLE",
        },
      }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error(`Search failed for ${articleId} [${searchRes.status}]: ${errText}`);
      return null;
    }

    const searchData = await searchRes.json();
    const results = searchData?.results;
    if (!results || results.length === 0) {
      console.warn(`No results for article ${articleId}`);
      return null;
    }

    const article = results[0];
    const texte = article?.articles?.[0] || article;
    return {
      title: texte?.titre || `Article ${articleId}`,
      content: texte?.texte || texte?.texteHtml || JSON.stringify(texte),
      url: `https://www.legifrance.gouv.fr/codes/article_lc/${texte?.id || ""}`,
    };
  }

  const data = await res.json();
  return {
    title: data?.titre || `Article ${articleId}`,
    content: data?.texte || data?.texteHtml || JSON.stringify(data),
    url: `https://www.legifrance.gouv.fr/codes/article_lc/${data?.id || ""}`,
  };
}

function hashContent(content: string): string {
  // Simple hash using Web Crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request: can request specific articles or all
    let requestedArticles = CESEDA_ARTICLES;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.article_ids && Array.isArray(body.article_ids)) {
          requestedArticles = CESEDA_ARTICLES.filter((a) =>
            body.article_ids.includes(a.id)
          );
        }
        if (body?.force_refresh === false) {
          // Return cached only
          const { data: cached } = await supabase
            .from("ceseda_articles_cache")
            .select("*")
            .in(
              "article_id",
              requestedArticles.map((a) => a.id)
            );
          return new Response(JSON.stringify({ articles: cached || [], from_cache: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Get OAuth token
    const token = await getOAuthToken();

    const results: Array<{
      article_id: string;
      status: string;
      changed: boolean;
    }> = [];

    for (const article of requestedArticles) {
      const fetched = await fetchArticle(token, article.id, article.cid);
      if (!fetched) {
        results.push({ article_id: article.id, status: "fetch_failed", changed: false });
        continue;
      }

      const newHash = hashContent(fetched.content);

      // Check existing cache
      const { data: existing } = await supabase
        .from("ceseda_articles_cache")
        .select("id, content_hash")
        .eq("article_id", article.id)
        .maybeSingle();

      if (existing && existing.content_hash === newHash) {
        // Content unchanged, update fetched_at only
        await supabase
          .from("ceseda_articles_cache")
          .update({ fetched_at: new Date().toISOString() })
          .eq("id", existing.id);
        results.push({ article_id: article.id, status: "unchanged", changed: false });
      } else if (existing) {
        // Content changed
        await supabase
          .from("ceseda_articles_cache")
          .update({
            article_title: fetched.title,
            article_content: fetched.content,
            source_url: fetched.url,
            content_hash: newHash,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        results.push({ article_id: article.id, status: "updated", changed: true });
      } else {
        // New article
        await supabase.from("ceseda_articles_cache").insert({
          article_id: article.id,
          article_title: fetched.title,
          article_content: fetched.content,
          source_url: fetched.url,
          content_hash: newHash,
        });
        results.push({ article_id: article.id, status: "inserted", changed: true });
      }
    }

    // Return all cached articles
    const { data: allCached } = await supabase
      .from("ceseda_articles_cache")
      .select("*")
      .in(
        "article_id",
        requestedArticles.map((a) => a.id)
      );

    return new Response(
      JSON.stringify({ articles: allCached || [], sync_results: results, from_cache: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Légifrance sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
