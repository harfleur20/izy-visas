
CREATE TABLE public.references_juridiques (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categorie text NOT NULL CHECK (categorie IN ('texte_loi', 'jurisprudence_ta', 'jurisprudence_caa', 'jurisprudence_ce', 'jurisprudence_cedh', 'decret', 'circulaire')),
  reference_complete text NOT NULL,
  intitule_court text NOT NULL,
  texte_exact text NOT NULL DEFAULT '',
  resume_vulgarise text DEFAULT '',
  motifs_concernes text[] NOT NULL DEFAULT '{}',
  argument_type text NOT NULL DEFAULT 'autre',
  favorable_demandeur boolean DEFAULT true,
  juridiction text,
  date_decision date,
  date_verification date,
  verifie_par text,
  source_url text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.references_juridiques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all references"
  ON public.references_juridiques FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Avocats can read active references"
  ON public.references_juridiques FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'avocat') AND actif = true);

CREATE POLICY "Service role full access references"
  ON public.references_juridiques FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
