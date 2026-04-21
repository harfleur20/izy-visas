import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateDossierRef(): string {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `IZY-${y}${m}-${rand}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { identity, ocrData, pieces, letterContent, optionChoisie } = await req.json();

    if (!identity || !ocrData) {
      return new Response(JSON.stringify({ error: "Données tunnel manquantes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has a dossier
    const { data: existingDossier } = await supabaseAdmin
      .from("dossiers")
      .select("id, dossier_ref")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingDossier) {
      return new Response(
        JSON.stringify({
          success: true,
          dossier_ref: existingDossier.dossier_ref,
          message: "Dossier existant trouvé",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dossierRef = generateDossierRef();

    // Normalize dates: accept "JJ/MM/AAAA", "JJ-MM-AAAA" or ISO "AAAA-MM-JJ"
    const toIsoDate = (value: unknown): string | null => {
      if (!value || typeof value !== "string") return null;
      const v = value.trim();
      if (!v) return null;
      // Already ISO
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      // JJ/MM/AAAA or JJ-MM-AAAA
      const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return null;
    };

    const dateNotifIso = toIsoDate(ocrData.dateNotificationRefus);
    const dateNaissanceIso = toIsoDate(identity.dateNaissance);

    // Determine recipient from OCR
    const destinataire = ocrData.destinataireRecours || "Commission de recours contre les décisions de refus de visa";
    let recipientName = destinataire;
    let recipientAddress = "BP 83609";
    let recipientPostalCode = "44036";
    let recipientCity = "Nantes Cedex 1";

    if (destinataire.toLowerCase().includes("nantes") || destinataire.toLowerCase().includes("crrv") || destinataire.toLowerCase().includes("commission")) {
      recipientName = "Commission de Recours contre les Refus de Visa";
      recipientAddress = "BP 83609";
      recipientPostalCode = "44036";
      recipientCity = "Nantes Cedex 1";
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from("dossiers")
      .insert({
        user_id: user.id,
        dossier_ref: dossierRef,
        visa_type: ocrData.visaType || "court_sejour",
        type_visa_texte_original: ocrData.typeVisaTexteOriginal || null,
        client_first_name: identity.firstName,
        client_last_name: identity.lastName,
        client_email: user.email || null,
        client_date_naissance: identity.dateNaissance || null,
        client_lieu_naissance: identity.lieuNaissance || null,
        client_nationalite: identity.nationalite || null,
        client_passport_number: identity.passportNumber || null,
        consulat_nom: ocrData.consulatNom || null,
        consulat_ville: ocrData.consulatVille || null,
        consulat_pays: ocrData.consulatPays || null,
        date_notification_refus: ocrData.dateNotificationRefus || null,
        motifs_refus: ocrData.motifsRefus || [],
        motifs_texte_original: ocrData.motifsTexteOriginal || [],
        numero_decision: ocrData.numeroDecision || null,
        destinataire_recours: ocrData.destinataireRecours || null,
        langue_document: ocrData.langueDocument || null,
        score_ocr_decision: ocrData.scoreOcr || 0,
        lettre_neutre_contenu: letterContent || null,
        date_generation_neutre: letterContent ? new Date().toISOString() : null,
        option_choisie: optionChoisie || "B",
        recipient_name: recipientName,
        recipient_address: recipientAddress,
        recipient_postal_code: recipientPostalCode,
        recipient_city: recipientCity,
        lrar_status: "pending",
        date_qualification: new Date().toISOString(),
      })
      .select("id, dossier_ref")
      .single();

    if (dossierError) {
      console.error("Dossier creation error:", dossierError);
      return new Response(
        JSON.stringify({ error: "Erreur création dossier: " + dossierError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create piece records (files will need to be re-uploaded in client space)
    if (pieces && Array.isArray(pieces) && pieces.length > 0) {
      const pieceRecords = pieces.map((p: { nomPiece: string; typePiece: string }) => ({
        user_id: user.id,
        dossier_id: dossier.id,
        nom_piece: p.nomPiece,
        type_piece: p.typePiece || "obligatoire",
        statut_ocr: "pending",
      }));

      await supabaseAdmin.from("pieces_justificatives").insert(pieceRecords);
    }

    return new Response(
      JSON.stringify({ success: true, dossier_ref: dossier.dossier_ref }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("migrate-tunnel-dossier error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
