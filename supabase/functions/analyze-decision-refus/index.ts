import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

const MOTIF_LABELS: Record<string, string> = {
  A: "Document de voyage non valide",
  B: "But du séjour non justifié",
  C: "Ressources insuffisantes",
  D: "Assurance absente ou insuffisante",
  E: "Hébergement non justifié",
  F: "Doute sur la volonté de retour",
  G: "Signalement SIS",
  H: "Menace pour l'ordre public",
  I: "Séjour irrégulier antérieur",
  J: "Intention matrimoniale non établie",
  K: "Dossier incomplet",
  L: "Appréciation globale défavorable",
};

const MOTIF_TEXT_PATTERNS: Record<string, RegExp[]> = {
  A: [
    /document de voyage[^\n]{0,120}(non valide|faux|falsifie|contrefait|expire)/i,
    /travel document[^\n]{0,120}(invalid|false|forged|counterfeit|expired)/i,
  ],
  B: [
    // Formulations OFFICIELLES strictes du motif B (objet/but du séjour NON JUSTIFIÉ)
    /objet et (les )?conditions? du sejour[^\n]{0,200}(ne sont pas justifi|pas justifies|non justifies)/i,
    /but du sejour[^\n]{0,80}(non justifie|pas justifie)/i,
    /sejournerez en france a d'autres fins que celles pour lesquelles vous demandez/i,
    /purpose of the stay[^\n]{0,80}(not justified|cannot be justified)/i,
  ],
  C: [
    /ressources[^\n]{0,120}(insuffisantes|insuffisants)/i,
    /moyens de subsistance[^\n]{0,120}(insuffisants|insuffisantes)/i,
    /insufficient (financial )?(resources|means of subsistence)/i,
  ],
  D: [
    /assurance[^\n]{0,120}(absente|insuffisante|invalide|non valide)/i,
    /(travel|medical) insurance[^\n]{0,120}(missing|insufficient|invalid)/i,
  ],
  E: [
    /hebergement[^\n]{0,120}(non justifie|pas justifie|insuffisant)/i,
    /accommodation[^\n]{0,120}(not justified|not provided|insufficient)/i,
  ],
  F: [
    /volonte de quitter le territoire[^\n]{0,160}(n'a pu etre etablie|pas ete etablie|n a pu etre etablie)/i,
    /quitter le territoire des etats membres avant l'expiration du visa[^\n]{0,160}(n'a pu etre etablie|pas ete etablie|n a pu etre etablie)/i,
    /informations? communiquees? pour justifier[^\n]{0,200}(ne sont pas fiables|pas fiables|non fiables)/i,
    /intention to leave[^\n]{0,160}(could not be established|has not been established)/i,
  ],
  G: [/signalement sis/i, /sis alert/i],
  H: [/ordre public/i, /public order/i],
  I: [/sejour irregulier anterieur/i, /previous irregular stay/i, /overstay/i],
  J: [/intention matrimoniale/i, /marriage intention/i],
  K: [/dossier incomplet/i, /documents? manquants?/i, /incomplete application/i],
  L: [/appreciation globale defavorable/i, /global assessment[^\n]{0,80}unfavo/i],
};

const VISA_TYPE_MAP: Record<string, string> = {
  court_sejour_schengen: "court_sejour",
  long_sejour_etudiant: "etudiant",
  long_sejour_conjoint_francais: "conjoint_francais",
  long_sejour_salarie: "salarie",
  passeport_talent: "passeport_talent",
  visiteur_parent_enfant_francais: "visiteur",
  autre: "autre",
};

const CITY_TO_COUNTRY: Record<string, string> = {
  douala: "Cameroun",
  yaounde: "Cameroun",
  casablanca: "Maroc",
  rabat: "Maroc",
  dakar: "Sénégal",
  abidjan: "Côte d'Ivoire",
  alger: "Algérie",
  tunis: "Tunisie",
};

// Codes postes consulaires français présents dans les n° de dossier (FRA + chiffre + code lettres)
// Format observé : FRA1DL2023... où "DL" = Douala, "YA" = Yaoundé, etc.
// Source : numérotation France-Visas par poste émetteur
const POSTE_CODE_TO_CITY: Record<string, { city: string; type: "consulat_general" | "ambassade" }> = {
  DL: { city: "Douala", type: "consulat_general" },
  YA: { city: "Yaoundé", type: "ambassade" },
  CA: { city: "Casablanca", type: "consulat_general" },
  RA: { city: "Rabat", type: "ambassade" },
  DK: { city: "Dakar", type: "ambassade" },
  AB: { city: "Abidjan", type: "ambassade" },
  AL: { city: "Alger", type: "ambassade" },
  TU: { city: "Tunis", type: "ambassade" },
  TN: { city: "Tunis", type: "ambassade" },
};

