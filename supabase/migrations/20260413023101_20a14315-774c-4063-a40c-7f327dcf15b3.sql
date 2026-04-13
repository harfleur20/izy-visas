
ALTER TABLE public.dossiers
ADD COLUMN statut_final text DEFAULT NULL;

COMMENT ON COLUMN public.dossiers.statut_final IS 'Issue finale du recours: visa_obtenu, visa_refuse, ou NULL si en cours';
