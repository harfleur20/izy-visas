
-- =============================================
-- 1. Migrate existing 'admin' roles to 'admin_delegue'
-- =============================================
UPDATE public.user_roles SET role = 'admin_delegue' WHERE role = 'admin';

-- =============================================
-- 2. Create admin_invitations table
-- =============================================
CREATE TABLE public.admin_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID NOT NULL,
  motif TEXT,
  perimetre TEXT,
  nom TEXT,
  prenom TEXT,
  date_debut DATE,
  date_fin DATE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage invitations"
ON public.admin_invitations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role full access invitations"
ON public.admin_invitations FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- =============================================
-- 3. Create audit_admin table (append-only)
-- =============================================
CREATE TABLE public.audit_admin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  admin_id UUID NOT NULL,
  admin_role TEXT NOT NULL,
  cible_type TEXT,
  cible_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  adresse_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_admin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read audit"
ON public.audit_admin FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can read audit"
ON public.audit_admin FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

CREATE POLICY "Service role full access audit"
ON public.audit_admin FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- =============================================
-- 4. Update RLS on dossiers
-- =============================================
DROP POLICY IF EXISTS "Admins can view all dossiers" ON public.dossiers;
DROP POLICY IF EXISTS "Admins can update all dossiers" ON public.dossiers;

CREATE POLICY "Super admin full access dossiers"
ON public.dossiers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can read dossiers"
ON public.dossiers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

CREATE POLICY "Admin delegue can update dossiers"
ON public.dossiers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 5. Update RLS on payments
-- =============================================
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;

CREATE POLICY "Super admin can view all payments"
ON public.payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- 6. Update RLS on profiles
-- =============================================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Super admin can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 7. Update RLS on user_roles
-- =============================================
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Super admin can manage all roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 8. Update RLS on admin_tasks
-- =============================================
DROP POLICY IF EXISTS "Admins can manage tasks" ON public.admin_tasks;

CREATE POLICY "Super admin can manage tasks"
ON public.admin_tasks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can manage tasks"
ON public.admin_tasks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 9. Update RLS on references_juridiques
-- =============================================
DROP POLICY IF EXISTS "Admins can manage all references" ON public.references_juridiques;

CREATE POLICY "Super admin can manage references"
ON public.references_juridiques FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin juridique can manage references"
ON public.references_juridiques FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_juridique'))
WITH CHECK (public.has_role(auth.uid(), 'admin_juridique'));

-- =============================================
-- 10. Update RLS on courriers_capdemarches
-- =============================================
DROP POLICY IF EXISTS "Admins can view all courriers" ON public.courriers_capdemarches;
DROP POLICY IF EXISTS "Admins can manage courriers" ON public.courriers_capdemarches;

CREATE POLICY "Super admin can manage courriers"
ON public.courriers_capdemarches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can manage courriers"
ON public.courriers_capdemarches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 11. Update RLS on signatures
-- =============================================
DROP POLICY IF EXISTS "Admins can view all signatures" ON public.signatures;

CREATE POLICY "Super admin can view all signatures"
ON public.signatures FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view all signatures"
ON public.signatures FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 12. Update RLS on envois_lrar
-- =============================================
DROP POLICY IF EXISTS "Admins can view all envois" ON public.envois_lrar;

CREATE POLICY "Super admin can view all envois"
ON public.envois_lrar FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can view all envois"
ON public.envois_lrar FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 13. Update RLS on pieces_justificatives
-- =============================================
DROP POLICY IF EXISTS "Admins can manage all pieces" ON public.pieces_justificatives;

CREATE POLICY "Super admin can manage all pieces"
ON public.pieces_justificatives FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delegue can manage all pieces"
ON public.pieces_justificatives FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'))
WITH CHECK (public.has_role(auth.uid(), 'admin_delegue'));

-- =============================================
-- 14. Update RLS on pieces_requises
-- =============================================
DROP POLICY IF EXISTS "Admins can manage all pieces_requises" ON public.pieces_requises;

CREATE POLICY "Super admin can manage pieces_requises"
ON public.pieces_requises FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin juridique can manage pieces_requises"
ON public.pieces_requises FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin_juridique'))
WITH CHECK (public.has_role(auth.uid(), 'admin_juridique'));

CREATE POLICY "Admin delegue can read pieces_requises"
ON public.pieces_requises FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_delegue'));
