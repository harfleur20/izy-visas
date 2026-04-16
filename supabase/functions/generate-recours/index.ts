import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RecoursAccessContext = {
  user: { id: string };
  roles: string[];
  isPrivileged: boolean;
};

function assertRecoursGenerationAccess(
  context: RecoursAccessContext,
  dossier: { user_id?: string | null; avocat_id?: string | null },
) {
  if (context.isPrivileged || dossier.user_id === context.user.id) return;

  const isAssignedAvocat = context.roles.includes("avocat") && dossier.avocat_id === context.user.id;
  if (isAssignedAvocat) return;

  throw new HttpError(403, "Acces refuse a ce dossier");
}

const MOTIF_ARTICLES: Record<string, string[]> = {
  A: ["L211-1"], B: ["L211-2", "R211-13"], C: ["L211-1"], D: ["L211-1"],
  E: ["L211-1"], F: ["L211-2"], G: ["R211-13"], H: ["L211-2"],
  I: ["L211-2"], J: ["L211-2-1"], K: ["L211-1"], L: ["R211-13"],
};

const MOTIF_GUIDANCE: Record<string, string> = {
  A: `Motif A (document non valide) :\n- Erreur manifeste d'appréciation sur la validité du document\n- Art. L211-1 CESEDA (si vérifié dans le contexte)`,
  B: `Motif B (but du séjour non justifié) :\n- Erreur manifeste d'appréciation\n- Défaut de motivation suffisante\n- Art. L211-2 et R211-13 CESEDA`,
  C: `Motif C (ressources insuffisantes) :\n- Erreur manifeste d'appréciation sur l'évaluation des ressources\n- Art. L211-1 CESEDA`,
  D: `Motif D (assurance absente) :\n- Les pièces jointes démontrent la souscription d'une assurance conforme\n- Art. L211-1 CESEDA`,
  E: `Motif E (hébergement non justifié) :\n- Les pièces jointes établissent les conditions d'hébergement\n- Art. L211-1 CESEDA`,
  F: `Motif F (doute sur la volonté de retour) :\n- Erreur manifeste d'appréciation\n- Art. L211-2 CESEDA\n- Jurisprudence TA Nantes si disponible dans le contexte`,
  G: `Motif G (signalement SIS) :\n- Demande de vérification du bien-fondé du signalement\n- Art. R211-13 CESEDA`,
  H: `Motif H (menace ordre public) :\n- Erreur manifeste d'appréciation\n- Absence de fondement factuel établi\n- Art. L211-2 CESEDA`,
  I: `Motif I (séjour irrégulier antérieur) :\n- Contestation des faits si applicable\n- Proportionnalité de la mesure\n- Art. 8 CEDH si vie familiale concernée`,
  J: `Motif J (intention matrimoniale — conjoint de Français) :\n- Régime ultra-protecteur\n- Seuls 3 motifs légaux de refus possibles\n- Art. L211-2-1 CESEDA`,
  K: `Motif K (dossier incomplet) :\n- Les pièces jointes complètent le dossier\n- Absence d'invitation à régulariser avant refus`,
  L: `Motif L (appréciation globale défavorable) :\n- Défaut de motivation suffisante\n- Art. R211-13 CESEDA`,
};

const BLOC_NAMES = [
  "EN-TÊTE EXPÉDITEUR", "EN-TÊTE DESTINATAIRE", "LIEU ET DATE",
  "OBJET ET RÉFÉRENCES", "FORMULE D'APPEL", "QUALITÉ DU SIGNATAIRE",
  "EXPOSÉ DES FAITS", "DISCUSSION — MOYENS DE DROIT",
  "INVENTAIRE DES PIÈCES JOINTES", "CONCLUSIONS",
  "FORMULE DE POLITESSE", "SIGNATURE",
];

