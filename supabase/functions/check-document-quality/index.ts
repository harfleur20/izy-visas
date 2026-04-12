import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Config ──────────────────────────────────────────────────────────────────

const OCR_QUALITY_THRESHOLD = 60;
const OCR_MIN_BRIGHTNESS = 40;
const OCR_MAX_BRIGHTNESS = 230;
const OCR_MAX_ROTATION = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_FORMATS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MIN_CHARS_NONEMPTY = 50;

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

// ── Google Vision OCR ───────────────────────────────────────────────────────

interface VisionAnnotation {
  text: string;
  confidence: number;
  pages: number;
  fullTextAnnotation?: unknown;
}

async function callGoogleVisionOCR(base64Image: string): Promise<VisionAnnotation> {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY not configured");

  const body = {
    requests: [{
      image: { content: base64Image },
      features: [
        { type: "DOCUMENT_TEXT_DETECTION" },
        { type: "TEXT_DETECTION" },
      ],
      imageContext: {
        languageHints: ["fr", "ar", "en"],
      },
    }],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[OCR] Google Vision API error:", err);
    throw new Error(`Google Vision API error: ${res.status}`);
  }

  const data = await res.json();
  const response = data.responses?.[0];

  if (response?.error) {
    throw new Error(`Vision API: ${response.error.message}`);
  }

  const fullText = response?.fullTextAnnotation;
  const textAnnotations = response?.textAnnotations;

  // Extract text
  const text = fullText?.text || textAnnotations?.[0]?.description || "";

  // Calculate confidence from fullTextAnnotation pages
  let confidence = 0;
  let pages = 1;
  if (fullText?.pages) {
    pages = fullText.pages.length;
    const confidences: number[] = [];
    for (const page of fullText.pages) {
      for (const block of page.blocks || []) {
        if (block.confidence !== undefined) {
          confidences.push(block.confidence);
        }
      }
    }
    if (confidences.length > 0) {
      confidence = (confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length) * 100;
    } else {
      // If no confidence data, estimate from text length
      confidence = text.length > 200 ? 75 : text.length > 50 ? 55 : 20;
    }
  } else if (text.length > 0) {
    confidence = text.length > 200 ? 70 : text.length > 50 ? 50 : 20;
    pages = 1;
  }

  return { text, confidence, pages, fullTextAnnotation: fullText };
}

// ── Image Analysis (luminosity, contrast, rotation from Vision API) ─────

interface ImageAnalysis {
  avgBrightness: number; // 0-255
  contrast: number; // 0-255
  rotation: number; // degrees
  isTruncated: boolean;
  width: number;
  height: number;
}

async function analyzeImageProperties(base64Image: string): Promise<ImageAnalysis> {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY not configured");

  const body = {
    requests: [{
      image: { content: base64Image },
      features: [
        { type: "IMAGE_PROPERTIES" },
        { type: "CROP_HINTS" },
      ],
    }],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    return { avgBrightness: 128, contrast: 128, rotation: 0, isTruncated: false, width: 0, height: 0 };
  }

  const data = await res.json();
  const response = data.responses?.[0];
  const imageProps = response?.imagePropertiesAnnotation;
  const cropHints = response?.cropHintsAnnotation;

  // Extract dominant colors for brightness estimation
  let avgBrightness = 128;
  let contrast = 128;
  if (imageProps?.dominantColors?.colors) {
    const colors = imageProps.dominantColors.colors;
    let totalBrightness = 0;
    let totalWeight = 0;
    let minBrightness = 255;
    let maxBrightness = 0;

    for (const c of colors) {
      const rgb = c.color || {};
      const brightness = ((rgb.red || 0) * 0.299 + (rgb.green || 0) * 0.587 + (rgb.blue || 0) * 0.114);
      const weight = c.pixelFraction || 0;
      totalBrightness += brightness * weight;
      totalWeight += weight;
      if (brightness < minBrightness) minBrightness = brightness;
      if (brightness > maxBrightness) maxBrightness = brightness;
    }

    avgBrightness = totalWeight > 0 ? totalBrightness / totalWeight : 128;
    contrast = maxBrightness - minBrightness;
  }

  // Detect rotation from crop hints
  let rotation = 0;
  if (cropHints?.cropHints?.[0]?.boundingPoly?.vertices) {
    const vertices = cropHints.cropHints[0].boundingPoly.vertices;
    if (vertices.length >= 2) {
      const dx = (vertices[1].x || 0) - (vertices[0].x || 0);
      const dy = (vertices[1].y || 0) - (vertices[0].y || 0);
      rotation = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
      if (rotation > 45) rotation = 90 - rotation; // Normalize
    }
  }

  // Truncation detection: check if crop hints suggest significant cropping
  let isTruncated = false;
  if (cropHints?.cropHints?.[0]?.confidence !== undefined) {
    isTruncated = cropHints.cropHints[0].confidence < 0.5;
  }

  return { avgBrightness, contrast, rotation, isTruncated, width: 0, height: 0 };
}

