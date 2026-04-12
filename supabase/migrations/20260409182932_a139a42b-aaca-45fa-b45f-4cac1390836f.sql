CREATE POLICY "Users can update own dossiers"
ON public.dossiers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);