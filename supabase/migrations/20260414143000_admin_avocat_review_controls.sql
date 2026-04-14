ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS validation_juridique_note text;

CREATE INDEX IF NOT EXISTS idx_audit_admin_action_type_created_at
  ON public.audit_admin(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_admin_cible
  ON public.audit_admin(cible_type, cible_id);

DROP POLICY IF EXISTS "Admin delegue can read operational audit" ON public.audit_admin;

CREATE POLICY "Admin delegue can read operational audit"
ON public.audit_admin FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_delegue'::public.app_role)
  AND action_type IN (
    'assignation_avocat_dossier',
    'reassignation_avocat_dossier',
    'mise_a_jour_avocat_partenaire',
    'suspension_avocat_partenaire',
    'reactivation_avocat_partenaire',
    'creation_invitation_avocat',
    'revocation_invitation_avocat',
    'prolongation_invitation_avocat',
    'validation_avocat_dossier',
    'blocage_avocat_dossier'
  )
);
