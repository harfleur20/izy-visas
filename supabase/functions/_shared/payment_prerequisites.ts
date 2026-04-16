import { HttpError } from "./security.ts";

export type SendOption = "A" | "B" | "C";

export const PAYMENT_DOSSIER_SELECT =
  "id, user_id, visa_type, client_first_name, client_last_name, client_passport_number, date_notification_refus, motifs_refus, consulat_nom, lettre_neutre_contenu, option_choisie, option_envoi, url_lettre_definitive, validation_juridique_status";

type SupabaseLike = {
  from: (table: string) => any;
};

export type PaymentDossier = {
  id: string;
  user_id: string | null;
  visa_type: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_passport_number: string | null;
  date_notification_refus: string | null;
  motifs_refus: string[] | null;
  consulat_nom: string | null;
  lettre_neutre_contenu: string | null;
  option_choisie: string | null;
  option_envoi: string | null;
  url_lettre_definitive: string | null;
  validation_juridique_status: string | null;
};

type RequiredPiece = {
  nom_piece: string;
  type_visa: string;
  motifs_concernes: string[] | null;
  obligatoire: boolean;
  conditionnel: boolean | null;
};

type UploadedPiece = {
  nom_piece: string;
  statut_ocr: string;
  motif_rejet: string | null;
  ocr_details: Record<string, unknown> | null;
  ocr_text_extract: string | null;
  type_document_attendu: string | null;
  type_document_detecte: string | null;
};

const ACCEPTED_OCR_STATUSES = new Set(["accepte", "accepted"]);
const REJECTED_OCR_STATUSES = new Set(["rejete", "rejected", "erreur", "failed"]);
const PENDING_OCR_STATUSES = new Set(["pending", "en_cours", "analyzing", "uploading", "correcting"]);

