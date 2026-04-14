-- Onboarding des avocats partenaires par invitation admin.

CREATE TABLE IF NOT EXISTS public.avocat_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by uuid NOT NULL,
  nom text NOT NULL,
  prenom text NOT NULL,
  barreau text NOT NULL,
  phone text,
  specialites text[] NOT NULL DEFAULT '{}'::text[],
  capacite_max integer NOT NULL DEFAULT 5 CHECK (capacite_max > 0),
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

DROP POLICY IF EXISTS "Super admin can manage avocat invitations" ON public.avocat_invitations;
DROP POLICY IF EXISTS "Admin delegue can manage avocat invitations" ON public.avocat_invitations;
DROP POLICY IF EXISTS "Service role full access avocat invitations" ON public.avocat_invitations;

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

-- Le profil avocat doit pouvoir être maintenu depuis l'espace avocat.
DROP POLICY IF EXISTS "Avocat can update own profile" ON public.avocats_partenaires;

CREATE POLICY "Avocat can update own profile"
ON public.avocats_partenaires FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
