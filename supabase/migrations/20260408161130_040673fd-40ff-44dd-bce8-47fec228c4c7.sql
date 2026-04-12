
-- Add identity columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_naissance text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lieu_naissance text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nationalite text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_number text;

-- Update the handle_new_user trigger to also store these fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone, date_naissance, lieu_naissance, nationalite, passport_number)
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
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;
