DROP POLICY IF EXISTS "Admin delegue can view payments" ON public.payments;

CREATE POLICY "Admin delegue can view payments"
ON public.payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'::public.app_role));

DROP POLICY IF EXISTS "Admin delegue can read references_juridiques" ON public.references_juridiques;

CREATE POLICY "Admin delegue can read references_juridiques"
ON public.references_juridiques FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'::public.app_role));

CREATE TABLE IF NOT EXISTS public.rgpd_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dossier_ref text,
  demandeur_email text NOT NULL,
  type text NOT NULL DEFAULT 'acces' CHECK (type IN ('acces', 'rectification', 'suppression', 'opposition', 'portabilite', 'limitation', 'autre')),
  statut text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'en_cours', 'terminee', 'rejetee')),
  motif text,
  reponse text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rgpd_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rgpd_requests_statut_due_at
  ON public.rgpd_requests(statut, due_at);

CREATE INDEX IF NOT EXISTS idx_rgpd_requests_user_id
  ON public.rgpd_requests(user_id);

DROP TRIGGER IF EXISTS update_rgpd_requests_updated_at ON public.rgpd_requests;
CREATE TRIGGER update_rgpd_requests_updated_at
BEFORE UPDATE ON public.rgpd_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can create own rgpd requests" ON public.rgpd_requests;
CREATE POLICY "Users can create own rgpd requests"
ON public.rgpd_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own rgpd requests" ON public.rgpd_requests;
CREATE POLICY "Users can read own rgpd requests"
ON public.rgpd_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admin can manage rgpd requests" ON public.rgpd_requests;
CREATE POLICY "Super admin can manage rgpd requests"
ON public.rgpd_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admin delegue can manage rgpd requests" ON public.rgpd_requests;
CREATE POLICY "Admin delegue can manage rgpd requests"
ON public.rgpd_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'::public.app_role));

DROP POLICY IF EXISTS "Service role full access rgpd requests" ON public.rgpd_requests;
CREATE POLICY "Service role full access rgpd requests"
ON public.rgpd_requests FOR ALL TO service_role
USING (true)
WITH CHECK (true);
