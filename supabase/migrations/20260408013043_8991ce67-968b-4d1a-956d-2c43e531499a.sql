ALTER TABLE public.pieces_justificatives 
  ADD COLUMN IF NOT EXISTS moteur_ocr text DEFAULT 'mistral-ocr-latest',
  ADD COLUMN IF NOT EXISTS type_document_detecte text,
  ADD COLUMN IF NOT EXISTS type_document_attendu text,
  ADD COLUMN IF NOT EXISTS langue_detectee text,
  ADD COLUMN IF NOT EXISTS date_detectee text,
  ADD COLUMN IF NOT EXISTS pages_detectees integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_tronque boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS texte_manuscrit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS problemes_detectes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS date_analyse_ocr timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cout_ocr_estime numeric DEFAULT 0;