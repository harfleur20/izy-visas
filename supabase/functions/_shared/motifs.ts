/**
 * SOURCE DE VÉRITÉ pour les motifs de refus côté Deno edge functions.
 *
 * ⚠️ Doit rester synchronisée avec src/lib/motifs.ts (copie front).
 * Les edge functions Deno ne peuvent pas importer depuis src/, d'où la duplication
 * volontaire et minimale de ce fichier dédié.
 */

export type MotifCode = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export const MOTIF_LABELS: Record<MotifCode, string> = {
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

export const MOTIF_CODES = Object.keys(MOTIF_LABELS) as MotifCode[];

export function getMotifLabel(code: string): string {
  return MOTIF_LABELS[code as MotifCode] || `Motif ${code}`;
}

/**
 * Guidance juridique injectée dans le prompt de génération de la lettre de recours.
 * Pour chaque motif, liste les arguments-types et fondements CESEDA pertinents.
 */
export const MOTIF_GUIDANCE: Record<MotifCode, string> = {
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
