import { HttpError } from "./security.ts";

export type SendOption = "A" | "B" | "C";

export const PAYMENT_DOSSIER_SELECT =
  "id, user_id, visa_type, client_first_name, client_last_name, date_notification_refus, motifs_refus, consulat_nom, lettre_neutre_contenu, option_choisie, option_envoi, url_lettre_definitive, validation_juridique_status";

type SupabaseLike = {
  from: (table: string) => any;
};

export type PaymentDossier = {
  id: string;
  user_id: string | null;
  visa_type: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
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
};

const ACCEPTED_OCR_STATUSES = new Set(["accepte", "accepted"]);
const REJECTED_OCR_STATUSES = new Set(["rejete", "rejected", "erreur", "failed"]);
const PENDING_OCR_STATUSES = new Set(["pending", "en_cours", "analyzing", "uploading", "correcting"]);

function normalizeOption(value?: string | null): SendOption | null {
  if (!value) return null;
  const normalized = value.charAt(0).toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" ? normalized : null;
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
    .select("nom_piece, statut_ocr")
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
) {
  if (!dossier.date_notification_refus) {
    throw new HttpError(409, "Recevabilite requise avant paiement.");
  }
  assertDeadlineOpen(dossier.date_notification_refus);

  const motifs = dossier.motifs_refus || [];
  if (motifs.length === 0 || !dossier.consulat_nom) {
    throw new HttpError(409, "Decision de refus incomplete avant paiement.");
  }

  if (!dossier.lettre_neutre_contenu || !dossier.url_lettre_definitive) {
    throw new HttpError(409, "Lettre de recours non finalisee avant paiement.");
  }

  if (dossier.validation_juridique_status === "bloquee") {
    throw new HttpError(409, "Validation juridique bloquee. Corrigez la lettre avant paiement.");
  }

  const finalizedOption = normalizeOption(dossier.option_choisie || dossier.option_envoi);
  if (finalizedOption !== requestedOption) {
    throw new HttpError(409, "Mode d'envoi non finalise pour cette option avant paiement.");
  }

  await assertMandatoryPiecesReady(supabase, dossier);
}
