
CREATE TABLE public.rgpd_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  demandeur_email text NOT NULL,
  type text NOT NULL DEFAULT 'acces',
  dossier_ref text,
  motif text,
  statut text NOT NULL DEFAULT 'nouvelle',
  assigned_to uuid,
  completed_at timestamp with time zone,
  due_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rgpd_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access rgpd_requests"
  ON public.rgpd_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admin can manage rgpd_requests"
  ON public.rgpd_requests FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admin delegue can manage rgpd_requests"
  ON public.rgpd_requests FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin_delegue'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin_delegue'::app_role));

CREATE TRIGGER update_rgpd_requests_updated_at
  BEFORE UPDATE ON public.rgpd_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