function normalizeOption(value?: string | null): SendOption | null {
  if (!value) return null;
  const normalized = value.charAt(0).toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" ? normalized : null;
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

function requiresOwnerIdentityCheck(piece: UploadedPiece): boolean {
  const expectedType = piece.type_document_attendu || "";
  const normalizedName = normalizeForIdentity(piece.nom_piece);
  return (
    ["decision_refus", "passeport", "formulaire_visa"].includes(expectedType) ||
    /decision.*refus|refus.*visa|passeport|passport|formulaire.*visa/.test(normalizedName)
  );
}

function textMatchesOwnerIdentity(text: string | null, dossier: PaymentDossier): boolean {
  const normalizedText = normalizeForIdentity(text);
  if (!normalizedText) return false;

  const lastTokens = significantTokens(dossier.client_last_name);
  const firstTokens = significantTokens(dossier.client_first_name);
  const passport = normalizeForIdentity(dossier.client_passport_number).replace(/\s/g, "");
  const lastMatches = lastTokens.length === 0 || lastTokens.some((token) => normalizedText.includes(token));
  const firstMatches = firstTokens.length === 0 || firstTokens.some((token) => normalizedText.includes(token));
  const passportMatches = Boolean(passport) && normalizedText.replace(/\s/g, "").includes(passport);

  return (lastMatches && firstMatches) || passportMatches;
}

function getBlockingOcrMessage(piece: UploadedPiece, dossier: PaymentDossier): string | null {
  const details =
    piece.ocr_details && typeof piece.ocr_details === "object" && !Array.isArray(piece.ocr_details)
      ? piece.ocr_details
      : {};
  const warning =
    details.typeMismatchWarning ||
    details.decisionWarning ||
    details.identityWarning;

  if (typeof warning === "string" && warning.trim()) {
    return warning;
  }

  if (
    piece.type_document_attendu &&
    piece.type_document_attendu !== "autre" &&
    piece.type_document_detecte &&
    piece.type_document_detecte !== piece.type_document_attendu
  ) {
    return `Le fichier fourni pour ${piece.nom_piece} ne correspond pas au type de document attendu.`;
  }

  if (requiresOwnerIdentityCheck(piece) && !textMatchesOwnerIdentity(piece.ocr_text_extract, dossier)) {
    return `Le document ${piece.nom_piece} ne semble pas correspondre au titulaire du dossier.`;
  }

  return null;
}

function assertDeadlineOpen(dateNotification: string) {
  const notificationDate = new Date(dateNotification);
  if (Number.isNaN(notificationDate.getTime())) {
    throw new HttpError(409, "Date de notification du refus invalide.");
  }

  const deadline = new Date(notificationDate);
  deadline.setDate(deadline.getDate() + 30);
  deadline.setHours(23, 59, 59, 999);

  if (deadline < new Date()) {
    throw new HttpError(409, "Le delai de recours est expire. Le paiement est bloque.");
  }
}

function getRequiredPieceNames(rows: RequiredPiece[], visaType: string | null): string[] {
  const names = rows
    .filter((piece) => {
      if (!piece.obligatoire || piece.conditionnel) return false;
      if (piece.type_visa === "tous") {
        return (piece.motifs_concernes || []).includes("tous");
      }
      return Boolean(visaType) && piece.type_visa === visaType;
    })
    .map((piece) => piece.nom_piece);

  return [...new Set(names)];
}

async function assertMandatoryPiecesReady(supabase: SupabaseLike, dossier: PaymentDossier) {
  const { data: requiredRows, error: requiredError } = await supabase
    .from("pieces_requises")
    .select("nom_piece, type_visa, motifs_concernes, obligatoire, conditionnel")
    .eq("actif", true)
    .eq("obligatoire", true);

  if (requiredError) {
    throw new HttpError(500, "Impossible de verifier les pieces obligatoires.");
  }

  const requiredNames = getRequiredPieceNames((requiredRows || []) as RequiredPiece[], dossier.visa_type);

  const { data: uploadedRows, error: uploadedError } = await supabase
    .from("pieces_justificatives")
    .select("nom_piece, statut_ocr, motif_rejet, ocr_details, ocr_text_extract, type_document_attendu, type_document_detecte")
    .eq("dossier_id", dossier.id);

  if (uploadedError) {
    throw new HttpError(500, "Impossible de verifier les pieces justificatives.");
  }

  const uploadedPieces = (uploadedRows || []) as UploadedPiece[];
  const rejectedPiece = uploadedPieces.find((piece) => REJECTED_OCR_STATUSES.has(piece.statut_ocr));
  if (rejectedPiece) {
    throw new HttpError(409, `Piece rejetee a corriger avant paiement: ${rejectedPiece.nom_piece}.`);
  }

  const pendingPiece = uploadedPieces.find((piece) => PENDING_OCR_STATUSES.has(piece.statut_ocr));
  if (pendingPiece) {
    throw new HttpError(409, `Analyse OCR en cours avant paiement: ${pendingPiece.nom_piece}.`);
  }

  const blockingPiece = uploadedPieces.find((piece) =>
    ACCEPTED_OCR_STATUSES.has(piece.statut_ocr) && getBlockingOcrMessage(piece, dossier)
  );
  if (blockingPiece) {
    throw new HttpError(409, `${getBlockingOcrMessage(blockingPiece, dossier)} Corrigez cette piece avant paiement.`);
  }

  if (requiredNames.length === 0) return;

  const acceptedNames = new Set(
    uploadedPieces
      .filter((piece) => ACCEPTED_OCR_STATUSES.has(piece.statut_ocr))
      .map((piece) => piece.nom_piece),
  );
  const missing = requiredNames.filter((name) => !acceptedNames.has(name));

  if (missing.length > 0) {
    throw new HttpError(409, `Pieces obligatoires manquantes ou non validees: ${missing.join(", ")}.`);
  }
}

export async function assertPaymentPrerequisites(
  supabase: SupabaseLike,
  dossier: PaymentDossier,
  requestedOption: SendOption,
  options?: { fromTunnel?: boolean },
) {
  const fromTunnel = options?.fromTunnel === true;

  if (!dossier.date_notification_refus) {
    throw new HttpError(409, "Recevabilite requise avant paiement.");
  }
  assertDeadlineOpen(dossier.date_notification_refus);

  const motifs = dossier.motifs_refus || [];
  if (motifs.length === 0 || !dossier.consulat_nom) {
    throw new HttpError(409, "Decision de refus incomplete avant paiement.");
  }

  // Tunnel dossiers only have lettre_neutre_contenu, not url_lettre_definitive yet
  if (!fromTunnel) {
    if (!dossier.lettre_neutre_contenu || !dossier.url_lettre_definitive) {
      throw new HttpError(409, "Lettre de recours non finalisee avant paiement.");
    }
  } else {
    if (!dossier.lettre_neutre_contenu) {
      throw new HttpError(409, "Lettre de recours non generee avant paiement.");
    }
  }

  if (dossier.validation_juridique_status === "bloquee") {
    throw new HttpError(409, "Validation juridique bloquee. Corrigez la lettre avant paiement.");
  }

  // Tunnel dossiers set option_choisie during migration — skip strict match check
  if (!fromTunnel) {
    const finalizedOption = normalizeOption(dossier.option_choisie || dossier.option_envoi);
    if (finalizedOption !== requestedOption) {
      throw new HttpError(409, "Mode d'envoi non finalise pour cette option avant paiement.");
    }
  }

  // Tunnel pieces are in pending OCR state — skip mandatory pieces check
  if (!fromTunnel) {
    await assertMandatoryPiecesReady(supabase, dossier);
  }
}
