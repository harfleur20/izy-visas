
-- Add LRAR composition fields to dossiers table
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS refus_type text NOT NULL DEFAULT 'expres',
  ADD COLUMN IF NOT EXISTS pieces_obligatoires_pages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pieces_optionnelles_pages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cout_mysendingbox_total numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pieces_selectionnees_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consentement_supplement boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_consentement timestamptz;
