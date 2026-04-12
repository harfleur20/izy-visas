
-- Signatures table
CREATE TABLE public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dossier_ref text NOT NULL,
  yousign_signature_request_id text,
  yousign_signer_id text,
  document_name text NOT NULL,
  signer_email text NOT NULL,
  signer_phone text,
  status text NOT NULL DEFAULT 'pending',
  otp_verified boolean NOT NULL DEFAULT false,
  certificate_path text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signatures" ON public.signatures
  FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can create own signatures" ON public.signatures
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update signatures" ON public.signatures
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_signatures_updated_at
  BEFORE UPDATE ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for certificates
INSERT INTO storage.buckets (id, name, public) VALUES ('signature-certificates', 'signature-certificates', false);

CREATE POLICY "Users can view own certificates" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'signature-certificates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role can upload certificates" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'signature-certificates');