// ── Quality scoring ─────────────────────────────────────────────────────────

interface QualityResult {
  accepted: boolean;
  score: number;
  ocrConfidence: number;
  brightness: number;
  contrast: number;
  rotation: number;
  text: string;
  pages: number;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  canAutoCorrect: boolean;
  scoreBreakdown: {
    ocr: number;
    brightness: number;
    contrast: number;
    completeness: number;
  };
}

function calculateQuality(
  ocr: VisionAnnotation,
  analysis: ImageAnalysis,
  fileName: string
): QualityResult {
  // Score breakdown (max 100)
  let ocrScore = Math.min(40, (ocr.confidence / 100) * 40);
  let brightnessScore = 20;
  let contrastScore = 20;
  let completenessScore = 20;

  let rejectionCode: string | null = null;
  let rejectionMessage: string | null = null;
  let canAutoCorrect = false;

  // Check condition 7 — Blank page
  if (ocr.text.length < MIN_CHARS_NONEMPTY) {
    rejectionCode = "blank_page";
    rejectionMessage = "❌ Document vide ou illisible\nAucun texte n'a été détecté dans ce document.\n\nConseil :\n- Vérifiez que vous avez uploadé le bon fichier\n- Assurez-vous que le document contient bien du texte visible\n- Réessayez";
    ocrScore = 0;
  }

  // Check condition 2 — Too dark
  if (!rejectionCode && analysis.avgBrightness < OCR_MIN_BRIGHTNESS) {
    rejectionCode = "too_dark";
    rejectionMessage = "❌ Document trop sombre\nLe document est sous-exposé et illisible.\n\nConseil :\n- Placez le document sous une lampe ou près d'une fenêtre\n- Activez le flash de votre téléphone\n- Utilisez le mode 'document' de votre application photo\n- Réessayez";
    brightnessScore = 0;
    canAutoCorrect = true;
  }

  // Check condition 3 — Too bright
  if (!rejectionCode && analysis.avgBrightness > OCR_MAX_BRIGHTNESS && analysis.contrast < 50) {
    rejectionCode = "too_bright";
    rejectionMessage = "❌ Document surexposé\nLe document est trop éclairé et le texte n'est pas lisible.\n\nConseil :\n- Évitez de photographier face à une fenêtre\n- Désactivez le flash\n- Cherchez un éclairage indirect et uniforme\n- Réessayez";
    brightnessScore = 0;
    canAutoCorrect = true;
  }

  // Check condition 5 — Skewed
  if (!rejectionCode && analysis.rotation > OCR_MAX_ROTATION) {
    rejectionCode = "skewed";
    rejectionMessage = "❌ Document trop incliné\nLe document doit être photographié à plat et droit.\n\nConseil :\n- Posez le document sur une surface plane\n- Photographiez directement au-dessus\n- Utilisez les lignes de cadrage de votre appareil photo\n- Réessayez";
    completenessScore = 5;
    canAutoCorrect = true;
  }

  // Check condition 4 — Truncated
  if (!rejectionCode && analysis.isTruncated) {
    rejectionCode = "truncated";
    rejectionMessage = "❌ Document incomplet — Des parties sont coupées\nLa commission doit pouvoir lire l'intégralité du document.\n\nConseil :\n- Éloignez-vous davantage pour cadrer tout le document\n- Vérifiez que les quatre coins sont bien visibles\n- Réessayez";
    completenessScore = 0;
  }

  // Brightness score adjustments
  if (analysis.avgBrightness >= OCR_MIN_BRIGHTNESS && analysis.avgBrightness <= OCR_MAX_BRIGHTNESS) {
    brightnessScore = 20;
  } else if (!rejectionCode) {
    const deviation = analysis.avgBrightness < OCR_MIN_BRIGHTNESS
      ? OCR_MIN_BRIGHTNESS - analysis.avgBrightness
      : analysis.avgBrightness - OCR_MAX_BRIGHTNESS;
    brightnessScore = Math.max(0, 20 - deviation);
  }

  // Contrast score
  if (analysis.contrast >= 80) {
    contrastScore = 20;
  } else {
    contrastScore = Math.max(0, (analysis.contrast / 80) * 20);
  }

  const totalScore = Math.round(ocrScore + brightnessScore + contrastScore + completenessScore);

  // Check condition 1 — OCR too low (only if not already rejected for another reason)
  if (!rejectionCode && ocr.confidence < OCR_QUALITY_THRESHOLD) {
    rejectionCode = "low_ocr";
    rejectionMessage = `❌ Document illisible — Score qualité : ${totalScore}/100\nLa commission ne pourra pas lire ce document.\n\nConseil :\n- Photographiez le document à plat sous une bonne lumière naturelle\n- Tenez l'appareil photo stable et perpendiculaire au document\n- Assurez-vous que tout le texte est visible\n- Réessayez avec cette photo améliorée`;
  }

  const accepted = totalScore >= OCR_QUALITY_THRESHOLD && !rejectionCode;

  return {
    accepted,
    score: totalScore,
    ocrConfidence: Math.round(ocr.confidence),
    brightness: Math.round(analysis.avgBrightness),
    contrast: Math.round(analysis.contrast),
    rotation: Math.round(analysis.rotation * 10) / 10,
    text: ocr.text.substring(0, 2000), // Truncate for storage
    pages: ocr.pages,
    rejectionCode,
    rejectionMessage,
    canAutoCorrect,
    scoreBreakdown: {
      ocr: Math.round(ocrScore),
      brightness: Math.round(brightnessScore),
      contrast: Math.round(contrastScore),
      completeness: Math.round(completenessScore),
    },
  };
}

