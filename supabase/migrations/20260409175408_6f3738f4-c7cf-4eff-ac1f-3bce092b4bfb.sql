
-- ═══════════════════════════════════════
-- 1. Nouvelles colonnes sur dossiers
-- ═══════════════════════════════════════
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS url_lettre_neutre text,
  ADD COLUMN IF NOT EXISTS date_generation_neutre timestamptz,
  ADD COLUMN IF NOT EXISTS option_envoi text,
  ADD COLUMN IF NOT EXISTS type_signataire text,
  ADD COLUMN IF NOT EXISTS url_lettre_definitive text,
  ADD COLUMN IF NOT EXISTS references_verifiees jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS references_a_verifier jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lettre_neutre_contenu text,
  ADD COLUMN IF NOT EXISTS avocat_nom text,
  ADD COLUMN IF NOT EXISTS avocat_prenom text,
  ADD COLUMN IF NOT EXISTS avocat_barreau text;

-- ═══════════════════════════════════════
-- 2. Table tarification
-- ═══════════════════════════════════════
CREATE TABLE public.tarification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_lettre_eur numeric NOT NULL DEFAULT 0,
  envoi_mysendingbox_eur numeric NOT NULL DEFAULT 0,
  honoraires_avocat_eur numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tarification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tarification"
  ON public.tarification FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admin can manage tarification"
  ON public.tarification FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role full access tarification"
  ON public.tarification FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert default row
INSERT INTO public.tarification (generation_lettre_eur, envoi_mysendingbox_eur, honoraires_avocat_eur)
VALUES (49, 30, 70);

-- ═══════════════════════════════════════
-- 3. Table avocats_partenaires
-- ═══════════════════════════════════════
CREATE TABLE public.avocats_partenaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nom text NOT NULL,
  prenom text NOT NULL,
  barreau text NOT NULL,
  email text NOT NULL,
  phone text,
  specialites text[] DEFAULT '{}'::text[],
  capacite_max integer NOT NULL DEFAULT 10,
  dossiers_en_cours integer NOT NULL DEFAULT 0,
  disponible boolean NOT NULL DEFAULT true,
  delai_moyen_jours integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avocats_partenaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Avocat can view own profile"
  ON public.avocats_partenaires FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin can manage avocats_partenaires"
  ON public.avocats_partenaires FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view avocats_partenaires"
  ON public.avocats_partenaires FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin_delegue'));

CREATE POLICY "Service role full access avocats_partenaires"
  ON public.avocats_partenaires FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_tarification_updated_at
  BEFORE UPDATE ON public.tarification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_avocats_partenaires_updated_at
  BEFORE UPDATE ON public.avocats_partenaires
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
