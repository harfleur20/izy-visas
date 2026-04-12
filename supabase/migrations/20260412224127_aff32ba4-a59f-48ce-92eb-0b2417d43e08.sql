ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_links jsonb DEFAULT '{}'::jsonb;