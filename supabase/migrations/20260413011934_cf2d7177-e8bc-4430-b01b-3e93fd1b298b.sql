CREATE POLICY "Users can delete own pieces"
ON public.pieces_justificatives
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);