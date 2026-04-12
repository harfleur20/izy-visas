import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function dateEnToutesLettres(date: Date): string {
  const jours = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const unites = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf", "vingt", "vingt et un", "vingt-deux", "vingt-trois", "vingt-quatre", "vingt-cinq", "vingt-six", "vingt-sept", "vingt-huit", "vingt-neuf", "trente", "trente et un"];
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  const dayName = jours[date.getDay()];
  const monthName = mois[m];
  const dayStr = d === 1 ? "premier" : unites[d];
  // Year in letters
  const thousands = Math.floor(y / 1000);
  const hundreds = Math.floor((y % 1000) / 100);
  const tens = Math.floor((y % 100) / 10);
  const ones = y % 10;
  let yearStr = "";
  if (thousands === 2) yearStr = "deux mille";
  else if (thousands === 1) yearStr = "mille";
  const remainder = (y % 100);
  if (remainder > 0 && remainder <= 31) {
    yearStr += " " + unites[remainder];
  } else if (remainder > 31) {
    yearStr += " " + String(remainder);
  }
  return `${dayName} ${dayStr} ${monthName} ${yearStr.trim()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: authHeader ? { headers: { Authorization: authHeader } } : undefined }
    );
    const authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

    const {
      dossier_id,
      client_nom,
      client_prenom,
      date_naissance,
      lieu_naissance,
      nationalite,
      passport_number,
      adresse_origine,
      ville_client,
    } = await req.json();

    // Validate required fields
    const required: Record<string, unknown> = {
      dossier_id, client_nom, client_prenom, date_naissance,
      lieu_naissance, nationalite, passport_number, adresse_origine,
      ville_client,
    };
    const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: "Champs manquants", missing }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, user_id, dossier_ref")
      .eq("id", dossier_id)
      .single();

    if (dossierError || !dossier) {
      return new Response(JSON.stringify({ error: "Dossier introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    assertDossierAccess(authContext, dossier);
    const dossierRef = dossier.dossier_ref;

    const today = new Date();
    const dateStr = dateEnToutesLettres(today);
    const expirationDate = new Date(today);
    expirationDate.setMonth(expirationDate.getMonth() + 12);

    // Generate the procuration text (this will be used to create a PDF via AI or template)
    const procurationText = `PROCURATION POSTALE

Je soussigné(e),

Nom et prénom : ${client_nom.toUpperCase()} ${client_prenom}
Date de naissance : ${date_naissance}
Lieu de naissance : ${lieu_naissance}
Nationalité : ${nationalite}
Numéro de passeport : ${passport_number}
Adresse personnelle : ${adresse_origine}

DONNE PROCURATION à :

La société CAPDEMARCHES
Sise au 105 rue des Moines
75017 Paris — FRANCE

pour réceptionner, retirer et prendre connaissance en mon nom de tout courrier recommandé avec accusé de réception, de tout avis de passage et de toute correspondance officielle qui me seraient adressés à l'adresse suivante :

${client_nom.toUpperCase()} ${client_prenom}
c/o CAPDEMARCHES
105 rue des Moines
75017 Paris
FRANCE

dans le cadre de la procédure de recours contre la décision de refus de visa référencée ${dossierRef} introduite auprès de la Commission de recours contre les décisions de refus de visa d'entrée en France ou du Sous-directeur des visas, selon le cas.

La présente procuration est valable pour une durée de douze (12) mois à compter de la date de signature, renouvelable par accord exprès des parties.

Elle couvre expressément :
- La réception des courriers recommandés avec accusé de réception
- La signature des accusés de réception au nom du mandant
- Le retrait des courriers en instance auprès des bureaux de La Poste
- La transmission des documents reçus au mandant par voie électronique dans un délai de 24 heures

Elle ne couvre pas :
- La représentation du mandant devant toute juridiction
- La signature de tout acte juridique engageant le mandant
- Toute action au-delà de la réception postale

Fait à ${ville_client},
le ${dateStr}

Signature du mandant :
[ZONE DE SIGNATURE YOUSIGN]

Nom lisible : ${client_nom.toUpperCase()} ${client_prenom}`;

    // Update dossier with procuration data
    const { error: updateError } = await supabase
      .from("dossiers")
      .update({
        client_date_naissance: date_naissance,
        client_lieu_naissance: lieu_naissance,
        client_nationalite: nationalite,
        client_passport_number: passport_number,
        client_adresse_origine: adresse_origine,
        client_ville: ville_client,
        use_capdemarches: true,
        procuration_expiration: expirationDate.toISOString().split("T")[0],
      })
      .eq("id", dossier_id);

    if (updateError) {
      console.error("Update dossier error:", updateError);
    }

    return new Response(
      JSON.stringify({
        procuration_text: procurationText,
        date_signature: today.toISOString(),
        expiration_date: expirationDate.toISOString().split("T")[0],
        dossier_ref: dossierRef,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate procuration error:", error);
    if (error instanceof HttpError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
