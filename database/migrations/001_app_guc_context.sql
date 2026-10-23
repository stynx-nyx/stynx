-- 001_app_guc_context.sql
-- SM-05: move the bootstrap tenant context from the legacy auth.* / stynx.* settings
-- to the app.* dialect that @stynx-nyx/data's Database.tx sets:
--
--   auth.current_tenant / stynx.current_tenant  -> app.tenant_id
--   auth.app_user_id    / stynx.app_user_id     -> app.actor_id
--   auth.roles          / stynx.roles           -> app.roles (comma-separated role codes)
--   auth.lang                                   -> app.lang
--   stynx.correlation_id                        -> app.request_id
--
-- database/ddl is applied history and stays byte-for-byte (D-033, D-059 P-7-04 (c)).
-- This file redefines the helpers in place, keeping every signature, and recreates the
-- bootstrap policies with direct app.* predicates so LINT011 and the pg_policies
-- acceptance query see what each policy reads. Applied after database/ddl and before
-- database/seed; re-running it is safe.

-- ---------------------------------------------------------------------
-- Session context helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(current_setting('app.actor_id', TRUE), '');
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN v::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'auth.current_user_id received non-uuid value %', v USING errcode = '22023';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION auth.current_roles()
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(current_setting('app.roles', TRUE), '');
  IF v IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  RETURN ARRAY(
    SELECT trim(lower(value))
      FROM regexp_split_to_table(v, ',') AS value
      WHERE value IS NOT NULL AND length(trim(value)) > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION auth.current_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(current_setting('app.tenant_id', TRUE), '');
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
END;
$$;

-- The setters stay SECURITY DEFINER with their database/ddl signatures; they only call
-- pg_catalog.set_config, so the search_path is pinned to pg_catalog.
-- @security-definer-approved: platform-architects/S10-SM-05
CREATE OR REPLACE FUNCTION auth.set_tenant(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_tenant IS NULL THEN
    PERFORM set_config('app.tenant_id', '', FALSE);
  ELSE
    PERFORM set_config('app.tenant_id', p_tenant::text, FALSE);
  END IF;
END;
$$;

-- @security-definer-approved: platform-architects/S10-SM-05
CREATE OR REPLACE FUNCTION auth.set_user_context(
  p_user_id uuid,
  p_roles text[] DEFAULT NULL,
  p_lang text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    PERFORM set_config('app.actor_id', '', FALSE);
  ELSE
    PERFORM set_config('app.actor_id', p_user_id::text, FALSE);
  END IF;
  IF p_roles IS NULL THEN
    PERFORM set_config('app.roles', '', FALSE);
  ELSE
    PERFORM set_config('app.roles', array_to_string(p_roles, ','), FALSE);
  END IF;
  IF p_lang IS NULL THEN
    PERFORM set_config('app.lang', '', FALSE);
  ELSE
    PERFORM set_config('app.lang', p_lang, FALSE);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS policy helper: new policies read app.* directly
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth.create_rls_policy(
  p_schema text,
  p_table text,
  p_tenant_column text DEFAULT NULL,
  p_allow_superadmin boolean DEFAULT TRUE,
  p_policy_name text DEFAULT 'tenant_isolation'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_full text := format('%I.%I', p_schema, p_table);
  v_tenant_column text;
  v_predicate text;
BEGIN
  IF to_regclass(v_full) IS NULL THEN
    RETURN;
  END IF;

  IF p_tenant_column IS NOT NULL THEN
    v_tenant_column := p_tenant_column;
  ELSE
    SELECT c.column_name
      INTO v_tenant_column
      FROM information_schema.columns c
     WHERE c.table_schema = p_schema
       AND c.table_name = p_table
       AND c.column_name IN ('tenancy_id', 'tenant_id')
     ORDER BY CASE c.column_name WHEN 'tenancy_id' THEN 1 ELSE 2 END
     LIMIT 1;
  END IF;

  IF v_tenant_column IS NULL THEN
    RETURN;
  END IF;

  v_predicate := format(
    '%I = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid',
    v_tenant_column
  );

  IF p_allow_superadmin THEN
    v_predicate := '(' || v_predicate || ' OR ''platform:superadmin'' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting(''app.roles'', true), ''''))), ''\s*,\s*'')))';
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_full);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_full);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p_policy_name, v_full);
  EXECUTE format(
    'CREATE POLICY %I ON %s USING (%s) WITH CHECK (%s)',
    p_policy_name,
    v_full,
    v_predicate,
    v_predicate
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Audit trigger: correlation id from app.request_id
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit.fn_log_dml()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_op text := TG_OP;
  v_tenant uuid := auth.current_tenant();
  v_actor uuid := auth.current_user_id();
  v_roles text[] := auth.current_roles();
  v_entity text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_pk jsonb;
  v_entity_id text;
BEGIN
  IF v_op = 'INSERT' THEN
    v_pk := audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(NEW));
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'INSERT', v_entity, v_entity_id, to_jsonb(NEW), NULL, NULL, current_setting('app.request_id', true), NULL, to_jsonb(NEW), v_pk);
    RETURN NEW;
  ELSIF v_op = 'UPDATE' THEN
    v_pk := COALESCE(
      audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(NEW)),
      audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(OLD))
    );
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'UPDATE', v_entity, v_entity_id, to_jsonb(NEW), NULL, NULL, current_setting('app.request_id', true), to_jsonb(OLD), to_jsonb(NEW), v_pk);
    RETURN NEW;
  ELSIF v_op = 'DELETE' THEN
    v_pk := audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(OLD));
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'DELETE', v_entity, v_entity_id, '{}'::jsonb, NULL, NULL, current_setting('app.request_id', true), to_jsonb(OLD), NULL, v_pk);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS policies, recreated on app.*
-- ---------------------------------------------------------------------

SELECT auth.create_rls_policy('auth', 'tenancies', 'tenancy_id');
SELECT auth.create_rls_policy('auth', 'tenancy_members', 'tenancy_id');
SELECT auth.create_rls_policy('storage', 'files', 'tenancy_id', TRUE, 'tenant_scope');

DROP POLICY IF EXISTS membership_isolation ON auth.tenancy_members;
CREATE POLICY membership_isolation ON auth.tenancy_members
  USING (
    tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  )
  WITH CHECK (
    tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  );

DROP POLICY IF EXISTS user_roles_isolation ON auth.user_roles;
CREATE POLICY user_roles_isolation ON auth.user_roles
  USING (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_roles.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_roles.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  );

DROP POLICY IF EXISTS user_groups_isolation ON auth.user_groups;
CREATE POLICY user_groups_isolation ON auth.user_groups
  USING (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_groups.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_groups.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  );

DROP POLICY IF EXISTS users_isolation ON auth.users;
CREATE POLICY users_isolation ON auth.users
  USING (
    tenancy_id IS NULL
    OR tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.users.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  )
  WITH CHECK (
    tenancy_id IS NULL
    OR tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.users.user_id
         AND tm.tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
  );

DROP POLICY IF EXISTS tenant_scope ON audit.events;
CREATE POLICY tenant_scope ON audit.events
  USING (
    tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
    OR tenancy_id IS NULL
  )
  WITH CHECK (
    tenancy_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR 'platform:superadmin' = ANY (regexp_split_to_array(lower(btrim(COALESCE(current_setting('app.roles', true), ''))), '\s*,\s*'))
    OR tenancy_id IS NULL
  );
