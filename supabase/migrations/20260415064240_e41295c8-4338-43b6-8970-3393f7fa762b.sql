ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS url_lettre_signee_avocat text,
  ADD COLUMN IF NOT EXISTS signed_by_avocat_id uuid,
  ADD COLUMN IF NOT EXISTS date_signature_avocat timestamptz,
  ADD COLUMN IF NOT EXISTS signature_avocat_mode text;