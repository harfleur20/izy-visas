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

// Map piece names (from pieces_requises) to expected document types for mismatch detection
function guessExpectedType(nomPiece: string): string {
  const n = nomPiece.toLowerCase();
  if (/passeport|passport/.test(n)) return "passeport";
  if (/décision.*refus|refus.*visa/.test(n)) return "decision_refus";
  if (/relevé.*banc|bank.*statement|relevé.*compte/.test(n)) return "releve_bancaire";
  if (/contrat.*travail|employment/.test(n)) return "contrat_travail";
  if (/campus\s*france/.test(n)) return "attestation_campus_france";
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

const VISION_PROMPT = `Tu es un expert en contrôle qualité de documents juridiques pour demande de visa.

Analyse ce document et réponds UNIQUEMENT en JSON valide sans aucun texte avant ou après.

{
  "lisible": true ou false,
  "score_qualite": nombre entre 0 et 100,
  "motif_rejet": null ou description du problème,
  "type_document_detecte": une valeur parmi [decision_refus, passeport, releve_bancaire, contrat_travail, attestation_campus_france, acte_mariage, acte_naissance, justificatif_hebergement, billet_avion, assurance_voyage, attestation_emploi, certificat_scolarite, justificatif_domicile, reservation_hotel, autre, inconnu],
  "langue_detectee": une valeur parmi [fr, ar, en, autre, mixte],
  "date_detectee": date au format JJ/MM/AAAA ou null si aucune date trouvée,
  "texte_extrait": premiers 500 caractères du texte visible,
  "pages_detectees": nombre de pages,
  "document_tronque": true ou false,
  "texte_manuscrit_present": true ou false,
  "reflet_present": true ou false,
  "angle_excessif": true ou false,
  "problemes_detectes": liste des problèmes détectés sous forme de tableau de strings
}

Critères pour lisible = false :
- Texte principal illisible ou trop flou
- Document trop sombre (score < 40)
- Document surexposé (score < 40)
- Document coupé ou incomplet
- Angle de prise de vue supérieur à 20 degrés
- Reflet majeur couvrant le texte essentiel
- Page blanche ou quasi-vide
- Résolution insuffisante pour lire le texte`;

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

// ── Background OCR processing ───────────────────────────────────────────
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
  const mistralApiKey = Deno.env.get("MISTRAL_API_KEY");
  const ownerIdentity = await loadOwnerIdentity(supabaseAdmin, dossierId, userId);

  if (!mistralApiKey) {
    await supabaseAdmin.from("pieces_justificatives").update({
      statut_ocr: "erreur",
      motif_rejet: "Service OCR non configuré",
    }).eq("id", pieceId);
    return;
  }

  const client = new Mistral({ apiKey: mistralApiKey });
  let ocrResult: MistralOcrResult;

  try {
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
          include_image_base64: false,
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
      const hasText = allText.trim().length > 50;

      ocrResult = {
        lisible: hasText,
        score_qualite: hasText ? 85 : 15,
        motif_rejet: hasText ? null : "Document vide ou texte non extractible",
        type_document_detecte: "autre",
        langue_detectee: /[أ-ي]/.test(allText) ? "ar" : /[a-zA-Z]/.test(allText) ? (/[àâéèêëïôùûüç]/.test(allText) ? "fr" : "en") : "autre",
        date_detectee: null,
        texte_extrait: allText.substring(0, 500),
        pages_detectees: pageCount,
        document_tronque: false,
        texte_manuscrit_present: false,
        reflet_present: false,
        angle_excessif: false,
        problemes_detectes: hasText ? [] : ["Aucun texte détecté"],
      };

      if (hasText) {
        // Fast local classification instead of a second LLM call
        const lowerText = allText.toLowerCase();
        if (/refus[éeè]?\s*(de\s*)?visa|visa\s*refus/i.test(allText)) {
          ocrResult.type_document_detecte = "decision_refus";
        } else if (/passeport|passport/i.test(allText)) {
          ocrResult.type_document_detecte = "passeport";
        } else if (/relevé\s*(de\s*)?compte|bank\s*statement|solde/i.test(allText)) {
          ocrResult.type_document_detecte = "releve_bancaire";
        } else if (/contrat\s*(de\s*)?travail|employment\s*contract/i.test(allText)) {
          ocrResult.type_document_detecte = "contrat_travail";
        } else if (/campus\s*france/i.test(allText)) {
          ocrResult.type_document_detecte = "attestation_campus_france";
        } else if (/acte\s*(de\s*)?mariage|marriage/i.test(allText)) {
          ocrResult.type_document_detecte = "acte_mariage";
        } else if (/acte\s*(de\s*)?naissance|birth/i.test(allText)) {
          ocrResult.type_document_detecte = "acte_naissance";
        } else if (/hébergement|attestation\s*d'accueil/i.test(allText)) {
          ocrResult.type_document_detecte = "justificatif_hebergement";
        } else if (/billet\s*(d')?avion|boarding\s*pass|flight\s*ticket|itinéraire\s*(de\s*)?vol|e-?ticket/i.test(allText)) {
          ocrResult.type_document_detecte = "billet_avion";
        } else if (/assurance\s*(de\s*)?voyage|travel\s*insurance|couverture\s*médicale/i.test(allText)) {
          ocrResult.type_document_detecte = "assurance_voyage";
        } else if (/attestation\s*(d')?emploi|certificat\s*(de\s*)?travail/i.test(allText)) {
          ocrResult.type_document_detecte = "attestation_emploi";
        } else if (/certificat\s*(de\s*)?scolarité|inscription\s*universitaire|student/i.test(allText)) {
          ocrResult.type_document_detecte = "certificat_scolarite";
        } else if (/justificatif\s*(de\s*)?domicile|facture|quittance\s*(de\s*)?loyer/i.test(allText)) {
          ocrResult.type_document_detecte = "justificatif_domicile";
        } else if (/réservation\s*(d')?hôtel|hotel\s*booking|confirmation\s*(de\s*)?réservation/i.test(allText)) {
          ocrResult.type_document_detecte = "reservation_hotel";
        }

        // Extract date with regex
        const dateMatch = allText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dateMatch) {
          ocrResult.date_detectee = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
        }
      }
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
        await supabaseAdmin.from("pieces_justificatives").update({
          statut_ocr: "rejete",
          motif_rejet: "Analyse impossible",
          date_analyse_ocr: new Date().toISOString(),
        }).eq("id", pieceId);
        return;
      }

      ocrResult = JSON.parse(jsonMatch[0]);
    }
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
  const qualityAccepted = ocrResult.lisible && ocrResult.score_qualite >= OCR_SCORE_MINIMUM;
  const rejectionMessage = !qualityAccepted ? getRejectionMessage(ocrResult) : null;
  const effectiveTypeAttendu = isDecisionRefus ? "decision_refus" : guessExpectedType(nomPiece);
  const canAutoCorrectVal = !qualityAccepted && canAutoCorrectCheck(ocrResult, autoCorrect);

  // Type mismatch warning — only when we have a specific expected type
  let typeMismatchWarning: string | null = null;
  if (qualityAccepted && effectiveTypeAttendu !== "autre" && ocrResult.type_document_detecte !== effectiveTypeAttendu) {
    const detectedLabel = TYPE_LABELS[ocrResult.type_document_detecte] || ocrResult.type_document_detecte;
    const attenduLabel = TYPE_LABELS[effectiveTypeAttendu] || effectiveTypeAttendu;
    typeMismatchWarning = `⚠️ Ce document semble être un(e) "${detectedLabel}" alors que nous attendons un(e) "${attenduLabel}". Vérifiez que vous avez sélectionné le bon fichier.`;
  }

  // Decision refus validation
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

  // Language notice
  let languageNotice: string | null = null;
  if (qualityAccepted) {
    if (ocrResult.langue_detectee === "ar") {
      languageNotice = "🌍 Document en arabe détecté — Traduction automatique disponible si nécessaire";
    } else if (ocrResult.langue_detectee === "mixte") {
      languageNotice = "🌍 Document multilingue détecté — Analyse effectuée sur toutes les langues";
    }
  }

  const coutOcr = (ocrResult.pages_detectees || 1) * OCR_COST_PER_PAGE;
  const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";

  // ── Update the existing record with OCR results ────────────────────
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
      type_document_attendu: effectiveTypeAttendu,
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

    if (!file || !dossierId || !userId || !nomPiece) {
      return jsonResponse({ error: "Missing: file, dossier_id, user_id, nom_piece" }, 400);
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

    // ── Read file & upload to storage ───────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
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

    // Get signed URL
    const { data: urlData } = await supabaseAdmin.storage
      .from("dossiers")
      .createSignedUrl(storagePath, 3600);
    const signedUrl = urlData?.signedUrl || null;

    // ── Insert piece with "en_cours" status immediately ─────────────────
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

    // ── Dispatch background OCR via EdgeRuntime.waitUntil ────────────────
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
      // Fallback: run inline (slower but works)
      await processOcrInBackground(
        pieceId, storagePath, signedUrl, bytes, fileType, fileName, fileSize,
        dossierId, userId, nomPiece, typePiece, isDecisionRefus, autoCorrect,
      );
    }

    // ── Return immediately with piece ID ────────────────────────────────
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
