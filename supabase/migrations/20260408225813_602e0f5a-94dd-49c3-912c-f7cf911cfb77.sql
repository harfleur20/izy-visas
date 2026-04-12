
-- =============================================
-- 1. Ajouter les colonnes manquantes à profiles
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS adresse_ligne1 text,
  ADD COLUMN IF NOT EXISTS adresse_ligne2 text,
  ADD COLUMN IF NOT EXISTS code_postal text,
  ADD COLUMN IF NOT EXISTS ville text,
  ADD COLUMN IF NOT EXISTS pays text DEFAULT 'Cameroun',
  ADD COLUMN IF NOT EXISTS prefixe_telephone text DEFAULT '+237',
  ADD COLUMN IF NOT EXISTS actif boolean DEFAULT true;

-- =============================================
-- 2. Créer la table notifications
-- =============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  titre text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  lu boolean NOT NULL DEFAULT false,
  lien text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admin can view all notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view all notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_delegue'));

CREATE POLICY "Service role full access notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================
-- 3. Audit_admin : retirer l'accès admin_delegue
-- =============================================
DROP POLICY IF EXISTS "Admin delegue can read audit" ON public.audit_admin;

-- =============================================
-- 4. Pièces justificatives : accès avocat via dossiers assignés
-- =============================================
CREATE POLICY "Avocats can view pieces of assigned dossiers"
  ON public.pieces_justificatives FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'avocat') AND
    EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.id = pieces_justificatives.dossier_id
        AND d.avocat_id = auth.uid()
    )
  );

-- =============================================
-- 5. Storage policies pour le bucket "dossiers"
-- =============================================

-- SELECT : propriétaire ou avocat assigné ou admin
CREATE POLICY "Dossiers storage select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dossiers' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'admin_delegue')
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.user_id::text = (storage.foldername(name))[1]
          AND d.avocat_id = auth.uid()
      )
    )
  );

-- INSERT : propriétaire uniquement
CREATE POLICY "Dossiers storage insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dossiers' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- UPDATE : propriétaire uniquement
CREATE POLICY "Dossiers storage update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'dossiers' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- DELETE : propriétaire ou admin
CREATE POLICY "Dossiers storage delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dossiers' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

-- =============================================
-- 6. Storage policies pour "signature-certificates" (procurations)
-- =============================================

-- SELECT : propriétaire ou super_admin
CREATE POLICY "Certificates storage select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signature-certificates' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

-- INSERT : propriétaire uniquement
CREATE POLICY "Certificates storage insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signature-certificates' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
