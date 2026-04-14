CREATE INDEX IF NOT EXISTS idx_audit_admin_juridique_created_at
  ON public.audit_admin(action_type, created_at DESC)
  WHERE action_type LIKE 'juridique_%';

DROP POLICY IF EXISTS "Admin juridique can read legal audit" ON public.audit_admin;

CREATE POLICY "Admin juridique can read legal audit"
ON public.audit_admin FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_juridique'::public.app_role)
  AND action_type LIKE 'juridique_%'
);

CREATE OR REPLACE FUNCTION public.log_juridique_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text := 'admin_juridique';
  record_data jsonb;
  before_data jsonb;
  after_data jsonb;
  record_id text;
  record_label text;
  changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF public.has_role(actor_id, 'super_admin'::public.app_role) THEN
    actor_role := 'super_admin';
  ELSIF public.has_role(actor_id, 'admin_juridique'::public.app_role) THEN
    actor_role := 'admin_juridique';
  END IF;

  IF TG_OP = 'DELETE' THEN
    record_data := to_jsonb(OLD);
  ELSE
    record_data := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    before_data := to_jsonb(OLD);
    after_data := to_jsonb(NEW);

    SELECT COALESCE(array_agg(fields.key), ARRAY[]::text[])
    INTO changed_fields
    FROM jsonb_object_keys(after_data) AS fields(key)
    WHERE after_data -> fields.key IS DISTINCT FROM before_data -> fields.key;
  END IF;

  record_id := record_data ->> 'id';
  record_label := COALESCE(
    record_data ->> 'intitule_court',
    record_data ->> 'reference_complete',
    record_data ->> 'nom_piece',
    record_id
  );

  INSERT INTO public.audit_admin (
    action_type,
    admin_id,
    admin_role,
    cible_type,
    cible_id,
    details
  )
  VALUES (
    'juridique_' || TG_TABLE_NAME || '_' || lower(TG_OP),
    actor_id,
    actor_role,
    TG_TABLE_NAME,
    record_id,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record_id', record_id,
      'label', record_label,
      'changed_fields', changed_fields
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_references_juridiques ON public.references_juridiques;
CREATE TRIGGER trg_audit_references_juridiques
AFTER INSERT OR UPDATE OR DELETE ON public.references_juridiques
FOR EACH ROW EXECUTE FUNCTION public.log_juridique_admin_change();

DROP TRIGGER IF EXISTS trg_audit_pieces_requises ON public.pieces_requises;
CREATE TRIGGER trg_audit_pieces_requises
AFTER INSERT OR UPDATE OR DELETE ON public.pieces_requises
FOR EACH ROW EXECUTE FUNCTION public.log_juridique_admin_change();
