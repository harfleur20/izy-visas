import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Mistral } from "https://esm.sh/@mistralai/mistralai@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const OCR_SCORE_MINIMUM = 60;
const ACCEPTED_FORMATS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const OCR_COST_PER_PAGE = 0.001;

const TYPE_LABELS: Record<string, string> = {
  decision_refus: "Décision de refus de visa",
  passeport: "Passeport",
  releve_bancaire: "Relevé bancaire",
  contrat_travail: "Contrat de travail",
  attestation_campus_france: "Attestation Campus France",
  acte_mariage: "Acte de mariage",
  acte_naissance: "Acte de naissance",
  justificatif_hebergement: "Justificatif d'hébergement",
  billet_avion: "Billet d'avion",
  assurance_voyage: "Assurance voyage",
  attestation_emploi: "Attestation d'emploi",
  certificat_scolarite: "Certificat de scolarité",
  photo_identite: "Photo d'identité",
  formulaire_visa: "Formulaire de demande de visa",
  justificatif_domicile: "Justificatif de domicile",
  lettre_motivation: "Lettre de motivation",
  lettre_invitation: "Lettre d'invitation",
  attestation_hebergement: "Attestation d'hébergement",
  reservation_hotel: "Réservation d'hôtel",
  autre: "Autre document",
  inconnu: "Document non identifié",
};

