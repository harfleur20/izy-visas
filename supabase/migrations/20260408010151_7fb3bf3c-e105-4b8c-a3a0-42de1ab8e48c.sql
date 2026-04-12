
CREATE TABLE public.pieces_justificatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL,
  user_id uuid NOT NULL,
  nom_piece text NOT NULL,
  type_piece text NOT NULL DEFAULT 'optionnelle',
  statut_ocr text NOT NULL DEFAULT 'pending',
  score_qualite integer DEFAULT 0,
  nombre_pages integer DEFAULT 1,
  motif_rejet text,
  correction_appliquee boolean DEFAULT false,
  date_upload timestamptz NOT NULL DEFAULT now(),
  url_fichier_original text,
  url_fichier_corrige text,
  taille_fichier_ko integer DEFAULT 0,
  format_fichier text,
  ocr_text_extract text,
  ocr_details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pieces_justificatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pieces" ON public.pieces_justificatives
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pieces" ON public.pieces_justificatives
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pieces" ON public.pieces_justificatives
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all pieces" ON public.pieces_justificatives
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access pieces" ON public.pieces_justificatives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_pieces_justificatives_updated_at
  BEFORE UPDATE ON public.pieces_justificatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