// ── Decision document validation ────────────────────────────────────────────

interface DecisionValidation {
  looksLikeDecision: boolean;
  warnings: string[];
}

function validateDecisionDocument(text: string): DecisionValidation {
  const lowerText = text.toLowerCase();
  const warnings: string[] = [];

  const hasRefus = /refus[éeè]?|refuse/i.test(lowerText);
  const hasVisa = /visa/i.test(lowerText);

  // Check for a date within the last 12 months
  const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g;
  let hasRecentDate = false;
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    try {
      const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
      const dateCandidate = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]));
      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - 12);
      if (dateCandidate >= monthsAgo && dateCandidate <= new Date()) {
        hasRecentDate = true;
        break;
      }
    } catch { /* skip invalid dates */ }
  }

  const hasConsulat = /consulat|ambassade|consul/i.test(lowerText);

  const looksLikeDecision = hasRefus || hasVisa || hasRecentDate || hasConsulat;

  if (!looksLikeDecision) {
    warnings.push("⚠️ Ce document ne semble pas être une décision de refus de visa. Vérifiez que vous avez uploadé le bon document.");
  }

  return { looksLikeDecision, warnings };
}

// ── Router ──────────────────────────────────────────────────────────────────

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

    // ── Step 1: Format validation ───────────────────────────────────────
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

    // ── Step 2: Read file and convert to base64 ─────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let base64Content: string;
    try {
      // Convert to base64
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Content = btoa(binary);
    } catch {
      return jsonResponse({
        accepted: false,
        rejectionCode: "corrupted",
        rejectionMessage: "❌ Fichier corrompu ou illisible\nCe fichier ne peut pas être ouvert.\n\nConseil :\n- Si c'est un PDF, réenregistrez-le depuis l'application d'origine\n- Si c'est une photo, reprenez la photo et réessayez\n- Vérifiez que le fichier n'est pas protégé par un mot de passe",
        score: 0,
      });
    }

    // ── Step 3: OCR + Image Analysis ────────────────────────────────────
    let ocrResult: VisionAnnotation;
    let imageAnalysis: ImageAnalysis;

    try {
      [ocrResult, imageAnalysis] = await Promise.all([
        callGoogleVisionOCR(base64Content),
        fileType.startsWith("image/")
          ? analyzeImageProperties(base64Content)
          : Promise.resolve({ avgBrightness: 128, contrast: 128, rotation: 0, isTruncated: false, width: 0, height: 0 }),
      ]);
    } catch (err) {
      console.error("[OCR] Analysis failed:", err);
      return jsonResponse({
        accepted: false,
        rejectionCode: "corrupted",
        rejectionMessage: "❌ Fichier corrompu ou illisible\nCe fichier ne peut pas être ouvert.\n\nConseil :\n- Si c'est un PDF, réenregistrez-le depuis l'application d'origine\n- Si c'est une photo, reprenez la photo et réessayez\n- Vérifiez que le fichier n'est pas protégé par un mot de passe",
        score: 0,
      });
    }

    // ── Step 4: Quality assessment ──────────────────────────────────────
    const quality = calculateQuality(ocrResult, imageAnalysis, fileName);

    // ── Decision document validation ────────────────────────────────────
    let decisionValidation: DecisionValidation | null = null;
    if (isDecisionRefus && quality.accepted) {
      decisionValidation = validateDecisionDocument(ocrResult.text);
    }

    // ── Upload original file to storage ─────────────────────────────────
    const supabase = getSupabaseAdmin();
    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const storagePath = `${dossierId}/pieces/${Date.now()}_${nomPiece.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("dossiers")
      .upload(storagePath, bytes, {
        contentType: fileType,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[OCR] Upload error:", uploadErr);
    }

    // ── Get signed URL ──────────────────────────────────────────────────
    const { data: urlData } = await supabase.storage
      .from("dossiers")
      .createSignedUrl(storagePath, 86400);

    // ── Save to database ────────────────────────────────────────────────
    const { data: insertData, error: dbError } = await supabase
      .from("pieces_justificatives")
      .insert({
        dossier_id: dossierId,
        user_id: userId,
        nom_piece: nomPiece,
        type_piece: typePiece,
        statut_ocr: quality.accepted ? "accepte" : "rejete",
        score_qualite: quality.score,
        nombre_pages: quality.pages,
        motif_rejet: quality.rejectionCode,
        correction_appliquee: false,
        url_fichier_original: urlData?.signedUrl || storagePath,
        taille_fichier_ko: Math.round(fileSize / 1024),
        format_fichier: ext,
        ocr_text_extract: quality.text,
        ocr_details: {
          confidence: quality.ocrConfidence,
          brightness: quality.brightness,
          contrast: quality.contrast,
          rotation: quality.rotation,
          scoreBreakdown: quality.scoreBreakdown,
        },
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[OCR] DB insert error:", dbError);
    }

    console.log(`[OCR] ${fileName}: score=${quality.score}, accepted=${quality.accepted}, code=${quality.rejectionCode || "none"}`);

    return jsonResponse({
      id: insertData?.id,
      accepted: quality.accepted,
      score: quality.score,
      pages: quality.pages,
      rejectionCode: quality.rejectionCode,
      rejectionMessage: quality.rejectionMessage,
      canAutoCorrect: quality.canAutoCorrect,
      ocrConfidence: quality.ocrConfidence,
      brightness: quality.brightness,
      contrast: quality.contrast,
      rotation: quality.rotation,
      scoreBreakdown: quality.scoreBreakdown,
      fileUrl: urlData?.signedUrl,
      storagePath,
      decisionValidation,
    });
  } catch (error) {
    console.error("[OCR] Error:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});