function guessExpectedType(nomPiece: string): string {
  const n = nomPiece.toLowerCase();
  if (/passeport|passport/.test(n)) return "passeport";
  if (/décision.*refus|refus.*visa/.test(n)) return "decision_refus";
  if (/relevé.*banc|bank.*statement|relevé.*compte/.test(n)) return "releve_bancaire";
  if (/contrat.*travail|employment/.test(n)) return "contrat_travail";
  if (/campus\s*france|accord\s*pr[ée]alable\s*d['']?inscription|attestation\s*[ée]tudes?\s*en\s*france|études?\s*en\s*france/.test(n)) return "attestation_campus_france";
  if (/acte.*mariage|marriage/.test(n)) return "acte_mariage";
  if (/acte.*naissance|birth/.test(n)) return "acte_naissance";
  if (/hébergement|attestation.*accueil/.test(n)) return "justificatif_hebergement";
  if (/billet.*avion|flight.*ticket|boarding|itinéraire.*vol/.test(n)) return "billet_avion";
  if (/assurance.*voyage|travel.*insurance/.test(n)) return "assurance_voyage";
  if (/attestation.*emploi|certificat.*travail/.test(n)) return "attestation_emploi";
  if (/scolarité|inscription.*université|student/.test(n)) return "certificat_scolarite";
  if (/photo.*identité/.test(n)) return "photo_identite";
  if (/formulaire.*visa/.test(n)) return "formulaire_visa";
  if (/justificatif.*domicile|facture|quittance/.test(n)) return "justificatif_domicile";
  if (/lettre.*motivation/.test(n)) return "lettre_motivation";
  if (/lettre.*invitation|invitation/.test(n)) return "lettre_invitation";
  if (/réservation.*hôtel|hotel.*booking/.test(n)) return "reservation_hotel";
  return "autre";
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

interface MistralOcrResult {
  lisible: boolean;
  score_qualite: number;
  motif_rejet: string | null;
  type_document_detecte: string;
  langue_detectee: string;
  date_detectee: string | null;
  texte_extrait: string;
  pages_detectees: number;
  document_tronque: boolean;
  texte_manuscrit_present: boolean;
  reflet_present: boolean;
  angle_excessif: boolean;
  problemes_detectes: string[];
}

type OwnerIdentity = {
  firstName: string;
  lastName: string;
  passportNumber: string;
};

function buildVisionPrompt(expectedType: string, expectedLabel: string): string {
  const hint = expectedType && expectedType !== "autre"
    ? `\n\nINDICE IMPORTANT : Le client a déclaré téléverser un(e) "${expectedLabel}" (type technique : "${expectedType}"). Vérifie si ce document correspond effectivement à ce type avant de le classer autrement.`
    : "";

  return `Tu es un expert en contrôle qualité de documents juridiques pour demande de visa.

Analyse ce document et réponds UNIQUEMENT en JSON valide sans aucun texte avant ou après.

{
  "lisible": true ou false,
  "score_qualite": nombre entre 0 et 100,
  "motif_rejet": null ou description du problème,
  "type_document_detecte": une valeur parmi [decision_refus, passeport, releve_bancaire, contrat_travail, attestation_campus_france, acte_mariage, acte_naissance, justificatif_hebergement, billet_avion, assurance_voyage, attestation_emploi, certificat_scolarite, justificatif_domicile, reservation_hotel, lettre_motivation, lettre_invitation, attestation_hebergement, formulaire_visa, autre, inconnu],
  "langue_detectee": une valeur parmi [fr, ar, en, autre, mixte],
  "date_detectee": date au format JJ/MM/AAAA ou null si aucune date trouvée,
  "texte_extrait": premiers 500 caractères du texte visible (transcris fidèlement, y compris les lignes MRZ commençant par P< ou les codes type AA123456),
  "pages_detectees": nombre de pages,
  "document_tronque": true ou false,
  "texte_manuscrit_present": true ou false,
  "reflet_present": true ou false,
  "angle_excessif": true ou false,
  "problemes_detectes": liste des problèmes détectés sous forme de tableau de strings
}

REPÈRES DE CLASSIFICATION (à utiliser pour distinguer les types proches) :
- "passeport" : page d'identité d'un passeport. Signaux forts : mots "Passeport"/"Passport", "Bearer's signature"/"Signature du titulaire", code pays 3 lettres (CMR, FRA, MAR, DZA, TUN, SEN, CIV…), numéro alphanumérique (ex AA511315), photo d'identité + signature manuscrite, ligne MRZ commençant par "P<" suivie d'un code pays, dates de délivrance/expiration, mention d'une autorité d'émission (Délégué à la Sûreté Nationale, Ministère de l'Intérieur, Direction Générale des Passeports…).
- "formulaire_visa" : formulaire vierge ou rempli de demande de visa Schengen/long séjour rempli par le demandeur, AVEC des cases à cocher, des champs nombreux numérotés (1 à 30+), titre explicite "Demande de visa Schengen" ou "Application for Schengen Visa". JAMAIS un passeport, même si "visa" apparaît dans d'anciens tampons.
- "decision_refus" : courrier officiel d'une ambassade/consulat français notifiant un refus, avec en-tête "République Française", "Notification de refus", références CESEDA L. ou R.
- "lettre_motivation" : texte rédigé à la première personne, paragraphes longs, formule "Madame, Monsieur".

⚠️ Un passeport peut contenir d'anciens visas tamponnés : cela ne fait PAS de lui un "formulaire_visa". La présence d'une MRZ ou de "Bearer's signature" suffit à le classer "passeport".

Critères pour lisible = false :
- Texte principal illisible ou trop flou
- Document trop sombre (score < 40)
- Document surexposé (score < 40)
- Document coupé ou incomplet
- Angle de prise de vue supérieur à 20 degrés
- Reflet majeur couvrant le texte essentiel
- Page blanche ou quasi-vide
- Résolution insuffisante pour lire le texte${hint}`;
}

const VISION_PROMPT = buildVisionPrompt("", "");

function getRejectionMessage(result: MistralOcrResult): string {
  const motif = (result.motif_rejet || "").toLowerCase();
  const score = result.score_qualite;

  if (motif.includes("sombre") || motif.includes("dark")) {
    return `❌ Document trop sombre — Score : ${score}/100\nConseil :\n- Placez le document sous une lampe ou près d'une fenêtre\n- Activez le flash de votre téléphone\n- Réessayez`;
  }
  if (motif.includes("surexpos") || motif.includes("clair") || motif.includes("bright")) {
    return `❌ Document surexposé — Score : ${score}/100\nConseil :\n- Évitez de photographier face à une fenêtre\n- Désactivez le flash\n- Cherchez un éclairage indirect et uniforme\n- Réessayez`;
  }
  if (motif.includes("flou") || motif.includes("blur") || motif.includes("illisible")) {
    return `❌ Document flou ou illisible — Score : ${score}/100\nConseil :\n- Tenez votre téléphone immobile\n- Attendez la mise au point automatique\n- Photographiez à plat sur une surface stable\n- Réessayez`;
  }
  if (result.document_tronque || motif.includes("tronqu") || motif.includes("coup") || motif.includes("incomplet")) {
    return `❌ Document incomplet — Des parties sont coupées\nConseil :\n- Éloignez-vous pour cadrer l'intégralité du document\n- Vérifiez que les quatre coins sont visibles\n- Réessayez`;
  }
  if (result.angle_excessif || motif.includes("inclin") || motif.includes("angle")) {
    return `❌ Document trop incliné\nConseil :\n- Posez le document sur une surface plane\n- Photographiez directement au-dessus\n- Utilisez les lignes de cadrage de l'appareil photo\n- Réessayez`;
  }
  if (result.reflet_present || motif.includes("reflet") || motif.includes("reflect")) {
    return `❌ Reflet détecté sur le document\nConseil :\n- Changez l'angle de prise de vue\n- Évitez les surfaces brillantes\n- Éteignez les lumières directes au-dessus\n- Réessayez`;
  }
  if (motif.includes("vide") || motif.includes("blanc") || motif.includes("empty")) {
    return `❌ Document vide ou illisible\nVérifiez que vous avez uploadé le bon fichier.`;
  }
  return `❌ Document illisible — Score : ${score}/100\nConseil :\n- Photographiez le document à plat sous une bonne lumière naturelle\n- Tenez l'appareil photo stable et perpendiculaire au document\n- Réessayez`;
}

function canAutoCorrectCheck(result: MistralOcrResult, autoCorrect: boolean): boolean {
  return !autoCorrect && (
    (result.motif_rejet || "").toLowerCase().includes("sombre") ||
    (result.motif_rejet || "").toLowerCase().includes("surexpos") ||
    (result.motif_rejet || "").toLowerCase().includes("clair") ||
    result.angle_excessif ||
    result.reflet_present
  );
}

function validateDecisionRefus(result: MistralOcrResult): { valid: boolean; warning: string | null } {
  const text = (result.texte_extrait || "").toLowerCase();
  let matchCount = 0;

  if (/refus[éeè]?|refuse|rejet/i.test(text)) matchCount++;
  if (/visa/i.test(text)) matchCount++;
  if (/consulat|ambassade|consul/i.test(text)) matchCount++;

  if (result.date_detectee) {
    const parts = result.date_detectee.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (parts) {
      const d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - 12);
      if (d >= monthsAgo && d <= new Date()) matchCount++;
    }
  }

  if (matchCount < 2) {
    return {
      valid: false,
      warning: "⚠️ Ce document ne semble pas être une décision de refus de visa. Vérifiez que vous avez uploadé le bon document.",
    };
  }
  return { valid: true, warning: null };
}

