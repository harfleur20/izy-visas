-- Ensure invited admins do not receive the default client role on account creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    date_naissance,
    lieu_naissance,
    nationalite,
    passport_number
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'given_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', NEW.raw_user_meta_data ->> 'family_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.phone, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'date_naissance', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'lieu_naissance', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'nationalite', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'passport_number', '')
  );

  IF COALESCE(NEW.raw_user_meta_data ->> 'skip_default_client_role', 'false') <> 'true' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client');
  END IF;

  RETURN NEW;
END;
$$;

-- Clean legacy admin accounts created with both client + admin roles
DELETE FROM public.user_roles client_role
USING public.user_roles admin_role
WHERE client_role.user_id = admin_role.user_id
  AND client_role.role = 'client'
  AND admin_role.role IN ('admin', 'super_admin', 'admin_delegue', 'admin_juridique');

-- Make get_user_role deterministic if a user still has several roles
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin_delegue' THEN 2
    WHEN 'admin_juridique' THEN 3
    WHEN 'admin' THEN 4
    WHEN 'avocat' THEN 5
    ELSE 6
  END
  LIMIT 1
$$;
