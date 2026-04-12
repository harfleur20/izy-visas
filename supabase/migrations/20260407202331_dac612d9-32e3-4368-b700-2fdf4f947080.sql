
-- 1. Fix signatures SELECT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can view own signatures" ON public.signatures;
CREATE POLICY "Users can view own signatures" ON public.signatures
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Fix payments SELECT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Fix signatures INSERT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can create own signatures" ON public.signatures;
CREATE POLICY "Users can create own signatures" ON public.signatures
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Fix payments INSERT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can create own payments" ON public.payments;
CREATE POLICY "Users can create own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. Fix dossiers INSERT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can create own dossiers" ON public.dossiers;
CREATE POLICY "Users can create own dossiers" ON public.dossiers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. Fix envois_lrar INSERT: restrict to authenticated only
DROP POLICY IF EXISTS "Users can create own envois" ON public.envois_lrar;
CREATE POLICY "Users can create own envois" ON public.envois_lrar
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 7. CRITICAL: Prevent privilege escalation on user_roles
-- Remove the ALL policy and replace with granular policies
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
