
-- 1. Add avocat_id column to dossiers for assignment
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS avocat_id uuid;

-- 2. Add avocat_id column to envois_lrar
ALTER TABLE public.envois_lrar ADD COLUMN IF NOT EXISTS avocat_id uuid;

-- 3. Admin can view ALL dossiers
CREATE POLICY "Admins can view all dossiers" ON public.dossiers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Avocat can view assigned dossiers
CREATE POLICY "Avocats can view assigned dossiers" ON public.dossiers
  FOR SELECT TO authenticated
  USING (avocat_id = auth.uid() AND has_role(auth.uid(), 'avocat'::app_role));

-- 5. Avocat can update assigned dossiers
CREATE POLICY "Avocats can update assigned dossiers" ON public.dossiers
  FOR UPDATE TO authenticated
  USING (avocat_id = auth.uid() AND has_role(auth.uid(), 'avocat'::app_role))
  WITH CHECK (avocat_id = auth.uid() AND has_role(auth.uid(), 'avocat'::app_role));

-- 6. Admin can update all dossiers
CREATE POLICY "Admins can update all dossiers" ON public.dossiers
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. Admin can view all envois_lrar
CREATE POLICY "Admins can view all envois" ON public.envois_lrar
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 8. Avocat can view assigned envois
CREATE POLICY "Avocats can view assigned envois" ON public.envois_lrar
  FOR SELECT TO authenticated
  USING (avocat_id = auth.uid() AND has_role(auth.uid(), 'avocat'::app_role));

-- 9. Admin can view all payments
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 10. Admin can view all signatures
CREATE POLICY "Admins can view all signatures" ON public.signatures
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 11. Storage: owner can access their certificates
CREATE POLICY "Owner can access certificates" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signature-certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 12. Storage: owner can upload certificates
CREATE POLICY "Owner can upload certificates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signature-certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 13. Admin can access all certificates
CREATE POLICY "Admins can access all certificates" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signature-certificates'
    AND has_role(auth.uid(), 'admin'::app_role)
  );
