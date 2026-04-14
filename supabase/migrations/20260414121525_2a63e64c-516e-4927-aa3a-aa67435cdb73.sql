-- Add validation_juridique_note to dossiers
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS validation_juridique_note text;

-- Add indexes on audit_admin for performance
CREATE INDEX IF NOT EXISTS idx_audit_admin_created_at ON public.audit_admin (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_admin_admin_id ON public.audit_admin (admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin_action_type ON public.audit_admin (action_type);

-- Allow admin_delegue to read audit_admin
CREATE POLICY "Admin delegue can read audit"
ON public.audit_admin
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin_delegue'::app_role));