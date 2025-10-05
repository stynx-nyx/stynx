-- 01-auth.sql
-- Authentication and tenancy core schema shared between PORM and PEC
-- Provides Cognito mirroring structures, RBAC primitives, and tenant context helpers.

DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA auth;
SET search_path TO auth, public;

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
  v := NULLIF(current_setting('auth.app_user_id', TRUE), '');
  IF v IS NULL THEN
    v := NULLIF(current_setting('stcore.app_user_id', TRUE), '');
  END IF;
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
  v := NULLIF(current_setting('auth.roles', TRUE), '');
  IF v IS NULL THEN
    v := NULLIF(current_setting('stcore.roles', TRUE), '');
  END IF;
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

CREATE OR REPLACE FUNCTION auth.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(auth.current_roles()) r WHERE r = lower($1)
  )
$$;

CREATE OR REPLACE FUNCTION auth.current_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(current_setting('auth.current_tenant', TRUE), '');
  IF v IS NULL THEN
    v := NULLIF(current_setting('stcore.current_tenant', TRUE), '');
  END IF;
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION auth.set_tenant(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_tenant IS NULL THEN
    PERFORM set_config('auth.current_tenant', '', FALSE);
  ELSE
    PERFORM set_config('auth.current_tenant', p_tenant::text, FALSE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION auth.set_user_context(
  p_user_id uuid,
  p_roles text[] DEFAULT NULL,
  p_lang text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    PERFORM set_config('auth.app_user_id', '', FALSE);
  ELSE
    PERFORM set_config('auth.app_user_id', p_user_id::text, FALSE);
  END IF;
  IF p_roles IS NULL THEN
    PERFORM set_config('auth.roles', '', FALSE);
  ELSE
    PERFORM set_config('auth.roles', array_to_string(p_roles, ','), FALSE);
  END IF;
  IF p_lang IS NULL THEN
    PERFORM set_config('auth.lang', '', FALSE);
  ELSE
    PERFORM set_config('auth.lang', p_lang, FALSE);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Common triggers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auth.apply_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := auth.current_tenant();
BEGIN
  IF NEW.tenancy_id IS NULL THEN
    NEW.tenancy_id := v_tenant;
  END IF;
  IF v_tenant IS NOT NULL AND NEW.tenancy_id IS DISTINCT FROM v_tenant AND NOT auth.has_role('platform:superadmin') THEN
    RAISE EXCEPTION 'Tenant mismatch. expected=%, provided=%', v_tenant, NEW.tenancy_id USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Tenancies & membership
-- ---------------------------------------------------------------------

CREATE TABLE auth.tenancies (
  tenancy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT TRUE,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER trig_tenancies_touch
BEFORE UPDATE ON auth.tenancies
FOR EACH ROW EXECUTE FUNCTION auth.touch_updated_at();

CREATE TABLE auth.users (
  user_id uuid PRIMARY KEY,
  external_id text UNIQUE,
  username text UNIQUE,
  email text,
  display_name text,
  given_name text,
  family_name text,
  status text,
  tenancy_id uuid REFERENCES auth.tenancies(tenancy_id),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER trig_users_touch
BEFORE UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION auth.touch_updated_at();

CREATE TABLE auth.groups (
  group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.roles (
  role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trig_roles_touch
BEFORE UPDATE ON auth.roles
FOR EACH ROW EXECUTE FUNCTION auth.touch_updated_at();

CREATE TABLE auth.group_roles (
  group_id uuid NOT NULL REFERENCES auth.groups(group_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth.roles(role_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, role_id)
);

CREATE TABLE auth.user_groups (
  user_id uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES auth.groups(group_id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE auth.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth.roles(role_id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE auth.tenancy_members (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id uuid NOT NULL REFERENCES auth.tenancies(tenancy_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
  default_role uuid REFERENCES auth.roles(role_id),
  invitation_status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenancy_id, user_id)
);

CREATE TRIGGER trig_members_touch
BEFORE UPDATE ON auth.tenancy_members
FOR EACH ROW EXECUTE FUNCTION auth.touch_updated_at();

CREATE TRIGGER trig_members_enforce_tenant
BEFORE INSERT ON auth.tenancy_members
FOR EACH ROW EXECUTE FUNCTION auth.apply_tenant();

-- ---------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------

ALTER TABLE auth.tenancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.tenancies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON auth.tenancies;
CREATE POLICY tenant_isolation ON auth.tenancies
  USING (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  );

ALTER TABLE auth.tenancy_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.tenancy_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_isolation ON auth.tenancy_members;
CREATE POLICY membership_isolation ON auth.tenancy_members
  USING (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  );

ALTER TABLE auth.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_isolation ON auth.user_roles;
CREATE POLICY user_roles_isolation ON auth.user_roles
  USING (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_roles.user_id
         AND tm.tenancy_id = auth.current_tenant()
    )
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_roles.user_id
         AND tm.tenancy_id = auth.current_tenant()
    )
    OR auth.has_role('platform:superadmin')
  );

ALTER TABLE auth.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.user_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_groups_isolation ON auth.user_groups;
CREATE POLICY user_groups_isolation ON auth.user_groups
  USING (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_groups.user_id
         AND tm.tenancy_id = auth.current_tenant()
    )
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.user_groups.user_id
         AND tm.tenancy_id = auth.current_tenant()
    )
    OR auth.has_role('platform:superadmin')
  );

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON auth.users;
CREATE POLICY users_isolation ON auth.users
  USING (
    tenancy_id IS NULL
    OR tenancy_id = auth.current_tenant()
    OR EXISTS (
      SELECT 1 FROM auth.tenancy_members tm
       WHERE tm.user_id = auth.users.user_id
         AND tm.tenancy_id = auth.current_tenant()
    )
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    tenancy_id IS NULL
    OR tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  );

CREATE TRIGGER trig_users_enforce_tenant
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION auth.apply_tenant();

RESET search_path;
