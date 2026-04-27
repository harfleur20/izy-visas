ALTER TABLE public.dossiers
  DROP CONSTRAINT IF EXISTS dossiers_visa_type_check;

ALTER TABLE public.dossiers
  ADD CONSTRAINT dossiers_visa_type_check
  CHECK (
    visa_type IN (
      'court_sejour',
      'long_sejour',
      'etudiant',
      'conjoint_francais',
      'salarie',
      'passeport_talent',
      'visiteur',
      'parent_enfant_francais',
      'autre'
    )
  );
