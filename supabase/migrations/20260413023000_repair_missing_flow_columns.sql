-- Repair migration for Lovable/Supabase projects where the client-flow
-- migrations were present in Git but not applied to the actual database.

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS option_choisie text,
  ADD COLUMN IF NOT EXISTS url_lrar_pdf text,
  ADD COLUMN IF NOT EXISTS date_finalisation_lettre timestamptz,
  ADD COLUMN IF NOT EXISTS validation_juridique_mode text NOT NULL DEFAULT 'hybride',
  ADD COLUMN IF NOT EXISTS validation_juridique_status text NOT NULL DEFAULT 'non_evaluee',
  ADD COLUMN IF NOT EXISTS date_validation_juridique timestamptz;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS option_choisie text,
  ADD COLUMN IF NOT EXISTS pricing_details jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dossiers_option_choisie_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_option_choisie_check
      CHECK (option_choisie IS NULL OR option_choisie IN ('A', 'B', 'C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_option_choisie_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_option_choisie_check
      CHECK (option_choisie IS NULL OR option_choisie IN ('A', 'B', 'C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dossiers_validation_juridique_mode_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_validation_juridique_mode_check
      CHECK (validation_juridique_mode IN ('automatique', 'manuelle_avocat', 'hybride'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dossiers_validation_juridique_status_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_validation_juridique_status_check
      CHECK (validation_juridique_status IN (
        'non_evaluee',
        'validee_automatique',
        'a_verifier_avocat',
        'validee_avocat',
        'bloquee'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dossiers_option_choisie
  ON public.dossiers(option_choisie);

CREATE INDEX IF NOT EXISTS idx_payments_option_choisie
  ON public.payments(option_choisie);

CREATE INDEX IF NOT EXISTS idx_dossiers_validation_juridique_status
  ON public.dossiers(validation_juridique_status);
