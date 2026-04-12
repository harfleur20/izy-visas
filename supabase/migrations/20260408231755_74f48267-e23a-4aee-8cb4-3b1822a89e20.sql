
-- Add OCR qualification columns to dossiers
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS type_visa_texte_original text,
  ADD COLUMN IF NOT EXISTS consulat_nom text,
  ADD COLUMN IF NOT EXISTS consulat_ville text,
  ADD COLUMN IF NOT EXISTS consulat_pays text,
  ADD COLUMN IF NOT EXISTS date_notification_refus date,
  ADD COLUMN IF NOT EXISTS motifs_refus text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS motifs_texte_original text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS numero_decision text,
  ADD COLUMN IF NOT EXISTS destinataire_recours text,
  ADD COLUMN IF NOT EXISTS langue_document text,
  ADD COLUMN IF NOT EXISTS url_decision_refus text,
  ADD COLUMN IF NOT EXISTS score_ocr_decision integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_qualification timestamp with time zone;