function extractConsulatFromNumeroDossier(text: string) {
  // Cherche un motif type "FRA1DL2023..." ou "FRA 1 DL 2023..."
  const match = text.match(/FRA\s*\d?\s*([A-Z]{2})\s*\d{4}/i);
  if (!match) return { nom: null, ville: null, pays: null };
  const code = match[1].toUpperCase();
  const poste = POSTE_CODE_TO_CITY[code];
  if (!poste) return { nom: null, ville: null, pays: null };
  const label = poste.type === "consulat_general" ? "Consulat général de France" : "Ambassade de France";
  return {
    nom: `${label} à ${poste.city}`,
    ville: poste.city,
    pays: inferCountryFromCity(poste.city),
  };
}

function normalizeLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word
      .split("-")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join("-"))
    .join(" ");
}

function inferCountryFromCity(city: string | null) {
  if (!city) return null;
  return CITY_TO_COUNTRY[normalizeLookup(city)] || null;
}

function normalizeMotifText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeMotifCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  return Array.from(new Set(
    codes
      .filter((code): code is string => typeof code === "string")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => !!MOTIF_LABELS[code])
  ));
}

function inferMotifCodesFromTexts(texts: unknown): string[] {
  if (!Array.isArray(texts)) return [];

  const normalizedTexts = texts
    .filter((text): text is string => typeof text === "string")
    .map((text) => normalizeMotifText(text))
    .filter(Boolean);

  const detected = new Set<string>();

  for (const text of normalizedTexts) {
    for (const [code, patterns] of Object.entries(MOTIF_TEXT_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(text))) {
        detected.add(code);
      }
    }
  }

  return Array.from(detected);
}

function resolveMotifCodes(modelCodes: unknown, motifTexts: unknown, sourceText?: string): string[] {
  const safeModelCodes = sanitizeMotifCodes(modelCodes);
  const inferredFromMotifTexts = inferMotifCodesFromTexts(motifTexts);
  const inferredFromSource = sourceText ? inferMotifCodesFromTexts([sourceText]) : [];
  const crossValidatedCodes = Array.from(
    new Set([...inferredFromMotifTexts, ...inferredFromSource]),
  );

  // ✅ STRATÉGIE UNION (pas intersection)
  // - On garde TOUS les codes du modèle (il a vu le document avec les cases à cocher).
  // - On AJOUTE les codes inférés par regex (filet de sécurité contre les omissions).
  // - On ne supprime un code du modèle QUE s'il est manifestement absent ET qu'au moins
  //   un autre code a été validé par regex (preuve qu'on lit bien le bon document).
  // Cela évite le bug où un seul faux positif regex écrase tous les vrais codes du modèle.
  const merged = new Set<string>([...safeModelCodes, ...crossValidatedCodes]);
  return Array.from(merged);
}

async function extractConsulatViaPixtral(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<{ nom: string | null; ville: string | null; pays: string | null }> {
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "pixtral-large-latest",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            {
              type: "text",
              text: `Regarde UNIQUEMENT l'en-tête / cartouche en haut de cette décision de refus de visa français. Identifie l'autorité émettrice (Consulat ou Ambassade de France) et la ville. Le texte peut être écrit verticalement, dans un cadre, ou en plusieurs lignes (ex: "CONSULAT GÉNÉRAL" / "DE FRANCE" / "À DOUALA"). Réponds UNIQUEMENT en JSON : {"type": "consulat_general" ou "ambassade" ou null, "ville": "nom de la ville" ou null, "pays": "pays" ou null}. Si l'en-tête est illisible ou absent, retourne tous les champs à null. NE JAMAIS inventer.`,
            },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error("[pixtral-fallback] error:", res.status);
      return { nom: null, ville: null, pays: null };
    }
    const data = await res.json();
    const txt = (data.choices?.[0]?.message?.content || "") as string;
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { nom: null, ville: null, pays: null };
    const parsed = JSON.parse(m[0]);
    if (!parsed.ville) return { nom: null, ville: null, pays: null };
    const city = toTitleCase(String(parsed.ville).trim());
    const label = parsed.type === "consulat_general" ? "Consulat général de France" : "Ambassade de France";
    return {
      nom: `${label} à ${city}`,
      ville: city,
      pays: parsed.pays || inferCountryFromCity(city),
    };
  } catch (e) {
    console.error("[pixtral-fallback] exception:", e);
    return { nom: null, ville: null, pays: null };
  }
}

