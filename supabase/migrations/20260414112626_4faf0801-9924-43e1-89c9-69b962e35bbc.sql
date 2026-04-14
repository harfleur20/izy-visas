
CREATE TABLE IF NOT EXISTS public.avocat_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid NOT NULL,
  nom text NOT NULL,
  prenom text NOT NULL,
  barreau text NOT NULL,
  phone text,
  specialites text[] NOT NULL DEFAULT '{}'::text[],
  capacite_max integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avocat_invitations_email_idx
  ON public.avocat_invitations (lower(email));

CREATE INDEX IF NOT EXISTS avocat_invitations_token_idx
  ON public.avocat_invitations (token);

ALTER TABLE public.avocat_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage avocat invitations"
ON public.avocat_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Admin delegue can manage avocat invitations"
ON public.avocat_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'::public.app_role));

CREATE POLICY "Service role full access avocat invitations"
ON public.avocat_invitations FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Permettre aux avocats de mettre à jour leur propre profil
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Avocat can update own profile' AND tablename = 'avocats_partenaires'
  ) THEN
    CREATE POLICY "Avocat can update own profile"
    ON public.avocats_partenaires FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
