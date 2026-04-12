
-- Add procuration fields to dossiers table
ALTER TABLE public.dossiers 
  ADD COLUMN IF NOT EXISTS procuration_signee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_signature_procuration timestamp with time zone,
  ADD COLUMN IF NOT EXISTS url_procuration_pdf text,
  ADD COLUMN IF NOT EXISTS procuration_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procuration_expiration date,
  ADD COLUMN IF NOT EXISTS use_capdemarches boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_date_naissance text,
  ADD COLUMN IF NOT EXISTS client_lieu_naissance text,
  ADD COLUMN IF NOT EXISTS client_nationalite text,
  ADD COLUMN IF NOT EXISTS client_passport_number text,
  ADD COLUMN IF NOT EXISTS client_adresse_origine text,
  ADD COLUMN IF NOT EXISTS client_ville text,
  ADD COLUMN IF NOT EXISTS client_email text;

-- Create courriers_capdemarches table
CREATE TABLE public.courriers_capdemarches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL,
  dossier_ref text NOT NULL,
  user_id uuid NOT NULL,
  expediteur text NOT NULL DEFAULT 'CRRV',
  date_reception timestamp with time zone NOT NULL DEFAULT now(),
  date_transmission timestamp with time zone,
  url_courrier_pdf text,
  statut text NOT NULL DEFAULT 'recu',
  type_decision text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.courriers_capdemarches ENABLE ROW LEVEL SECURITY;

-- RLS policies for courriers_capdemarches
CREATE POLICY "Users can view own courriers" ON public.courriers_capdemarches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all courriers" ON public.courriers_capdemarches
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage courriers" ON public.courriers_capdemarches
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage courriers" ON public.courriers_capdemarches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Create admin_tasks table for tracking tasks like mail forwarding
CREATE TABLE public.admin_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  dossier_ref text NOT NULL,
  client_name text NOT NULL,
  user_id uuid NOT NULL,
  description text,
  deadline timestamp with time zone,
  statut text NOT NULL DEFAULT 'en_attente',
  assigned_to uuid,
  related_courrier_id uuid REFERENCES public.courriers_capdemarches(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tasks" ON public.admin_tasks
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage tasks" ON public.admin_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Create dossiers storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('dossiers', 'dossiers', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can view own files
CREATE POLICY "Users can view own dossier files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dossiers' AND (storage.foldername(name))[1] = 'dossiers' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE POLICY "Service role can manage dossier files" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'dossiers') WITH CHECK (bucket_id = 'dossiers');

CREATE POLICY "Admins can view all dossier files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dossiers' AND has_role(auth.uid(), 'admin'::app_role));
