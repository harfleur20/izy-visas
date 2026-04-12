-- Bloc 2/3/4: persist the selected client option and Stripe pricing details.

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS option_choisie text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS option_choisie text,
  ADD COLUMN IF NOT EXISTS pricing_details jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dossiers_option_choisie_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_option_choisie_check
      CHECK (option_choisie IS NULL OR option_choisie IN ('A', 'B', 'C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_option_choisie_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_option_choisie_check
      CHECK (option_choisie IS NULL OR option_choisie IN ('A', 'B', 'C'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dossiers_option_choisie
  ON public.dossiers(option_choisie);

CREATE INDEX IF NOT EXISTS idx_payments_option_choisie
  ON public.payments(option_choisie);