function buildConsulat(authorityLabel: string, rawCity: string) {
  const city = toTitleCase(
    rawCity
      .replace(/^[AaÀà]\s+/, "")
      .replace(/[.:;,]+$/g, "")
      .trim()
  );

  if (!city) {
    return { nom: null, ville: null, pays: null };
  }

  return {
    nom: `${authorityLabel} à ${city}`,
    ville: city,
    pays: inferCountryFromCity(city),
  };
}

function extractConsulatFromText(text: string) {
  if (!text.trim()) {
    return { nom: null, ville: null, pays: null };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i] || "";
    const next = lines[i + 1] || "";
    const next2 = lines[i + 2] || "";
    const currentNorm = normalizeLookup(current);
    const nextNorm = normalizeLookup(next);

    const singleLineConsulat = current.match(/consulat\s+g[ée]n[ée]ral\s+de\s+france\s+[àa]\s+(.+)$/i);
    if (singleLineConsulat?.[1]) {
      return buildConsulat("Consulat général de France", singleLineConsulat[1]);
    }

    const singleLineAmbassade = current.match(/ambassade\s+de\s+france\s+[àa]\s+(.+)$/i);
    if (singleLineAmbassade?.[1]) {
      return buildConsulat("Ambassade de France", singleLineAmbassade[1]);
    }

    if (currentNorm === "consulat general" && nextNorm === "de france" && /^[AaÀà]\s+/.test(next2)) {
      return buildConsulat("Consulat général de France", next2);
    }

    if (currentNorm === "consulat general de france" && /^[AaÀà]\s+/.test(next)) {
      return buildConsulat("Consulat général de France", next);
    }

    if (currentNorm === "ambassade de france" && /^[AaÀà]\s+/.test(next)) {
      return buildConsulat("Ambassade de France", next);
    }
  }

  return { nom: null, ville: null, pays: null };
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DECISION_REFUS_PROMPT = `Tu es un expert en analyse de décisions de refus de visa français.
Analyse ce document et réponds UNIQUEMENT en JSON valide sans aucun texte avant ou après.

Si ce document n'est pas une décision de refus de visa :
{"est_decision_refus": false, "motif_non_reconnaissance": "description du problème"}

Si c'est une décision de refus :
{
  "est_decision_refus": true,
  "lisible": true ou false,
  "score_qualite": 0 à 100,
  "motif_rejet_qualite": null ou description si illisible (parmi: "flou", "sombre", "surexpose", "tronque"),
  "demandeur": {
    "nom": "NOM EN MAJUSCULES ou null",
    "prenom": "Prénom ou null",
    "date_naissance": "JJ/MM/AAAA ou null",
    "lieu_naissance": "lieu ou null",
    "nationalite": "pays ou null",
    "numero_passeport": "numéro ou null"
  },
  "visa": {
    "type_visa": une valeur parmi ["court_sejour_schengen", "long_sejour_etudiant", "long_sejour_conjoint_francais", "long_sejour_salarie", "passeport_talent", "visiteur_parent_enfant_francais", "autre"],
    "type_visa_texte_original": "texte exact du document tel qu'écrit dans l'objet (ex: 'visa de long séjour sollicité en qualité d'ascendant d'un ressortissant de nationalité française')"
  },
  "consulat": {
    "nom": "nom complet de l'autorité émettrice (ex: 'Ambassade de France à Yaoundé', 'Consulat général de France à Casablanca'). DÉDUIS-LE depuis l'en-tête du document même s'il n'est pas explicitement précédé du mot 'Consulat'. ATTENTION : le cartouche peut être écrit sur PLUSIEURS LIGNES VERTICALES (ex: 'CONSULAT GÉNÉRAL' / 'DE FRANCE' / 'À DOUALA') — recompose-le en une seule chaîne. SI L'EN-TÊTE EST ABSENT OU ILLISIBLE : retourne null. NE JAMAIS inventer 'Ambassade' ni écrire 'ville non précisée', 'non visible' ou similaire — laisse null.",
    "ville": "ville extraite du nom (ex: 'Yaoundé', 'Casablanca', 'Dakar', 'Douala'). OBLIGATOIRE si une ambassade/consulat est mentionné(e), même si elle apparaît seule sur une ligne après 'À' ou 'A'. SINON null.",
    "pays": "pays correspondant à la ville (ex: Yaoundé→Cameroun, Douala→Cameroun, Casablanca→Maroc, Dakar→Sénégal, Abidjan→Côte d'Ivoire, Alger→Algérie, Tunis→Tunisie). null si ville inconnue."
  },
  "refus": {
    "date_notification": "JJ/MM/AAAA — RÈGLE STRICTE : utilise TOUJOURS la date de SIGNATURE de l'agent en bas du document (souvent précédée de 'Le' près de la signature, ex: 'Le 13/09/2023. Laurène THOUVENIN'). NE PAS utiliser la date d'enregistrement du dossier en haut (champ 'Date :' à côté du N° de dossier). Si la date de signature est absente, utilise la date du dossier en dernier recours.",
    "motifs_coches": ["A", "F"],
    "motifs_texte_original": ["texte exact motif 1", "texte exact motif 2"],
    "numero_decision": "numéro ou null"
  },
  "destinataire_recours": "crrv_nantes" ou "sous_directeur_visas",
  "langue_document": "fr" ou "ar" ou "en" ou "autre",
  "confiance_extraction": 0 à 100
}

INSTRUCTIONS IMPORTANTES :
- Pour le type_visa, mappe les libellés courants :
  • "ascendant d'un ressortissant de nationalité française" / "ascendant de Français" → "visiteur_parent_enfant_francais"
  • "parent d'enfant français" → "visiteur_parent_enfant_francais"
  • "conjoint de Français" / "conjoint de ressortissant français" → "long_sejour_conjoint_francais"
  • "étudiant" / "études" → "long_sejour_etudiant"
  • "salarié" / "travailleur" → "long_sejour_salarie"
  • "passeport talent" → "passeport_talent"
  • "court séjour" / "Schengen" / "tourisme" / "visite familiale" (court séjour) → "court_sejour_schengen"
- Pour le consulat : si le document indique "AMBASSADE DE FRANCE À [VILLE]" ou "CONSULAT GÉNÉRAL DE FRANCE À [VILLE]" dans l'en-tête, EXTRAIS toujours le nom complet, la ville et le pays correspondant.
- Pour les motifs : lis attentivement les cases cochées (☒, ⊠, ✓, X) et associe chaque texte coché au code A-L correspondant selon ce mapping :
  A=document de voyage non valide, B=but du séjour non justifié, C=ressources insuffisantes, D=assurance, E=hébergement, F=volonté de retour, G=SIS, H=ordre public, I=séjour irrégulier, J=intention matrimoniale, K=dossier incomplet, L=appréciation globale.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossier_id") as string;
    const userId = formData.get("user_id") as string;
    const tunnelMode = formData.get("tunnel_mode") === "true";

    if (!file || !dossierId || !userId) {
      return jsonResponse({ error: "Paramètres manquants : file, dossier_id, user_id" }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    let ownerFirstName = "";
    let ownerLastName = "";

    if (tunnelMode) {
      // In tunnel mode, owner name is passed directly (no dossier in DB yet)
      ownerFirstName = (formData.get("owner_first_name") as string || "").trim().toLowerCase();
      ownerLastName = (formData.get("owner_last_name") as string || "").trim().toLowerCase();
    } else {
      // Fetch dossier owner info for cross-validation
      const { data: dossierOwner } = await supabaseAdmin
        .from("dossiers")
        .select("client_first_name, client_last_name")
        .eq("id", dossierId)
        .single();

      ownerFirstName = (dossierOwner?.client_first_name || "").trim().toLowerCase();
      ownerLastName = (dossierOwner?.client_last_name || "").trim().toLowerCase();
    }

    // ── Step 1: Format & size validation ─────────────────────────────────
    const fileType = file.type;
    const fileSize = file.size;
    const fileName = file.name;

    if (!ACCEPTED_FORMATS.includes(fileType)) {
      return jsonResponse({
        status: "error",
        code: "invalid_format",
        message: "❌ Format non accepté. Seuls les formats PDF, JPG et PNG sont acceptés. Maximum 10 Mo.",
      });
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({
        status: "error",
        code: "file_too_large",
        message: `❌ Fichier trop volumineux (${(fileSize / 1024 / 1024).toFixed(1)} Mo). Compressez votre image et réessayez.`,
      });
    }

    // ── Read & upload file ────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // supabaseAdmin already declared above

    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const storagePath = tunnelMode
      ? `tunnel_temp/${Date.now()}_${Math.random().toString(36).slice(2, 8)}/decision.${ext}`
      : `${dossierId}/decision_refus/decision_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("dossiers")
      .upload(storagePath, bytes, { contentType: fileType, upsert: true });

    if (uploadErr) {
      console.error("[analyze-decision] Upload error:", uploadErr);
      return jsonResponse({ status: "error", code: "upload_failed", message: "Erreur lors de l'upload du fichier." }, 500);
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from("dossiers")
      .createSignedUrl(storagePath, 3600);
    const signedUrl = urlData?.signedUrl;

    // ── Step 2: Mistral OCR ──────────────────────────────────────────────
    const mistralApiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!mistralApiKey) {
      return jsonResponse({ status: "error", code: "config_error", message: "Service OCR non configuré." }, 500);
    }

    let analysisResult: any;
    let ocrRawText = "";
    let firstPageImageB64: string | null = null;
    let firstPageMimeType = "image/jpeg";

    try {
      if (fileType === "application/pdf" && signedUrl) {
        // PDF: use Mistral OCR REST API (include_image_base64 to enable Pixtral fallback)
        const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: { type: "document_url", document_url: signedUrl },
            include_image_base64: true,
          }),
        });

        if (!ocrRes.ok) {
          const errText = await ocrRes.text();
          console.error("[analyze-decision] OCR API error:", ocrRes.status, errText);
          throw new Error(`OCR API error: ${ocrRes.status}`);
        }

        const ocrResponse = await ocrRes.json();

        const allText = (ocrResponse.pages || [])
          .map((p: any) => p.markdown || p.text || "")
          .join("\n");
        ocrRawText = allText;

        // Capture page 1 image for potential Pixtral fallback
        const firstPage = ocrResponse.pages?.[0];
        const firstImg = firstPage?.images?.[0];
        if (firstImg?.image_base64) {
          const raw = firstImg.image_base64 as string;
          if (raw.startsWith("data:")) {
            const m = raw.match(/^data:([^;]+);base64,(.+)$/);
            if (m) { firstPageMimeType = m[1]; firstPageImageB64 = m[2]; }
          } else {
            firstPageImageB64 = raw;
          }
        }

        if (allText.trim().length < 20) {
          return jsonResponse({
            status: "not_recognized",
            message: "❌ Ce document ne semble pas contenir de texte lisible. Photographiez le document en bonne lumière et réessayez.",
          });
        }

        console.log("[analyze-decision] OCR text length:", allText.length, "preview:", allText.substring(0, 300));

        // Analyze extracted text with mistral-large via REST (more reliable than pixtral for extraction)
        const analysisRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "mistral-large-latest",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [{
              role: "user",
              content: `${DECISION_REFUS_PROMPT}\n\nTexte extrait du document :\n${allText.substring(0, 12000)}`,
            }],
          }),
        });

        if (!analysisRes.ok) throw new Error(`Chat API error: ${analysisRes.status}`);
        const analysisResponse = await analysisRes.json();

        const responseText = (analysisResponse.choices?.[0]?.message?.content || "") as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in response");
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        // Image: use pixtral-12b-2409 directly via REST
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binary);
        const mimeType = fileType === "image/png" ? "image/png" : "image/jpeg";

        const visionRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "pixtral-large-latest",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Content}` } },
                { type: "text", text: DECISION_REFUS_PROMPT },
              ],
            }],
          }),
        });

        if (!visionRes.ok) throw new Error(`Vision API error: ${visionRes.status}`);
        const visionResponse = await visionRes.json();

        const responseText = (visionResponse.choices?.[0]?.message?.content || "") as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in response");
        analysisResult = JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      console.error("[analyze-decision] Mistral error:", err);
      return jsonResponse({
        status: "error",
        code: "analysis_failed",
        message: "❌ Analyse impossible. Veuillez réessayer ou photographier le document différemment.",
      });
    }

    // ── Step 3: Process response ─────────────────────────────────────────

    // Case A: Not a refusal decision
    if (!analysisResult.est_decision_refus) {
      return jsonResponse({
        status: "not_recognized",
        message: "❌ Ce document ne semble pas être une décision de refus de visa.\n\nVous cherchez un document remis par le consulat ou l'ambassade après le refus de votre demande.\n\nSi vous ne le retrouvez pas, contactez le consulat pour en obtenir une copie.",
        motif: analysisResult.motif_non_reconnaissance || null,
      });
    }

    // Case B: Unreadable
    if (analysisResult.lisible === false) {
      const motif = (analysisResult.motif_rejet_qualite || "").toLowerCase();
      let advice = "";
      if (motif.includes("flou")) {
        advice = "❌ Document flou\n\n• Posez le document à plat\n• Attendez la mise au point\n• Photographiez en bonne lumière\n• Réessayez";
      } else if (motif.includes("sombre")) {
        advice = "❌ Document trop sombre\n\n• Photographiez sous une lampe\n• Activez le flash\n• Réessayez";
      } else if (motif.includes("surexpos") || motif.includes("clair")) {
        advice = "❌ Document trop clair\n\n• Évitez de photographier face à une fenêtre\n• Désactivez le flash\n• Réessayez";
      } else if (motif.includes("tronqu") || motif.includes("incomplet")) {
        advice = "❌ Document incomplet\n\n• Éloignez-vous pour cadrer tout le document\n• Vérifiez que les quatre coins sont visibles\n• Réessayez";
      } else {
        advice = "❌ Document illisible\n\n• Photographiez le document à plat sous une bonne lumière\n• Tenez l'appareil stable et perpendiculaire\n• Réessayez";
      }

      return jsonResponse({
        status: "unreadable",
        message: advice,
        score_qualite: analysisResult.score_qualite || 0,
      });
    }

    // Case C & D: Extraction with confidence score
    const confidence = analysisResult.confiance_extraction || 0;
    const demandeur = analysisResult.demandeur || {};
    const visa = analysisResult.visa || {};
    const consulat = analysisResult.consulat || {};
    const refus = analysisResult.refus || {};
    const consulatFromText = extractConsulatFromText(ocrRawText);
    const consulatFromNumero = extractConsulatFromNumeroDossier(ocrRawText);
    // Anti-hallucination : si le modèle retourne "ville non précisée", "non visible", etc., on ignore
    const looksHallucinated = (s: string | null | undefined) => !!s && /non\s+pr[ée]cis|non\s+visible|inconnu|non\s+identifi/i.test(s);
    const safeConsulatNom = looksHallucinated(consulat.nom) ? null : (consulat.nom || null);
    const safeConsulatVille = looksHallucinated(consulat.ville) ? null : (consulat.ville || null);

    // Étapes 1-3 : modèle texte, regex, n° de dossier
    let mergedNom = safeConsulatNom || consulatFromText.nom || consulatFromNumero.nom || null;
    let mergedVille = safeConsulatVille || consulatFromText.ville || consulatFromNumero.ville || null;
    let mergedPays = consulat.pays || consulatFromText.pays || consulatFromNumero.pays || inferCountryFromCity(mergedVille);

    // Étape 4 : Pixtral vision sur l'image de la 1ère page (uniquement si tout a échoué et qu'on a l'image)
    let consulatFromPixtral = { nom: null as string | null, ville: null as string | null, pays: null as string | null };
    if (!mergedVille && firstPageImageB64) {
      console.log("[analyze-decision] Consulat introuvable, escalade Pixtral vision...");
      consulatFromPixtral = await extractConsulatViaPixtral(firstPageImageB64, firstPageMimeType, mistralApiKey);
      if (consulatFromPixtral.ville) {
        mergedNom = mergedNom || consulatFromPixtral.nom;
        mergedVille = consulatFromPixtral.ville;
        mergedPays = mergedPays || consulatFromPixtral.pays;
      }
    }

    const finalConsulat = { nom: mergedNom, ville: mergedVille, pays: mergedPays };
    console.log("[analyze-decision] consulat sources:", { model: consulat, fromText: consulatFromText, fromNumero: consulatFromNumero, fromPixtral: consulatFromPixtral, final: finalConsulat });
    // Calculate remaining days
    let delaiRestant: number | null = null;
    if (refus.date_notification) {
      const parts = refus.date_notification.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (parts) {
        const notifDate = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
        const deadline = new Date(notifDate);
        deadline.setDate(deadline.getDate() + 30);
        const today = new Date();
        delaiRestant = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
      }
    }

    const resolvedMotifCodes = resolveMotifCodes(refus.motifs_coches, refus.motifs_texte_original, ocrRawText);
    console.log("[analyze-decision] motif sources:", {
      modelCodes: refus.motifs_coches || [],
      textCodes: inferMotifCodesFromTexts(refus.motifs_texte_original),
      sourceCodes: inferMotifCodesFromTexts([ocrRawText]),
      final: resolvedMotifCodes,
      motifTexts: refus.motifs_texte_original || [],
    });

    // Enrich motifs with labels
    const motifsEnrichis = resolvedMotifCodes.map((code: string) => ({
      code,
      label: MOTIF_LABELS[code] || `Motif ${code}`,
    }));

    // Map visa type
    const visaTypeNormalized = VISA_TYPE_MAP[visa.type_visa] || visa.type_visa || "autre";

    // Determine recipient
    const destinataire = analysisResult.destinataire_recours || 
      (visaTypeNormalized === "court_sejour" ? "sous_directeur_visas" : "crrv_nantes");

    // ── Name cross-validation ──────────────────────────────────────────
    const docNom = (demandeur.nom || "").trim().toLowerCase();
    const docPrenom = (demandeur.prenom || "").trim().toLowerCase();
    let nomMismatch = false;
    if (docNom && ownerLastName) {
      const lastMatch = docNom.includes(ownerLastName) || ownerLastName.includes(docNom);
      const firstMatch = !docPrenom || !ownerFirstName || docPrenom.includes(ownerFirstName) || ownerFirstName.includes(docPrenom);
      nomMismatch = !lastMatch || !firstMatch;
    }

    const warnings: { type: string; message: string }[] = [];
    if (nomMismatch) {
      warnings.push({
        type: "name_mismatch",
        message: `Le nom sur la décision (${demandeur.nom || "?"} ${demandeur.prenom || "?"}) ne correspond pas au titulaire du dossier. Vérifiez que vous avez uploadé le bon document.`,
      });
    }
    if (delaiRestant !== null && delaiRestant < 0) {
      warnings.push({
        type: "deadline_expired",
        message: `Le délai de recours de 30 jours est expiré depuis ${Math.abs(delaiRestant)} jour${Math.abs(delaiRestant) > 1 ? "s" : ""}. Le recours gracieux n'est plus recevable.`,
      });
    }

    const extractedData = {
      demandeur: {
        nom: demandeur.nom || null,
        prenom: demandeur.prenom || null,
        date_naissance: demandeur.date_naissance || null,
        lieu_naissance: demandeur.lieu_naissance || null,
        nationalite: demandeur.nationalite || null,
        numero_passeport: demandeur.numero_passeport || null,
      },
      visa: {
        type_visa: visaTypeNormalized,
        type_visa_texte_original: visa.type_visa_texte_original || null,
      },
      consulat: {
        nom: finalConsulat.nom,
        ville: finalConsulat.ville,
        pays: finalConsulat.pays,
      },
      refus: {
        date_notification: refus.date_notification || null,
        motifs_coches: resolvedMotifCodes,
        motifs_texte_original: refus.motifs_texte_original || [],
        motifs_enrichis: motifsEnrichis,
        numero_decision: refus.numero_decision || null,
      },
      destinataire_recours: destinataire,
      langue_document: analysisResult.langue_document || "fr",
      confiance_extraction: confidence,
      delai_restant_jours: delaiRestant,
      score_qualite: analysisResult.score_qualite || 0,
      url_fichier: storagePath,
      warnings,
      nom_mismatch: nomMismatch,
    };

    // Name mismatch is now a warning, not a block — handled client-side

    if (confidence < 70) {
      return jsonResponse({
        status: "partial",
        message: "Nous avons lu ces informations. Vérifiez et corrigez si nécessaire :",
        data: extractedData,
      });
    }

    return jsonResponse({
      status: "success",
      message: "✅ Votre refus a été lu",
      data: extractedData,
    });

  } catch (err: any) {
    console.error("[analyze-decision] Error:", err);
    return jsonResponse({ status: "error", code: "server_error", message: "Erreur serveur. Veuillez réessayer." }, 500);
  }
});
