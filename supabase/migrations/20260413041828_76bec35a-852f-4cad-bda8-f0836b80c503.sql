-- 1. Remove pieces_justificatives from realtime if it's currently published
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'pieces_justificatives'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pieces_justificatives;
  END IF;
END $$;

-- 2. Add SELECT policy for assigned staff on admin_tasks
CREATE POLICY "Assigned users can view their tasks"
  ON public.admin_tasks
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

-- 3. Consolidate duplicate SELECT policies on signature-certificates storage bucket
DROP POLICY IF EXISTS "Owner can access certificates" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own certificates" ON storage.objects;