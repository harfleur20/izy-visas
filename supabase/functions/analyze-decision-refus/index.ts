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

const VISA_TYPE_MAP: Record<string, string> = {
  court_sejour_schengen: "court_sejour",
  long_sejour_etudiant: "etudiant",
  long_sejour_conjoint_francais: "conjoint_francais",
  long_sejour_salarie: "salarie",
  passeport_talent: "passeport_talent",
  visiteur_parent_enfant_francais: "visiteur",
  autre: "autre",
};

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
    "type_visa_texte_original": "texte exact du document"
  },
  "consulat": {
    "nom": "nom ou null",
    "ville": "ville ou null",
    "pays": "pays ou null"
  },
  "refus": {
    "date_notification": "JJ/MM/AAAA ou null",
    "motifs_coches": ["A", "F"],
    "motifs_texte_original": ["texte exact motif 1", "texte exact motif 2"],
    "numero_decision": "numéro ou null"
  },
  "destinataire_recours": "crrv_nantes" ou "sous_directeur_visas",
  "langue_document": "fr" ou "ar" ou "en" ou "autre",
  "confiance_extraction": 0 à 100
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossier_id") as string;
    const userId = formData.get("user_id") as string;

    if (!file || !dossierId || !userId) {
      return jsonResponse({ error: "Paramètres manquants : file, dossier_id, user_id" }, 400);
    }

    // Fetch dossier owner info for cross-validation
    const supabaseAdmin = getSupabaseAdmin();
    const { data: dossierOwner } = await supabaseAdmin
      .from("dossiers")
      .select("client_first_name, client_last_name")
      .eq("id", dossierId)
      .single();

    const ownerFirstName = (dossierOwner?.client_first_name || "").trim().toLowerCase();
    const ownerLastName = (dossierOwner?.client_last_name || "").trim().toLowerCase();

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
    const supabaseAdmin = getSupabaseAdmin();

    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const storagePath = `${dossierId}/decision_refus/decision_${Date.now()}.${ext}`;

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

    try {
      if (fileType === "application/pdf" && signedUrl) {
        // PDF: use Mistral OCR REST API
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
          console.error("[analyze-decision] OCR API error:", ocrRes.status, errText);
          throw new Error(`OCR API error: ${ocrRes.status}`);
        }

        const ocrResponse = await ocrRes.json();

        const allText = (ocrResponse.pages || [])
          .map((p: any) => p.markdown || p.text || "")
          .join("\n");

        if (allText.trim().length < 20) {
          return jsonResponse({
            status: "not_recognized",
            message: "❌ Ce document ne semble pas contenir de texte lisible. Photographiez le document en bonne lumière et réessayez.",
          });
        }

        // Analyze extracted text with pixtral via REST
        const analysisRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "pixtral-12b-2409",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `${DECISION_REFUS_PROMPT}\n\nTexte extrait du document :\n${allText.substring(0, 4000)}` },
              ],
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
            model: "pixtral-12b-2409",
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

    // Enrich motifs with labels
    const motifsEnrichis = (refus.motifs_coches || []).map((code: string) => ({
      code,
      label: MOTIF_LABELS[code] || `Motif ${code}`,
    }));

    // Map visa type
    const visaTypeNormalized = VISA_TYPE_MAP[visa.type_visa] || visa.type_visa || "autre";

    // Determine recipient
    const destinataire = analysisResult.destinataire_recours || 
      (visaTypeNormalized === "court_sejour" ? "sous_directeur_visas" : "crrv_nantes");

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
        nom: consulat.nom || null,
        ville: consulat.ville || null,
        pays: consulat.pays || null,
      },
      refus: {
        date_notification: refus.date_notification || null,
        motifs_coches: refus.motifs_coches || [],
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
    };

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
