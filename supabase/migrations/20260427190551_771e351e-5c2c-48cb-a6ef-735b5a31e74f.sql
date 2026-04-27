-- Expand visa_type check constraint on dossiers to accept detailed types from tunnel
ALTER TABLE public.dossiers DROP CONSTRAINT IF EXISTS dossiers_visa_type_check;

ALTER TABLE public.dossiers ADD CONSTRAINT dossiers_visa_type_check
CHECK (visa_type IN (
  'court_sejour',
  'long_sejour',
  'etudiant',
  'conjoint_francais',
  'salarie',
  'visiteur',
  'travailleur',
  'regroupement_familial',
  'talent',
  'vie_privee_familiale',
  'transit',
  'tourisme',
  'affaires',
  'medical',
  'autre'
));