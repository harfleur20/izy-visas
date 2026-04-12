
CREATE TABLE public.envois_lrar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dossier_ref TEXT NOT NULL,
  signature_id UUID REFERENCES public.signatures(id),
  visa_type TEXT NOT NULL CHECK (visa_type IN ('long_sejour', 'court_sejour')),
  recipient_name TEXT NOT NULL,
  recipient_address_line1 TEXT NOT NULL,
  recipient_address_line2 TEXT,
  recipient_city TEXT NOT NULL,
  recipient_postal_code TEXT NOT NULL,
  recipient_country TEXT NOT NULL DEFAULT 'France',
  mysendingbox_letter_id TEXT,
  tracking_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  pdf_url TEXT,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.envois_lrar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own envois" ON public.envois_lrar
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own envois" ON public.envois_lrar
  FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update envois" ON public.envois_lrar
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_envois_lrar_updated_at
  BEFORE UPDATE ON public.envois_lrar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
