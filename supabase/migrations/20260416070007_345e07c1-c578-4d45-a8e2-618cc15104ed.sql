CREATE POLICY "Anon can read active pieces_requises"
ON public.pieces_requises
FOR SELECT
TO anon
USING (actif = true);