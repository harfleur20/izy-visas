
CREATE TABLE public.pieces_requises (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type_visa text NOT NULL DEFAULT 'tous',
  motifs_concernes text[] NOT NULL DEFAULT '{tous}',
  nom_piece text NOT NULL,
  description_simple text NOT NULL DEFAULT '',
  pourquoi_necessaire text DEFAULT '',
  obligatoire boolean NOT NULL DEFAULT false,
  conditionnel boolean NOT NULL DEFAULT false,
  condition_declenchement text,
  alternative_possible text,
  format_accepte text NOT NULL DEFAULT 'tous',
  taille_max_mo integer NOT NULL DEFAULT 10,
  traduction_requise boolean NOT NULL DEFAULT false,
  apostille_requise boolean NOT NULL DEFAULT false,
  original_requis boolean NOT NULL DEFAULT false,
  ordre_affichage integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pieces_requises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all pieces_requises"
  ON public.pieces_requises FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read active pieces_requises"
  ON public.pieces_requises FOR SELECT
  TO authenticated
  USING (actif = true);

CREATE POLICY "Service role full access pieces_requises"
  ON public.pieces_requises FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
