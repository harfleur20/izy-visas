/**
 * SOURCE DE VÉRITÉ UNIQUE pour les 12 motifs officiels de refus de visa français.
 *
 * Référence : Code communautaire des visas (Règlement UE n°810/2009) + CESEDA.
 * Ces 12 codes (A à L) correspondent aux cases à cocher du formulaire Cerfa
 * standardisé européen utilisé sur toute décision de refus de visa.
 *
 * ⚠️ Toute modification de ce fichier doit être répercutée dans :
 *   - supabase/functions/_shared/motifs.ts (copie côté Deno edge functions)
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

export function isValidMotifCode(code: string): code is MotifCode {
  return code in MOTIF_LABELS;
}