function normalizeForIdentity(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function significantTokens(value?: string | null): string[] {
  return normalizeForIdentity(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function requiresOwnerIdentityCheck(expectedType: string, nomPiece: string): boolean {
  const normalizedName = normalizeForIdentity(nomPiece);
  return (
    ["decision_refus", "passeport", "formulaire_visa"].includes(expectedType) ||
    /decision.*refus|refus.*visa|passeport|passport|formulaire.*visa/.test(normalizedName)
  );
}

function textMatchesOwnerIdentity(text: string, owner: OwnerIdentity): boolean {
  const normalizedText = normalizeForIdentity(text);
  if (!normalizedText) return false;

  const lastTokens = significantTokens(owner.lastName);
  const firstTokens = significantTokens(owner.firstName);
  const passport = normalizeForIdentity(owner.passportNumber).replace(/\s/g, "");

  const lastMatches = lastTokens.length === 0 || lastTokens.some((token) => normalizedText.includes(token));
  const firstMatches = firstTokens.length === 0 || firstTokens.some((token) => normalizedText.includes(token));
  const passportMatches = !passport || normalizedText.replace(/\s/g, "").includes(passport);

  return (lastMatches && firstMatches) || passportMatches;
}

async function loadOwnerIdentity(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  dossierId: string,
  userId: string,
): Promise<OwnerIdentity> {
  const { data: dossier } = await supabaseAdmin
    .from("dossiers")
    .select("client_first_name, client_last_name, client_passport_number")
    .eq("id", dossierId)
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, passport_number")
    .eq("id", userId)
    .maybeSingle();

  return {
    firstName: dossier?.client_first_name || profile?.first_name || "",
    lastName: dossier?.client_last_name || profile?.last_name || "",
    passportNumber: dossier?.client_passport_number || profile?.passport_number || "",
  };
}

// ── Strong heuristics on extracted text to override misclassification ──
// Some documents (passports especially) are systematically misclassified by
// vision models. We apply deterministic post-checks based on the OCR text.
function applyClassificationOverrides(result: MistralOcrResult, allText: string) {
  const text = allText || "";

  // MRZ (Machine Readable Zone) detection — passport-only signature
  // Standard ICAO 9303 passport MRZ: line starts with "P<" + 3-letter country code
  const mrzPassport = /\bP[<KN][A-Z]{3}[A-Z<0-9]{20,}/.test(text)
    || /[A-Z0-9<]{30,}\s*[A-Z0-9<]{30,}/m.test(text);

  // Strong passport indicators (explicit terms found on ID page)
  const passportKeywords =
    /(passe?port\s*n[°o]?\b|bearer'?s?\s*signature|signature\s*du\s*titulaire|date\s*d[''\s]?expiration\s*\/\s*date\s*of\s*expiry|date\s*of\s*issue|place\s*of\s*birth\s*\/\s*lieu\s*de\s*naissance|d[ée]l[ée]gu[ée]\s*g[ée]n[ée]ral\s*[àa]\s*la\s*sûret[ée]\s*nationale|country\s*code|république\s*du\s*[a-zàâéèêëïôùûüç]+\s*\/\s*republic\s*of)/i.test(text);

  if (mrzPassport || passportKeywords) {
    if (result.type_document_detecte !== "passeport") {
      console.log(`[OCR] Override classification → passeport (MRZ=${mrzPassport}, keywords=${passportKeywords}), was=${result.type_document_detecte}`);
      result.type_document_detecte = "passeport";
    }
  }
}

// ── Run OCR analysis (shared between tunnel and normal modes) ──────────
async function runOcrAnalysis(
  bytes: Uint8Array,
  fileType: string,
  fileName: string,
  signedUrl: string | null,
  expectedType: string = "",
): Promise<MistralOcrResult> {
  const mistralApiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!mistralApiKey) {
    throw new Error("Service OCR non configuré");
  }

  const client = new Mistral({ apiKey: mistralApiKey });

  if (fileType === "application/pdf" && signedUrl) {
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
      console.error("[OCR] Mistral OCR API error:", ocrRes.status, errText);
      throw new Error(`OCR API error: ${ocrRes.status}`);
    }

    const ocrResponse = await ocrRes.json();
    const allText = (ocrResponse.pages || [])
      .map((p: any) => p.markdown || p.text || "")
      .join("\n");
    const pageCount = ocrResponse.pages?.length || 1;

    // ── Detect "useful text" ──────────────────────────────────────────
    // Mistral OCR sometimes returns mostly image placeholders (![img-0.jpeg])
    // or machine-readable bands (MRZ, barcodes) without extracting the actual
    // human-readable content. This happens on ANY scanned PDF: passports,
    // birth certificates, marriage certificates, old photographed payslips,
    // handwritten letters, low-quality scans, etc.
    const usefulText = allText
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // strip ![img-0.jpeg](img-0.jpeg)
      .replace(/^[A-Z0-9<]{20,}$/gm, "")     // strip MRZ / barcode lines
      .replace(/[^a-zA-Zàâäéèêëïîôöùûüç\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = usefulText.split(" ").filter((w) => w.length >= 3).length;
    let hasText = allText.trim().length > 50 && wordCount >= 8;
    let finalText = allText;

    if (!hasText) {
      console.log(`[OCR] Insufficient useful text: total=${allText.length}, useful_words=${wordCount} — triggering Pixtral fallback`);
    }

    // ── Pixtral Vision Fallback (universal, all scanned doc types) ────
    // For any PDF where Mistral OCR couldn't extract meaningful text
    // (scanned passports, IDs, certificates, photos of documents,
    // handwritten content, etc.), send the page images to Pixtral vision
    // which performs proper OCR on the visual content.
    if (!hasText) {
      const pageImages: string[] = [];
      for (const page of (ocrResponse.pages || []).slice(0, 3)) {
        const img = page?.images?.[0];
        const b64 = img?.image_base64 || img?.base64;
        if (b64) {
          pageImages.push(b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`);
        }
      }

      if (pageImages.length > 0) {
        console.log(`[OCR] Falling back to Pixtral vision on ${pageImages.length} page(s)`);
        try {
          const expectedLabel = TYPE_LABELS[expectedType] || "";
          const visionRes = await client.chat.complete({
            model: "pixtral-12b-2409",
            messages: [{
              role: "user",
              content: [
                ...pageImages.map((url) => ({ type: "image_url" as const, imageUrl: { url } })),
                { type: "text" as const, text: buildVisionPrompt(expectedType, expectedLabel) },
              ],
            }],
          });
          const responseText = (visionRes.choices?.[0]?.message?.content || "") as string;
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const visionResult = JSON.parse(jsonMatch[0]) as MistralOcrResult;
            visionResult.pages_detectees = pageCount;
            // Apply deterministic overrides on Pixtral output (especially passport MRZ)
            applyClassificationOverrides(visionResult, visionResult.texte_extrait || "");
            console.log(`[OCR] Pixtral fallback success: score=${visionResult.score_qualite}, type=${visionResult.type_document_detecte}, pages_analyzed=${pageImages.length}`);
            return visionResult;
          }
          console.warn("[OCR] Pixtral returned non-JSON response, keeping text-based result");
        } catch (visionErr) {
          console.error("[OCR] Pixtral fallback failed:", visionErr);
        }
      } else {
        console.warn("[OCR] No page images returned by Mistral OCR — Pixtral fallback skipped");
      }
    }

    const result: MistralOcrResult = {
      lisible: hasText,
      score_qualite: hasText ? 85 : 15,
      motif_rejet: hasText ? null : "Document vide ou texte non extractible",
      type_document_detecte: "autre",
      langue_detectee: /[أ-ي]/.test(finalText) ? "ar" : /[a-zA-Z]/.test(finalText) ? (/[àâéèêëïôùûüç]/.test(finalText) ? "fr" : "en") : "autre",
      date_detectee: null,
      texte_extrait: finalText.substring(0, 500),
      pages_detectees: pageCount,
      document_tronque: false,
      texte_manuscrit_present: false,
      reflet_present: false,
      angle_excessif: false,
      problemes_detectes: hasText ? [] : ["Aucun texte détecté"],
    };

    if (hasText) {
      classifyDocumentType(result, finalText);
      const dateMatch = finalText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dateMatch) {
        result.date_detectee = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      }
    }

    return result;
  } else {
    // Images: convert to base64 and use Pixtral vision
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Content = btoa(binary);
    const mimeType = fileType === "image/png" ? "image/png" : "image/jpeg";

    const visionResponse = await client.chat.complete({
      model: "pixtral-12b-2409",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", imageUrl: { url: `data:${mimeType};base64,${base64Content}` } },
          { type: "text", text: VISION_PROMPT },
        ],
      }],
    });

    const responseText = (visionResponse.choices?.[0]?.message?.content || "") as string;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Analyse impossible");
    }

    return JSON.parse(jsonMatch[0]);
  }
}

function classifyDocumentType(result: MistralOcrResult, allText: string) {
  // Order matters: most specific first, broadest last
  // Campus France BEFORE decision_refus to avoid false positives on "refus" keyword
  if (/campus\s*france|accord\s*pr[ée]alable\s*d['']?inscription|attestation\s*[ée]tudes?\s*en\s*france|études?\s*en\s*france|CM\d{2}-\d{4,6}-C\d{2}|avis\s*p[ée]dagogique|confirmation\s*of\s*acceptance|pre-?enrollment/i.test(allText)) {
    result.type_document_detecte = "attestation_campus_france";
  } else if (/notification\s*de\s*refus|refus[éeè]?\s*(de\s*)?visa|visa\s*refus|d[ée]cision\s*de\s*refus/i.test(allText)) {
    result.type_document_detecte = "decision_refus";
  } else if (/lettre\s*de\s*motivation|projet\s*(d['']?[ée]tudes?|professionnel|d['']?int[ée]gration)|motivation\s*letter|statement\s*of\s*purpose|personal\s*statement|madame[,\s]+monsieur[\s\S]{0,400}(motivation|projet|formation|[ée]tudes|candidature|int[ée]grer|poursuivre)/i.test(allText)) {
    result.type_document_detecte = "lettre_motivation";
  } else if (/passeport|passport/i.test(allText)) {
    result.type_document_detecte = "passeport";
  } else if (/relevé\s*(de\s*)?compte|bank\s*statement|solde\s*(comptable|créditeur|disponible)|opérations?\s*bancaire|account\s*statement|extrait\s*(de\s*)?compte|mouvement[s]?\s*(de\s*)?compte|historique\s*(des?\s*)?transaction|récapitulatif\s*(de\s*)?compte|situation\s*(de\s*)?compte|état\s*(de\s*)?compte|relevé\s*bancaire|relevé\s*d['']?identité\s*bancaire|RIB|IBAN\s*[A-Z]{2}\d|BIC\s*[A-Z]{4}|débit.*crédit|crédit.*débit|date\s*(de\s*)?valeur|solde\s*(en\s*)?fin|solde\s*(au|en)\s*\d|nouveau\s*solde|ancien\s*solde|total\s*des?\s*(débit|crédit)|numéro\s*(de\s*)?compte|n°\s*compte|account\s*(number|no)|balance\s*(forward|brought)|closing\s*balance|opening\s*balance|statement\s*(of\s*)?account|transaction\s*history|account\s*summary/i.test(allText)) {
    result.type_document_detecte = "releve_bancaire";
  } else if (/contrat\s*(de\s*)?travail|employment\s*contract|embauche/i.test(allText)) {
    result.type_document_detecte = "contrat_travail";
  } else if (/campus\s*france|accord\s*pr[ée]alable\s*d['']?inscription|attestation\s*[ée]tudes?\s*en\s*france|études?\s*en\s*france|CM\d{2}-\d{4,6}-C\d{2}|avis\s*p[ée]dagogique/i.test(allText)) {
    result.type_document_detecte = "attestation_campus_france";
  } else if (/acte\s*(de\s*)?mariage|marriage/i.test(allText)) {
    result.type_document_detecte = "acte_mariage";
  } else if (/acte\s*(de\s*)?naissance|birth/i.test(allText)) {
    result.type_document_detecte = "acte_naissance";
  } else if (/hébergement|attestation\s*d'accueil/i.test(allText)) {
    result.type_document_detecte = "justificatif_hebergement";
  } else if (/billet\s*(d[''])?avion|boarding\s*pass|flight\s*ticket|itin[ée]raire\s*(de\s*)?vol|e-?ticket|flight\s+[A-Z]{2}\s*\d|booking\s*ref|departure.*arrival|baggage\s*allowance|reservation\s*confirm/i.test(allText)) {
    result.type_document_detecte = "billet_avion";
  } else if (/attestation\s*(d[''])?assurance|assurance\s*(de\s*)?voyage|travel\s*insurance|couverture\s*m[ée]dicale|police\s*(d[''])?assurance|garanties?\s*souscrite|assistance\s*police|assurance\s*maladie/i.test(allText)) {
    result.type_document_detecte = "assurance_voyage";
  } else if (/attestation\s*(d[''])?emploi|certificat\s*(de\s*)?travail/i.test(allText)) {
    result.type_document_detecte = "attestation_emploi";
  } else if (/certificat\s*(de\s*)?scolarit[ée]|inscription\s*universitaire|student/i.test(allText)) {
    result.type_document_detecte = "certificat_scolarite";
  } else if (/justificatif\s*(de\s*)?domicile|facture|quittance\s*(de\s*)?loyer/i.test(allText)) {
    result.type_document_detecte = "justificatif_domicile";
  } else if (/r[ée]servation\s*(d[''])?h[ôo]tel|hotel\s*booking|confirmation\s*(de\s*)?r[ée]servation/i.test(allText)) {
    result.type_document_detecte = "reservation_hotel";
  }
}

// ── Background OCR processing (normal mode with DB) ─────────────────────
async function processOcrInBackground(
  pieceId: string,
  storagePath: string,
  signedUrl: string | null,
  bytes: Uint8Array,
  fileType: string,
  fileName: string,
  fileSize: number,
  dossierId: string,
  userId: string,
  nomPiece: string,
  typePiece: string,
  isDecisionRefus: boolean,
  autoCorrect: boolean,
) {
  const supabaseAdmin = getSupabaseAdmin();
  const ownerIdentity = await loadOwnerIdentity(supabaseAdmin, dossierId, userId);

  let ocrResult: MistralOcrResult;

  try {
    ocrResult = await runOcrAnalysis(bytes, fileType, fileName, signedUrl);
  } catch (err: any) {
    console.error("[OCR] Mistral API error:", err);
    await supabaseAdmin.from("pieces_justificatives").update({
      statut_ocr: "erreur",
      motif_rejet: "Fichier corrompu ou illisible",
      date_analyse_ocr: new Date().toISOString(),
    }).eq("id", pieceId);
    return;
  }

  // ── Determine acceptance ────────────────────────────────────────────
  const { accepted, rejectionMessage, typeMismatchWarning, decisionWarning, identityWarning, canAutoCorrectVal } =
    evaluateOcrResult(ocrResult, isDecisionRefus, nomPiece, ownerIdentity, autoCorrect);

  const businessRejection = typeMismatchWarning || decisionWarning || identityWarning;

  // Language notice
  let languageNotice: string | null = null;
  if (accepted) {
    if (ocrResult.langue_detectee === "ar") {
      languageNotice = "🌍 Document en arabe détecté — Traduction automatique disponible si nécessaire";
    } else if (ocrResult.langue_detectee === "mixte") {
      languageNotice = "🌍 Document multilingue détecté — Analyse effectuée sur toutes les langues";
    }
  }

  const coutOcr = (ocrResult.pages_detectees || 1) * OCR_COST_PER_PAGE;
  const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";

  const { error: dbError } = await supabaseAdmin
    .from("pieces_justificatives")
    .update({
      statut_ocr: accepted ? "accepte" : "rejete",
      score_qualite: ocrResult.score_qualite,
      nombre_pages: ocrResult.pages_detectees || 1,
      motif_rejet: accepted ? null : (businessRejection || rejectionMessage || ocrResult.motif_rejet || "qualité insuffisante"),
      correction_appliquee: autoCorrect,
      taille_fichier_ko: Math.round(fileSize / 1024),
      format_fichier: ext,
      ocr_text_extract: (ocrResult.texte_extrait || "").substring(0, 500),
      ocr_details: {
        problemes: ocrResult.problemes_detectes,
        reflet: ocrResult.reflet_present,
        angle: ocrResult.angle_excessif,
        manuscrit: ocrResult.texte_manuscrit_present,
        canAutoCorrect: canAutoCorrectVal,
        typeMismatchWarning,
        decisionWarning,
        identityWarning,
        languageNotice,
      },
      type_document_detecte: ocrResult.type_document_detecte,
      type_document_attendu: isDecisionRefus ? "decision_refus" : guessExpectedType(nomPiece),
      langue_detectee: ocrResult.langue_detectee,
      date_detectee: ocrResult.date_detectee,
      pages_detectees: ocrResult.pages_detectees || 1,
      document_tronque: ocrResult.document_tronque,
      texte_manuscrit: ocrResult.texte_manuscrit_present,
      problemes_detectes: ocrResult.problemes_detectes || [],
      date_analyse_ocr: new Date().toISOString(),
      cout_ocr_estime: coutOcr,
    })
    .eq("id", pieceId);

  if (dbError) {
    console.error("[OCR] DB update error:", dbError);
  }

  console.log(`[OCR] ${fileName}: score=${ocrResult.score_qualite}, accepted=${accepted}, type=${ocrResult.type_document_detecte}`);
}

// ── Shared evaluation logic ──────────────────────────────────────────
function evaluateOcrResult(
  ocrResult: MistralOcrResult,
  isDecisionRefus: boolean,
  nomPiece: string,
  ownerIdentity: OwnerIdentity,
  autoCorrect: boolean,
) {
  const qualityAccepted = ocrResult.lisible && ocrResult.score_qualite >= OCR_SCORE_MINIMUM;
  const rejectionMessage = !qualityAccepted ? getRejectionMessage(ocrResult) : null;
  const effectiveTypeAttendu = isDecisionRefus ? "decision_refus" : guessExpectedType(nomPiece);
  const canAutoCorrectVal = !qualityAccepted && canAutoCorrectCheck(ocrResult, autoCorrect);

  let typeMismatchWarning: string | null = null;
  if (qualityAccepted && effectiveTypeAttendu !== "autre" && ocrResult.type_document_detecte !== effectiveTypeAttendu) {
    const detectedLabel = TYPE_LABELS[ocrResult.type_document_detecte] || ocrResult.type_document_detecte;
    const attenduLabel = TYPE_LABELS[effectiveTypeAttendu] || effectiveTypeAttendu;
    typeMismatchWarning = `⚠️ Ce document semble être un(e) "${detectedLabel}" alors que nous attendons un(e) "${attenduLabel}". Vérifiez que vous avez sélectionné le bon fichier.`;
  }

  let decisionWarning: string | null = null;
  if (isDecisionRefus && qualityAccepted) {
    const validation = validateDecisionRefus(ocrResult);
    if (!validation.valid) {
      decisionWarning = validation.warning;
    }
  }

  let identityWarning: string | null = null;
  if (
    qualityAccepted &&
    requiresOwnerIdentityCheck(effectiveTypeAttendu, nomPiece) &&
    (ownerIdentity.firstName || ownerIdentity.lastName || ownerIdentity.passportNumber) &&
    !textMatchesOwnerIdentity(ocrResult.texte_extrait || "", ownerIdentity)
  ) {
    const ownerName = [ownerIdentity.firstName, ownerIdentity.lastName].filter(Boolean).join(" ");
    identityWarning = `⚠️ Ce document ne semble pas correspondre au titulaire du dossier${ownerName ? ` (${ownerName})` : ""}. Déposez un document au nom du client.`;
  }

  const businessRejection = typeMismatchWarning || decisionWarning || identityWarning;
  const accepted = qualityAccepted && !businessRejection;

  return { accepted, qualityAccepted, rejectionMessage, typeMismatchWarning, decisionWarning, identityWarning, canAutoCorrectVal };
}

// ── Main handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossier_id") as string;
    const userId = formData.get("user_id") as string;
    const nomPiece = formData.get("nom_piece") as string;
    const typePiece = formData.get("type_piece") as string || "optionnelle";
    const isDecisionRefus = formData.get("is_decision_refus") === "true";
    const autoCorrect = formData.get("auto_correct") === "true";

    // ── Tunnel mode: OCR only, no DB, no storage ───────────────────────
    const tunnelMode = formData.get("tunnel_mode") === "true";
    const ownerFirstName = formData.get("owner_first_name") as string || "";
    const ownerLastName = formData.get("owner_last_name") as string || "";
    const ownerPassportNumber = formData.get("owner_passport_number") as string || "";

    if (!file || !nomPiece) {
      return jsonResponse({ error: "Missing: file, nom_piece" }, 400);
    }

    if (!tunnelMode && (!dossierId || !userId)) {
      return jsonResponse({ error: "Missing: dossier_id, user_id" }, 400);
    }

    // ── Format validation ───────────────────────────────────────────────
    const fileType = file.type;
    const fileSize = file.size;
    const fileName = file.name;

    if (!ACCEPTED_FORMATS.includes(fileType)) {
      return jsonResponse({
        accepted: false,
        rejectionCode: "invalid_format",
        rejectionMessage: "❌ Format non accepté. Seuls les formats PDF, JPG et PNG sont acceptés. Taille maximum : 10 Mo.",
        score: 0,
      });
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({
        accepted: false,
        rejectionCode: "file_too_large",
        rejectionMessage: `❌ Fichier trop volumineux (${(fileSize / 1024 / 1024).toFixed(1)} Mo). La taille maximum est de 10 Mo.`,
        score: 0,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // ── TUNNEL MODE: synchronous OCR, return result directly ────────────
    if (tunnelMode) {
      let signedUrl: string | null = null;

      // For PDFs in tunnel mode, we need a temporary URL - upload to temp storage
      if (fileType === "application/pdf") {
        const supabaseAdmin = getSupabaseAdmin();
        const tempPath = `tunnel_temp/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
        await supabaseAdmin.storage.from("dossiers").upload(tempPath, bytes, { contentType: fileType, upsert: true });
        const { data: urlData } = await supabaseAdmin.storage.from("dossiers").createSignedUrl(tempPath, 300);
        signedUrl = urlData?.signedUrl || null;

        // Schedule cleanup
        // @ts-ignore
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(
            (async () => {
              await new Promise(r => setTimeout(r, 60000));
              await supabaseAdmin.storage.from("dossiers").remove([tempPath]);
            })()
          );
        }
      }

      try {
        const ocrResult = await runOcrAnalysis(bytes, fileType, fileName, signedUrl);

        const ownerIdentity: OwnerIdentity = {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          passportNumber: ownerPassportNumber,
        };

        const evaluation = evaluateOcrResult(ocrResult, isDecisionRefus, nomPiece, ownerIdentity, autoCorrect);

        console.log(`[OCR-TUNNEL] ${fileName}: score=${ocrResult.score_qualite}, accepted=${evaluation.accepted}, type=${ocrResult.type_document_detecte}, text_snippet=${(ocrResult.texte_extrait || "").substring(0, 500)}`);

        return jsonResponse({
          accepted: evaluation.accepted,
          score: ocrResult.score_qualite,
          type_document_detecte: ocrResult.type_document_detecte,
          rejectionMessage: evaluation.accepted ? null : (evaluation.typeMismatchWarning || evaluation.identityWarning || evaluation.decisionWarning || evaluation.rejectionMessage || ocrResult.motif_rejet),
          typeMismatchWarning: evaluation.typeMismatchWarning,
          identityWarning: evaluation.identityWarning,
          problemes: ocrResult.problemes_detectes,
        });
      } catch (err: any) {
        console.error("[OCR-TUNNEL] Error:", err);
        return jsonResponse({
          accepted: false,
          rejectionCode: "ocr_error",
          rejectionMessage: "❌ Erreur lors de l'analyse. Veuillez réessayer.",
          score: 0,
        });
      }
    }

    // ── NORMAL MODE: upload to storage + background OCR ─────────────────
    const supabaseAdmin = getSupabaseAdmin();
    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const storagePath = `${dossierId}/pieces/${Date.now()}_${nomPiece.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("dossiers")
      .upload(storagePath, bytes, { contentType: fileType, upsert: true });

    if (uploadErr) {
      console.error("[OCR] Upload error:", uploadErr);
      return jsonResponse({ error: "Erreur lors de l'upload du fichier" }, 500);
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from("dossiers")
      .createSignedUrl(storagePath, 3600);
    const signedUrl = urlData?.signedUrl || null;

    const { data: insertData, error: dbError } = await supabaseAdmin
      .from("pieces_justificatives")
      .insert({
        dossier_id: dossierId,
        user_id: userId,
        nom_piece: nomPiece,
        type_piece: typePiece,
        statut_ocr: "en_cours",
        moteur_ocr: "mistral-ocr-latest",
        score_qualite: 0,
        nombre_pages: 1,
        url_fichier_original: signedUrl || storagePath,
        taille_fichier_ko: Math.round(fileSize / 1024),
        format_fichier: ext,
      })
      .select("id")
      .single();

    if (dbError || !insertData) {
      console.error("[OCR] DB insert error:", dbError);
      return jsonResponse({ error: "Erreur base de données" }, 500);
    }

    const pieceId = insertData.id;

    // @ts-ignore: EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processOcrInBackground(
          pieceId, storagePath, signedUrl, bytes, fileType, fileName, fileSize,
          dossierId, userId, nomPiece, typePiece, isDecisionRefus, autoCorrect,
        )
      );
    } else {
      await processOcrInBackground(
        pieceId, storagePath, signedUrl, bytes, fileType, fileName, fileSize,
        dossierId, userId, nomPiece, typePiece, isDecisionRefus, autoCorrect,
      );
    }

    return jsonResponse({
      id: pieceId,
      status: "analyzing",
      storagePath,
      fileUrl: signedUrl,
    }, 202);

  } catch (error: any) {
    console.error("[OCR] Error:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});
