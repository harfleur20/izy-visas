ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS url_lettre_signee_avocat text,
  ADD COLUMN IF NOT EXISTS date_signature_avocat timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_avocat_id uuid,
  ADD COLUMN IF NOT EXISTS signature_avocat_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dossiers_signature_avocat_mode_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_signature_avocat_mode_check
      CHECK (signature_avocat_mode IS NULL OR signature_avocat_mode IN ('upload_pdf'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dossiers_signed_by_avocat_id
  ON public.dossiers(signed_by_avocat_id);

DROP POLICY IF EXISTS "Dossier participants can view dossier id files" ON storage.objects;
CREATE POLICY "Dossier participants can view dossier id files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dossiers'
    AND EXISTS (
      SELECT 1
      FROM public.dossiers d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND (
          d.user_id = auth.uid()
          OR d.avocat_id = auth.uid()
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
        )
    )
  );

DROP POLICY IF EXISTS "Assigned avocat can upload signed dossier files" ON storage.objects;
CREATE POLICY "Assigned avocat can upload signed dossier files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dossiers'
    AND EXISTS (
      SELECT 1
      FROM public.dossiers d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND name LIKE (d.id::text || '/lettre_signee_avocat_%')
        AND d.avocat_id = auth.uid()
        AND public.has_role(auth.uid(), 'avocat'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Assigned avocat can update signed dossier files" ON storage.objects;
CREATE POLICY "Assigned avocat can update signed dossier files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'dossiers'
    AND EXISTS (
      SELECT 1
      FROM public.dossiers d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND name LIKE (d.id::text || '/lettre_signee_avocat_%')
        AND d.avocat_id = auth.uid()
        AND public.has_role(auth.uid(), 'avocat'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'dossiers'
    AND EXISTS (
      SELECT 1
      FROM public.dossiers d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND name LIKE (d.id::text || '/lettre_signee_avocat_%')
        AND d.avocat_id = auth.uid()
        AND public.has_role(auth.uid(), 'avocat'::public.app_role)
    )
  );