function dateEnToutesLettres(date: Date): string {
  const jours = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
  const mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const unites = ["","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf","vingt","vingt et un","vingt-deux","vingt-trois","vingt-quatre","vingt-cinq","vingt-six","vingt-sept","vingt-huit","vingt-neuf","trente","trente et un"];
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  const dayName = jours[date.getDay()];
  const monthName = mois[m];
  const dayStr = d === 1 ? "premier" : unites[d];
  const thousands = Math.floor(y / 1000);
  let yearStr = thousands === 2 ? "deux mille" : "mille";
  const remainder = y % 100;
  if (remainder > 0 && remainder <= 31) yearStr += " " + unites[remainder];
  else if (remainder > 31) yearStr += " " + String(remainder);
  return `${dayName} ${dayStr} ${monthName} ${yearStr.trim()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante — Configurez-la dans les secrets Edge Functions");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const isTunnelMode = body.tunnel_mode === true;

    // ═══ TUNNEL MODE: accept inline data without auth or dossier ═══
    let clientName = "";
    let clientPrenom = "";
    let clientPhone = "";
    let visaType = "";
    let visaTypeExact = "";
    let motifCodes: string[] = [];
    let motifTexteOriginal: string[] = [];
    let motifRefus = "";
    let decisionDate = "";
    let decisionRef = "";
    let consulat = "";
    let passportNumber = "";
    let dossierRef = "TUNNEL-DRAFT";
    let destinataireRecours = "crrv_nantes";
    let clientVille = "";
    let email = "";
    let piecesJointes: { name: string; pages: number }[] = [];
    let dossier_id: string | null = null;
    let authContext: RecoursAccessContext | null = null;
    // deno-lint-ignore no-explicit-any
    let dossier: any = null;

    if (isTunnelMode) {
      // Extract from inline payload
      const { identity, ocr, pieces: tunnelPieces } = body;
      if (!identity || !ocr) {
        return new Response(JSON.stringify({ error: "identity et ocr requis en tunnel_mode" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clientName = identity.lastName || "";
      clientPrenom = identity.firstName || "";
      visaType = ocr.visaType || "";
      visaTypeExact = ocr.typeVisaTexteOriginal || visaType;
      motifCodes = ocr.motifsRefus || [];
      motifTexteOriginal = ocr.motifsTexteOriginal || [];
      motifRefus = motifTexteOriginal.join("\n") || motifCodes.join(", ");
      decisionDate = ocr.dateNotificationRefus || "";
      decisionRef = ocr.numeroDecision || "";
      consulat = [ocr.consulatNom, ocr.consulatVille, ocr.consulatPays].filter(Boolean).join(", ");
      passportNumber = identity.passportNumber || "";
      destinataireRecours = ocr.destinataireRecours || "crrv_nantes";
      piecesJointes = (tunnelPieces || []).map((p: { nomPiece: string; pages?: number }) => ({
        name: p.nomPiece,
        pages: p.pages || 1,
      }));
    } else {
      // ═══ AUTHENTICATED MODE ═══
      const authHeader = req.headers.get("Authorization");
      const supabaseUser = createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        { global: authHeader ? { headers: { Authorization: authHeader } } : undefined },
      );
      authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

      dossier_id = body.dossier_id;

      if (!dossier_id) {
        return new Response(JSON.stringify({ error: "dossier_id requis" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ═══ STEP 1: Fetch dossier ═══
      const { data: dossierData, error: dossierErr } = await supabase
        .from("dossiers").select("*").eq("id", dossier_id).single();

      if (dossierErr || !dossierData) {
        return new Response(JSON.stringify({ error: "Dossier introuvable" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      dossier = dossierData;
      assertRecoursGenerationAccess(authContext, dossier);

      const { data: profile } = await supabase
        .from("profiles").select("*").eq("id", dossier.user_id).single();

      const { data: pieces } = await supabase
        .from("pieces_justificatives")
        .select("nom_piece, type_piece, statut_ocr, nombre_pages")
        .eq("dossier_id", dossier_id)
        .order("created_at", { ascending: true });

      piecesJointes = (pieces || []).map((p: { nom_piece: string; nombre_pages: number | null }) => ({
        name: p.nom_piece,
        pages: p.nombre_pages || 1,
      }));

      clientName = dossier.client_last_name || "";
      clientPrenom = dossier.client_first_name || "";
      clientPhone = dossier.client_phone || profile?.phone || "";
      visaType = dossier.visa_type || "";
      visaTypeExact = dossier.type_visa_texte_original || visaType;
      motifCodes = (dossier.motifs_refus || []) as string[];
      motifTexteOriginal = (dossier.motifs_texte_original || []) as string[];
      motifRefus = motifTexteOriginal.join("\n") || motifCodes.join(", ");
      decisionDate = dossier.date_notification_refus || "";
      decisionRef = dossier.numero_decision || "";
      consulat = [dossier.consulat_nom, dossier.consulat_ville, dossier.consulat_pays].filter(Boolean).join(", ");
      passportNumber = dossier.client_passport_number || profile?.passport_number || "";
      dossierRef = dossier.dossier_ref;
      destinataireRecours = dossier.destinataire_recours || "crrv_nantes";
      clientVille = dossier.client_ville || profile?.ville || "";
      email = dossier.client_email || "";
    }

    const requiredFields: Record<string, unknown> = {
      "NOM DU CLIENT": clientName, "TYPE DE VISA": visaType,
      "MOTIF DE REFUS": motifRefus, "DATE DE NOTIFICATION": decisionDate,
      "CONSULAT": consulat, "NUMÉRO PASSEPORT": passportNumber,
      "PIÈCES JOINTES": piecesJointes.length,
    };

    const missingFields = Object.entries(requiredFields).filter(([_, v]) => !v).map(([k]) => k);
    if (missingFields.length > 0) {
      return new Response(JSON.stringify({
        error: "Génération impossible — Éléments manquants",
        missing_fields: missingFields,
        message: missingFields.map((f) => `Élément manquant : ${f}`).join("\n"),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ STEP 2: Fetch references juridiques ═══
    let refsContext = "";
    try {
      const { data: refRows } = await supabase
        .from("references_juridiques").select("*").eq("actif", true)
        .order("favorable_demandeur", { ascending: false });

      if (refRows && refRows.length > 0) {
        const matchingRefs = refRows.filter((r: { motifs_concernes?: string[] | null }) => {
          const motifs = r.motifs_concernes || [];
          return motifCodes.some((c: string) => motifs.includes(c.toUpperCase()));
        });
        if (matchingRefs.length > 0) {
          refsContext = "\n\n═══ RÉFÉRENCES JURIDIQUES VÉRIFIÉES (BASE IZY VISA) ═══\n" +
            matchingRefs.map((r: {
              reference_complete: string;
              favorable_demandeur: boolean;
              categorie: string;
              motifs_concernes?: string[] | null;
              texte_exact?: string | null;
            }) => {
              const fav = r.favorable_demandeur ? "✓ FAVORABLE" : "✗ DÉFAVORABLE";
              return `--- ${r.reference_complete} [${fav}] ---\nCatégorie: ${r.categorie}\nMotifs: ${(r.motifs_concernes || []).join(", ")}\n${r.texte_exact ? `Texte: ${r.texte_exact.substring(0, 1500)}` : ""}`;
            }).join("\n\n");
        }
      }
    } catch (e) { console.error("Error fetching refs:", e); }

    // ═══ STEP 3: Fetch CESEDA articles via OpenLégi ═══
    const articlesToFetch = new Set<string>();
    for (const code of motifCodes) {
      const arts = MOTIF_ARTICLES[code.toUpperCase()];
      if (arts) arts.forEach((a) => articlesToFetch.add(a));
    }
    ["L211-1", "L211-2", "R211-13"].forEach((a) => articlesToFetch.add(a));
    const includeArt8CEDH = motifCodes.some((c) => ["I", "J"].includes(c.toUpperCase()));

    let legalContext: {
      articles: Record<string, { found?: boolean; content?: string; url?: string }>;
      jurisprudence?: string;
    } = { articles: {}, jurisprudence: "" };
    let openlegiFetchSuccess = true;
    let openlegiFetchTimestamp = new Date().toISOString();
    try {
      const openlegiResp = await fetch(`${SUPABASE_URL}/functions/v1/openlegi-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: "fetch_context", articles: [...articlesToFetch], visa_type: visaType, motif_refus: motifRefus }),
      });
      if (!openlegiResp.ok) {
        openlegiFetchSuccess = false;
        console.error("OpenLégi fetch failed:", openlegiResp.status);
      } else {
        legalContext = await openlegiResp.json();
        openlegiFetchTimestamp = new Date().toISOString();
      }
    } catch (e) {
      openlegiFetchSuccess = false;
      console.error("OpenLégi fetch error:", e);
    }

    // Build set of articles successfully fetched from OpenLégi (our ground truth)
    const verifiedArticleIds = new Set<string>();
    const articlesContext = Object.entries(legalContext.articles || {})
      .filter(([_, v]) => v.found)
      .map(([id, v]) => {
        verifiedArticleIds.add(id.toUpperCase().replace(/\s/g, ""));
        return `=== Article ${id} (CESEDA) ===\n${v.content}\nSource: ${v.url}`;
      })
      .join("\n\n");

    const jurisprudenceContext = (legalContext.jurisprudence || "") + refsContext;

    // ═══ STEP 4: Build pieces list ═══
    const piecesFormatted = piecesJointes
      .map((p, i: number) => `Pièce n°${i + 1} : ${p.name} (${p.pages} page${p.pages > 1 ? "s" : ""})`)
      .join("\n");

    const isCRRV = destinataireRecours === "crrv_nantes";
    const destinataireBlock = isCRRV
      ? `À l'attention de Monsieur le Président de la Commission de recours contre les décisions de refus de visa d'entrée en France\nBP 83609\n44036 Nantes Cedex 01`
      : `À l'attention de Monsieur le Sous-directeur des visas\nMinistère de l'Europe et des Affaires Étrangères\nBP 83609\n44036 Nantes Cedex 01`;

    const formuleAppel = isCRRV ? "Monsieur le Président," : "Monsieur le Sous-directeur,";
    const formulePolitesse = isCRRV ? "Monsieur le Président" : "Monsieur le Sous-directeur";

    const expediteurBlock = `${clientName.toUpperCase()} ${clientPrenom}\nc/o CAPDEMARCHES\n105 rue des Moines\n75017 Paris — FRANCE\nTél. : ${clientPhone || "[TÉLÉPHONE]"}\nEmail : ${email || "[EMAIL]"}`;

    const today = new Date();
    const dateEnLettres = dateEnToutesLettres(today);

    const motifGuidance = motifCodes.map((code: string) => {
      return MOTIF_GUIDANCE[code.toUpperCase()] || `Motif ${code.toUpperCase()} : développer les arguments pertinents`;
    }).join("\n\n");

    // ═══ STEP 5: SYSTEM PROMPT — LETTRE NEUTRE ═══
    const systemPrompt = `Tu es un expert en droit des étrangers français, spécialisé dans la rédaction de lettres de recours contre les refus de visa pour la France.
Tu rédiges des lettres destinées à la Commission de recours contre les décisions de refus de visa (CRRV) ou au Sous-directeur des visas.

RÈGLES ABSOLUES :
1. Tu disposes dans le CONTEXTE JURIDIQUE des textes exacts récupérés sur Légifrance aujourd'hui. Utilise UNIQUEMENT ces textes.
2. Cite les articles exactement tels qu'ils figurent dans le contexte. Ne cite aucun article absent du contexte fourni.
3. Si tu as besoin d'un argument sans référence disponible dans le contexte, écris [ARGUMENT SANS RÉFÉRENCE] — jamais une référence inventée.
4. Tu reproduis les motifs de refus EXACTEMENT tels que fournis — entre guillemets, sans paraphrase.
5. Tu utilises UNIQUEMENT les données factuelles du dossier fourni. Tu n'inventes aucun fait.
6. La lettre est rédigée en français juridique soutenu, clair et précis.
7. Chaque fait affirmé correspond à une pièce numérotée dans la liste fournie.
8. Le BLOC 6 doit contenir le marqueur {{QUALITE_SIGNATAIRE}}. Le BLOC 12 doit contenir le marqueur {{SIGNATURE}}. Ces marqueurs seront remplacés ultérieurement selon le choix du client.
9. Tu ne t'attribues aucune identité et n'indiques aucun signataire.

═══════════════════════════════════════
STRUCTURE OBLIGATOIRE DE LA LETTRE (12 BLOCS)
═══════════════════════════════════════

BLOC 1 — EN-TÊTE EXPÉDITEUR (en haut à gauche) :
${expediteurBlock}

BLOC 2 — EN-TÊTE DESTINATAIRE (en haut à droite) :
${destinataireBlock}

BLOC 3 — LIEU ET DATE :
${clientVille || "[VILLE]"}, le ${dateEnLettres}

BLOC 4 — OBJET ET RÉFÉRENCES :
Objet : Recours contre la décision de refus de visa ${visaTypeExact} notifiée le ${decisionDate} par ${consulat}
Références : Dossier ${dossierRef}${passportNumber ? ` — Passeport n° ${passportNumber}` : ""}${decisionRef ? ` — Décision n° ${decisionRef}` : ""}

BLOC 5 — FORMULE D'APPEL :
${formuleAppel}

BLOC 6 — QUALITÉ DU SIGNATAIRE :
{{QUALITE_SIGNATAIRE}}

BLOC 7 — EXPOSÉ DES FAITS :
Commence par : "Le [DATE DE DÉPÔT], ${clientName.toUpperCase()} ${clientPrenom} a déposé auprès du ${consulat} une demande de visa ${visaTypeExact} en vue de [MOTIF DU SÉJOUR]."
Puis : "Par décision notifiée le ${decisionDate}, le ${consulat} a refusé de faire droit à cette demande au motif que :"
Puis reproduis EXACTEMENT entre guillemets les motifs tels que figurant sur la décision :
"${motifRefus}"

BLOC 8 — DISCUSSION — MOYENS DE DROIT :
${motifGuidance}
${includeArt8CEDH ? "\nAjouter SYSTÉMATIQUEMENT un moyen basé sur l'article 8 CEDH (droit au respect de la vie privée et familiale) si le client a des liens familiaux en France." : ""}

Structure pour CHAQUE moyen :
SUR [INTITULÉ DU MOYEN] :
[Argument juridique avec références vérifiées depuis le CONTEXTE JURIDIQUE]
En l'espèce, [application au cas concret avec renvoi aux pièces jointes numérotées]
Il résulte de ce qui précède que [conclusion du moyen].

BLOC 9 — INVENTAIRE DES PIÈCES JOINTES :
"À l'appui du présent recours, je joins les pièces suivantes :"
${piecesFormatted}

BLOC 10 — CONCLUSIONS :
"Par ces motifs,
Je vous demande de bien vouloir :
1° Annuler la décision de refus de visa notifiée le ${decisionDate} par ${consulat} ;
2° Enjoindre au ${consulat} de délivrer à ${clientName.toUpperCase()} ${clientPrenom} le visa ${visaTypeExact} sollicité ;
3° Prendre toute mesure utile à l'exécution de la présente décision."

BLOC 11 — FORMULE DE POLITESSE :
"Dans l'attente de votre décision, je vous prie d'agréer, ${formulePolitesse}, l'expression de ma haute considération."

BLOC 12 — SIGNATURE :
{{SIGNATURE}}

CONTEXTE JURIDIQUE VALIDÉ PAR LÉGIFRANCE / OPENLEGI :
${articlesContext || "Aucun article CESEDA trouvé — NE CITE AUCUN ARTICLE, écris [RÉFÉRENCE À VÉRIFIER]"}

JURISPRUDENCE ET RÉFÉRENCES VALIDÉES :
${jurisprudenceContext || "Aucune jurisprudence trouvée"}

═══════════════════════════════════════
FORMAT DE SORTIE
═══════════════════════════════════════
À la fin de la lettre, ajoute un bloc technique :
[BLOC_STATUS]
BLOC_1:OK|MISSING|INCOMPLETE
BLOC_2:OK|MISSING|INCOMPLETE
...
BLOC_12:OK|MISSING|INCOMPLETE
[/BLOC_STATUS]

[REFERENCES]
- Référence X : VERIFIED|UNVERIFIED
[/REFERENCES]

[UNVERIFIED_REFS]
Liste des références marquées [RÉFÉRENCE À VÉRIFIER]
[/UNVERIFIED_REFS]`;

    const userPrompt = `Rédige une lettre de recours complète à partir des données suivantes.

════════════════════
DONNÉES DU DOSSIER
════════════════════
DEMANDEUR :
Nom : ${clientName.toUpperCase()}
Prénom : ${clientPrenom}
Date de naissance : ${dossier.client_date_naissance || profile?.date_naissance || "Non précisée"}
Lieu de naissance : ${dossier.client_lieu_naissance || profile?.lieu_naissance || "Non précisé"}
Nationalité : ${dossier.client_nationalite || profile?.nationalite || "Non précisée"}
N° de passeport : ${passportNumber}
Téléphone : ${clientPhone || "Non fourni"}
Email : ${email || "Non fourni"}

VISA ET REFUS :
Type de visa : ${visaTypeExact}
Consulat : ${consulat}
Date de notification : ${decisionDate}
Numéro de décision : ${decisionRef || "Non mentionné"}
Référence IZY : ${dossierRef}

MOTIFS DE REFUS (texte exact de la décision) :
${motifTexteOriginal.map((m: string, i: number) => `- Motif ${String.fromCharCode(65 + i)} : '${m}'`).join("\n") || `- ${motifRefus}`}

PIÈCES DISPONIBLES :
${piecesFormatted}

RAPPELS :
- Le BLOC 6 DOIT contenir {{QUALITE_SIGNATAIRE}} tel quel.
- Le BLOC 12 DOIT contenir {{SIGNATURE}} tel quel.
- Cite UNIQUEMENT les articles présents dans le CONTEXTE JURIDIQUE ci-dessus.
- Si tu as besoin d'un argument sans référence dans le contexte, écris [ARGUMENT SANS RÉFÉRENCE].
- Reproduis les motifs de refus EXACTEMENT entre guillemets.
- Génère les 12 blocs COMPLETS.`;

    // ═══ STEP 6: Call Anthropic Claude API ═══
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const errData = await aiResp.json().catch(() => ({}));
      console.error("Anthropic API error:", aiResp.status, errData);
      const message = typeof errData === "object" && errData && "error" in errData
        ? (errData as { error?: { message?: string } }).error?.message
        : undefined;
      throw new Error(`Anthropic API error: ${message || aiResp.status}`);
    }

    const aiData = await aiResp.json() as {
      content?: Array<{ type?: string; text?: string }>;
      model?: string;
    };
    const letterContent = (aiData.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("");

    const modele_ia = aiData.model || "claude-opus-4-5";
    const provider_ia = "anthropic";
    console.log(`Lettre générée par ${provider_ia} — modèle: ${modele_ia}`);

    // ═══ STEP 7: Parse bloc statuses ═══
    const blocStatusMatch = letterContent.match(/\[BLOC_STATUS\]([\s\S]*?)\[\/BLOC_STATUS\]/);
    const blocStatuses: Record<string, string> = {};
    if (blocStatusMatch) {
      for (const line of blocStatusMatch[1].split("\n")) {
        const m = line.match(/BLOC_(\d+):(\w+)/);
        if (m) blocStatuses[`BLOC_${m[1]}`] = m[2];
      }
    }

    const blocReport = BLOC_NAMES.map((name, i) => ({
      bloc: i + 1, name, status: blocStatuses[`BLOC_${i + 1}`] || "INCOMPLETE",
    }));

    // ═══ STEP 8: Extract all references cited in the letter ═══
    const refsMatch = letterContent.match(/\[REFERENCES\]([\s\S]*?)\[\/REFERENCES\]/);
    const extractedRefs: Array<{ reference: string; status: string }> = [];
    if (refsMatch) {
      for (const line of refsMatch[1].split("\n")) {
        const cleaned = line.replace(/^[-•*]\s*/, "").trim();
        if (cleaned) {
          const parts = cleaned.split(":");
          extractedRefs.push({ reference: parts[0].trim(), status: parts[1]?.trim() || "UNVERIFIED" });
        }
      }
    }

    // Also extract inline article references from the letter body
    const inlineRefs = letterContent.match(/(?:article|art\.)\s+[LRD][\.\s]?\d+[-\d]*/gi) || [];
    const allRefStrings: string[] = extractedRefs.map((r) => r.reference);
    for (const ref of inlineRefs) {
      const normalized = ref.trim();
      if (!allRefStrings.some((r) => r.toLowerCase().includes(normalized.toLowerCase()))) {
        allRefStrings.push(normalized);
      }
    }

    // ═══ STEP 9: Build references_status by comparing against OpenLégi context (NO second API call) ═══
    // This is the SINGLE SOURCE OF TRUTH — compare what Claude cited vs what we fetched
    const referencesStatusMap = new Map<string, {
      texte_reference: string;
      statut: "verifie_openlegi" | "non_trouve_openlegi" | "a_verifier_avocat";
      url: string;
      details: string;
    }>();

    // Helper: normalize article ID for comparison (e.g. "art. L211-2" → "L211-2")
    function normalizeArticleId(ref: string): string {
      const match = ref.match(/[LRD]\.\s*\d+[-\d]*/i) || ref.match(/[LRD]\d+[-\d]*/i);
      return match ? match[0].replace(/\s/g, "").replace(".", "") : ref.toUpperCase().replace(/\s/g, "");
    }

    // For each reference Claude cited, check if it was in our OpenLégi context
    for (const refStr of allRefStrings) {
      const normalizedId = normalizeArticleId(refStr);

      // Check if this article was in the fetched OpenLégi context
      const matchedInContext = verifiedArticleIds.has(normalizedId) ||
        verifiedArticleIds.has(normalizedId.replace(".", "")) ||
        [...verifiedArticleIds].some(id => id.replace(/[.\s]/g, "") === normalizedId.replace(/[.\s]/g, ""));

      if (matchedInContext) {
        // Find the URL from legalContext
        const contextEntry = Object.entries(legalContext.articles || {}).find(
          ([id]) => id.replace(/[.\s]/g, "").toUpperCase() === normalizedId.replace(/[.\s]/g, "").toUpperCase()
        );
        referencesStatusMap.set(normalizedId, {
          texte_reference: refStr,
          statut: "verifie_openlegi",
          url: contextEntry?.[1]?.url || "",
          details: `Vérifié Légifrance le ${new Date(openlegiFetchTimestamp).toLocaleDateString("fr-FR")}`,
        });
      } else {
        // Reference cited by Claude but NOT in our provided context
        referencesStatusMap.set(normalizedId, {
          texte_reference: refStr,
          statut: "a_verifier_avocat",
          url: `https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=${encodeURIComponent(refStr)}`,
          details: "Citation hors contexte OpenLégi — à confirmer par l'avocat",
        });
      }
    }

    // Also add articles that were fetched but NOT cited (for transparency)
    for (const [articleId, info] of Object.entries(legalContext.articles || {})) {
      const normalizedId = normalizeArticleId(articleId);
      if (!referencesStatusMap.has(normalizedId) && !info.found) {
        // Article was requested from OpenLégi but not found — only relevant if Claude cited it
        // Already handled above, skip non-cited unfound articles
      }
    }

    const references_status = Array.from(referencesStatusMap.values());

    // ═══ STEP 10: Determine compliance with REVISED blocking logic ═══
    const hasRedBlocs = blocReport.some((b) => b.status === "MISSING");
    const hasIncompleteBlocs = blocReport.some((b) => b.status === "INCOMPLETE");
    const hasAVerifierRefs = references_status.some((r) => r.statut === "a_verifier_avocat");

    // Check for explicitly NOT FOUND articles (searched on OpenLégi but confirmed non-existent)
    const notFoundInOpenlegi = Object.entries(legalContext.articles || {})
      .filter(([_, v]) => !v.found)
      .map(([id]) => id);

    // Cross-reference: only block if Claude cited an article that OpenLégi confirmed does NOT exist
    const citedButNotFound = allRefStrings.filter(ref => {
      const normalizedId = normalizeArticleId(ref);
      return notFoundInOpenlegi.some(nf =>
        nf.replace(/[.\s]/g, "").toUpperCase() === normalizedId.replace(/[.\s]/g, "").toUpperCase()
      );
    });

    const hasNonTrouveRefs = citedButNotFound.length > 0;

    // Mark cited-but-not-found as "non_trouve_openlegi" (blocking)
    for (const ref of citedButNotFound) {
      const normalizedId = normalizeArticleId(ref);
      referencesStatusMap.set(normalizedId, {
        texte_reference: ref,
        statut: "non_trouve_openlegi",
        url: "",
        details: `Article introuvable sur Légifrance — correction obligatoire`,
      });
    }

    // Re-export after potential updates
    const references_status_final = Array.from(referencesStatusMap.values());

    // Verify markers are present
    const hasQualiteMarker = letterContent.includes("{{QUALITE_SIGNATAIRE}}");
    const hasSignatureMarker = letterContent.includes("{{SIGNATURE}}");
    const hasMarkerIssue = !hasQualiteMarker || !hasSignatureMarker;

    // Hybrid validation:
    // - automatic when all cited legal references are verified and the letter is structurally complete;
    // - lawyer review required when references remain uncertain;
    // - hard block when OpenLégi is unavailable, an article is non-existent, a block is missing, or markers are absent.
    const openlegiUnavailable = !openlegiFetchSuccess;
    const canSend = !hasRedBlocs && !hasNonTrouveRefs && !openlegiUnavailable && !hasMarkerIssue;
    const validationStatus = openlegiUnavailable || hasNonTrouveRefs || hasRedBlocs || hasMarkerIssue
      ? "bloquee"
      : hasAVerifierRefs
        ? "a_verifier_avocat"
        : "validee_automatique";
    const isAssignedAvocatReview = !isTunnelMode &&
      authContext?.roles.includes("avocat") &&
      dossier?.avocat_id === authContext?.user.id &&
      dossier?.validation_juridique_status === "a_verifier_avocat";
    const savedValidationStatus = isAssignedAvocatReview && validationStatus === "validee_automatique"
      ? "a_verifier_avocat"
      : validationStatus;

    // Clean letter
    const cleanLetter = letterContent
      .replace(/\[BLOC_STATUS\][\s\S]*?\[\/BLOC_STATUS\]/, "")
      .replace(/\[REFERENCES\][\s\S]*?\[\/REFERENCES\]/, "")
      .replace(/\[UNVERIFIED_REFS\][\s\S]*?\[\/UNVERIFIED_REFS\]/, "")
      .trim();

    // ═══ STEP 11: Save neutral letter to dossier (skip in tunnel mode) ═══
    if (!isTunnelMode && dossier_id) {
      const refsVerifiees = references_status_final.filter(r => r.statut === "verifie_openlegi").map(r => r.texte_reference);
      const refsAVerifier = references_status_final.filter(r => r.statut !== "verifie_openlegi").map(r => r.texte_reference);

      await supabase.from("dossiers").update({
        lettre_neutre_contenu: cleanLetter,
        date_generation_neutre: new Date().toISOString(),
        references_verifiees: refsVerifiees,
        references_a_verifier: refsAVerifier,
        lrar_status: "lettre_neutre_generee",
        validation_juridique_mode: "hybride",
        validation_juridique_status: savedValidationStatus,
        date_validation_juridique: savedValidationStatus === "validee_automatique" ? new Date().toISOString() : null,
      }).eq("id", dossier_id);
    }

    // Build blocking reason message
    let blocking_reason = "";
    if (openlegiUnavailable) {
      blocking_reason = "Vérification Légifrance impossible. Relancez la génération ou contactez le support.";
    } else if (hasNonTrouveRefs) {
      blocking_reason = `Article(s) ${citedButNotFound.join(", ")} introuvable(s) sur Légifrance. L'avocat doit corriger avant envoi.`;
    } else if (hasRedBlocs) {
      blocking_reason = "Des blocs obligatoires sont manquants dans la lettre.";
    } else if (hasMarkerIssue) {
      blocking_reason = "Les marqueurs de finalisation sont absents. Relancez la génération.";
    }

    return new Response(JSON.stringify({
      letter: cleanLetter,
      bloc_report: blocReport,
      references_status: references_status_final,
      can_send: canSend,
      has_red_blocs: hasRedBlocs,
      has_incomplete_blocs: hasIncompleteBlocs,
      has_non_trouve_refs: hasNonTrouveRefs,
      has_a_verifier_refs: hasAVerifierRefs,
      openlegi_available: openlegiFetchSuccess,
      openlegi_fetch_timestamp: openlegiFetchTimestamp,
      blocking_reason,
      has_markers: { qualite: hasQualiteMarker, signature: hasSignatureMarker },
      validation_juridique_mode: "hybride",
      validation_juridique_status: savedValidationStatus,
      dossier_ref: dossierRef,
      is_neutral: true,
      modele_ia,
      provider_ia,
      generation_label: `Lettre générée par Claude (Anthropic) — ${modele_ia}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Generate recours error:", error);
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
