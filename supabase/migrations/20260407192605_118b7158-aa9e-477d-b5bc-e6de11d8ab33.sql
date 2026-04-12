
CREATE TABLE public.dossiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dossier_ref TEXT NOT NULL UNIQUE,
  visa_type TEXT NOT NULL CHECK (visa_type IN ('long_sejour', 'court_sejour')),
  client_first_name TEXT NOT NULL,
  client_last_name TEXT NOT NULL,
  client_phone TEXT,
  recipient_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_postal_code TEXT NOT NULL,
  recipient_city TEXT NOT NULL,
  mysendingbox_letter_id TEXT,
  tracking_number TEXT,
  lrar_status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dossiers" ON public.dossiers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own dossiers" ON public.dossiers
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update dossiers" ON public.dossiers
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_dossiers_updated_at
  BEFORE UPDATE ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
