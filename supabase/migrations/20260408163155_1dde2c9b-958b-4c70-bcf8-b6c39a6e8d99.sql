
-- =============================================
-- 1. FIX: payments table - remove client INSERT policy
-- =============================================
DROP POLICY IF EXISTS "Users can create own payments" ON public.payments;

-- Add a service_role INSERT policy (webhook only)
CREATE POLICY "Service role can insert payments"
ON public.payments
FOR INSERT
TO service_role
WITH CHECK (true);

-- Add verified_by_webhook column
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS verified_by_webhook boolean NOT NULL DEFAULT false;

-- =============================================
-- 2. FIX: storage policies - replace 'admin' with actual roles
-- =============================================

-- Fix signature-certificates bucket policies
DROP POLICY IF EXISTS "Admins can access all certificates" ON storage.objects;

CREATE POLICY "Super admin can access all certificates"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signature-certificates'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  )
);

-- Add DELETE policy for signature-certificates
CREATE POLICY "Admins can delete certificates"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'signature-certificates'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  )
);

-- Fix dossiers bucket policies
DROP POLICY IF EXISTS "Admins can view all dossier files" ON storage.objects;

CREATE POLICY "Super admin can view all dossier files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dossiers'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  )
);

-- Add UPDATE policy for dossiers bucket (admins)
CREATE POLICY "Admins can update dossier files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dossiers'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  )
);

-- Add DELETE policy for dossiers bucket (admins)
CREATE POLICY "Admins can delete dossier files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'dossiers'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  )
);

-- =============================================
-- 3. FIX: dossiers bucket - add user INSERT policy
-- =============================================
CREATE POLICY "Users can upload own dossier files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dossiers'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
