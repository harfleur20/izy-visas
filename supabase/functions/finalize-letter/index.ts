import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SendOption = "A" | "B" | "C";

type DossierRow = {
  id: string;
  user_id: string;
  dossier_ref: string;
  client_last_name?: string | null;
  client_first_name?: string | null;
  lettre_neutre_contenu?: string | null;
  references_a_verifier?: unknown;
  validation_juridique_status?: string | null;
  date_signature_procuration?: string | null;
  avocat_id?: string | null;
  avocat_nom?: string | null;
  avocat_prenom?: string | null;
  avocat_barreau?: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertOption(option: unknown): asserts option is SendOption {
  if (option !== "A" && option !== "B" && option !== "C") {
    throw new HttpError(400, "dossier_id et option (A/B/C) requis");
  }
}

function normalizeStoragePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/[^\w./-]/g, "_");
}

function cleanPdfText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[•]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, "");
}

function wrapLine(line: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, maxWidth: number): string[] {
  if (!line.trim()) return [""];

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

async function textToPdfBytes(title: string, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 52;
  const fontSize = 10.5;
  const lineHeight = 15;
  const maxWidth = pageSize[0] - margin * 2;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  page.drawText(cleanPdfText(title), {
    x: margin,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= lineHeight * 2;

  for (const originalLine of cleanPdfText(text).split("\n")) {
    const wrapped = wrapLine(originalLine, font, fontSize, maxWidth);
    for (const line of wrapped) {
      if (y < margin) {
        page = pdf.addPage(pageSize);
        y = pageSize[1] - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });
      y -= lineHeight;
    }
  }

  return await pdf.save();
}

function hasUnresolvedLegalReview(dossier: DossierRow): boolean {
  // Only block if there are actual unresolved references (not informational messages)
  if (Array.isArray(dossier.references_a_verifier) && dossier.references_a_verifier.length > 0) {
    const informationalPrefixes = [
      "Aucune référence",
      "Toutes les références",
      "Aucune référence non vérifiée",
    ];
    const hasRealIssues = dossier.references_a_verifier.some((ref: unknown) => {
      if (typeof ref !== "string") return true;
      return !informationalPrefixes.some((prefix) => ref.startsWith(prefix));
    });
    if (hasRealIssues) return true;
  }
  // Status alone is not blocking — it's informational for the avocat workflow
  if (dossier.validation_juridique_status === "bloquee") return true;
  return false;
}

async function assignAvocatIfNeeded(
  supabaseUrl: string,
  authHeader: string,
  dossier: DossierRow,
) {
  if (dossier.avocat_id) {
    return {
      avocatId: dossier.avocat_id,
      avocatNom: dossier.avocat_nom,
      avocatPrenom: dossier.avocat_prenom,
      avocatBarreau: dossier.avocat_barreau,
    };
  }

  const assignResp = await fetch(`${supabaseUrl}/functions/v1/assign-avocat-partenaire`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ dossier_id: dossier.id }),
  });
  const assignData = await assignResp.json();

  if (!assignResp.ok || assignData.error) {
    throw new HttpError(503, "L'option avocat est temporairement indisponible. Choisissez l'Option A ou B.");
  }

  return {
    avocatId: assignData.avocat_id as string,
    avocatNom: assignData.nom as string,
    avocatPrenom: assignData.prenom as string,
    avocatBarreau: assignData.barreau as string,
  };
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
      { global: authHeader ? { headers: { Authorization: authHeader } } : undefined },
    );
    const authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

    const { dossier_id, option } = await req.json();
    if (!dossier_id) throw new HttpError(400, "dossier_id requis");
    assertOption(option);

    const { data: dossier, error: dossierErr } = await supabase
      .from("dossiers")
      .select("*")
      .eq("id", dossier_id)
      .single();

    if (dossierErr || !dossier) {
      throw new HttpError(404, "Dossier introuvable");
    }

    assertDossierAccess(authContext, dossier);

    const typedDossier = dossier as DossierRow;
    if (!typedDossier.lettre_neutre_contenu) {
      throw new HttpError(400, "Lettre neutre non générée. Générez d'abord la lettre.");
    }

    if (typedDossier.validation_juridique_status === "bloquee") {
      throw new HttpError(409, "La lettre contient des éléments bloquants. Regénérez la lettre avant de continuer.");
    }

    if (option !== "C" && hasUnresolvedLegalReview(typedDossier)) {
      throw new HttpError(409, "Validation avocat requise: choisissez l'Option C ou corrigez les références à vérifier.");
    }

    const clientName = typedDossier.client_last_name?.toUpperCase() || "";
    const clientPrenom = typedDossier.client_first_name || "";
    let letter = typedDossier.lettre_neutre_contenu;
    let typeSignataire = "client";
    let optionEnvoi = "";
    let newStatus = "lettre_finalisee";
    let avocatNom: string | null | undefined = typedDossier.avocat_nom;
    let avocatPrenom: string | null | undefined = typedDossier.avocat_prenom;
    let avocatBarreau: string | null | undefined = typedDossier.avocat_barreau;

    const { count: piecesCount } = await supabase
      .from("pieces_justificatives")
      .select("*", { count: "exact", head: true })
      .eq("dossier_id", dossier_id);
    const certPieceNum = (piecesCount || 0) + 1;

    if (option === "A" || option === "B") {
      letter = letter.replace(
        "{{QUALITE_SIGNATAIRE}}",
        "J'ai l'honneur de former le présent recours en ma qualité de demandeur au visa.",
      );
      letter = letter.replace(
        "{{SIGNATURE}}",
        `${clientName} ${clientPrenom}\nSignature du demandeur\nCertificat de signature joint en pièce n°${certPieceNum}`,
      );
      optionEnvoi = option === "A" ? "A_telechargement" : "B_mysendingbox";
    }

    if (option === "C") {
      const avocat = await assignAvocatIfNeeded(SUPABASE_URL, authContext.authHeader, typedDossier);
      avocatNom = avocat.avocatNom;
      avocatPrenom = avocat.avocatPrenom;
      avocatBarreau = avocat.avocatBarreau;
      typeSignataire = "avocat_partenaire";
      optionEnvoi = "C_avocat_partenaire";
      newStatus = "en_relecture_avocat";

      const procurationDate = typedDossier.date_signature_procuration
        ? new Date(typedDossier.date_signature_procuration).toLocaleDateString("fr-FR")
        : "[DATE PROCURATION]";

      letter = letter.replace(
        "{{QUALITE_SIGNATAIRE}}",
        `J'ai l'honneur de former le présent recours au nom et pour le compte de ${clientName} ${clientPrenom}, en vertu de la procuration en date du ${procurationDate} jointe en pièce n°1.\n\n${(avocatNom || "").toUpperCase()} ${avocatPrenom || ""}\nAvocat au Barreau de ${avocatBarreau || "[BARREAU]"}`,
      );
      letter = letter.replace(
        "{{SIGNATURE}}",
        `${(avocatNom || "").toUpperCase()} ${avocatPrenom || ""}\nAvocat au Barreau de ${avocatBarreau || "[BARREAU]"}\nAgissant au nom et pour le compte de ${clientName} ${clientPrenom}\nSignature avocat avant envoi LRAR`,
      );
    }

    if (letter.includes("{{QUALITE_SIGNATAIRE}}") || letter.includes("{{SIGNATURE}}")) {
      throw new HttpError(500, "La lettre n'a pas pu être finalisée: marqueurs non remplacés.");
    }

    const footer = option === "C" && avocatNom
      ? `\n\n---\nDocument généré par IZY Visa\nLettre à relire et signer par ${avocatNom}, Avocat au Barreau de ${avocatBarreau}\nwww.izy-visa.fr`
      : "\n\n---\nDocument généré par IZY Visa\nwww.izy-visa.fr";
    letter += footer;

    const storagePath = normalizeStoragePath(`${dossier_id}/lettre_definitive_${typedDossier.dossier_ref}.pdf`);
    const pdfBytes = await textToPdfBytes(`Recours visa - ${typedDossier.dossier_ref}`, letter);
    const { error: uploadError } = await supabase.storage
      .from("dossiers")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload lettre définitive impossible: ${uploadError.message}`);
    }

    // Invalidate payments for previous options (if user switched)
    await supabase
      .from("payments")
      .update({ status: "superseded" })
      .eq("dossier_ref", typedDossier.dossier_ref)
      .eq("status", "paid")
      .neq("option_choisie", option);

    await supabase
      .from("dossiers")
      .update({
        option_choisie: option,
        option_envoi: optionEnvoi,
        type_signataire: typeSignataire,
        url_lettre_definitive: storagePath,
        date_finalisation_lettre: new Date().toISOString(),
        validation_juridique_mode: "hybride",
        validation_juridique_status: option === "C" ? "a_verifier_avocat" : "validee_automatique",
        date_validation_juridique: option === "C" ? null : new Date().toISOString(),
        lrar_status: newStatus,
      })
      .eq("id", dossier_id);

    return jsonResponse({
      letter_definitive: letter,
      option,
      option_envoi: optionEnvoi,
      type_signataire: typeSignataire,
      status: newStatus,
      url_lettre_definitive: storagePath,
      validation_juridique_mode: "hybride",
      validation_juridique_status: option === "C" ? "a_verifier_avocat" : "validee_automatique",
    });
  } catch (error) {
    console.error("Finalize letter error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
