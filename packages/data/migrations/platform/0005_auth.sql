CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  external_subject text UNIQUE,
  locale text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS auth.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS auth.perms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text
);

CREATE TABLE IF NOT EXISTS auth.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS auth.role_perms (
  role_id uuid NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  perm_id uuid NOT NULL REFERENCES auth.perms(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, perm_id)
);

CREATE TABLE IF NOT EXISTS auth.membership_roles (
  membership_id uuid NOT NULL REFERENCES auth.memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE IF NOT EXISTS auth.direct_perms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES auth.memberships(id) ON DELETE CASCADE,
  perm_id uuid NOT NULL REFERENCES auth.perms(id) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow'
);

CREATE TABLE IF NOT EXISTS auth.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES auth.groups(id) ON DELETE SET NULL,
  key text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS auth.group_memberships (
  group_id uuid NOT NULL REFERENCES auth.groups(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES auth.memberships(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, membership_id)
);

CREATE TABLE IF NOT EXISTS auth.group_roles (
  group_id uuid NOT NULL REFERENCES auth.groups(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, role_id)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES auth.memberships(id) ON DELETE SET NULL,
  sid text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  partition_start date := date_trunc('month', clock_timestamp())::date;
  partition_end date := (date_trunc('month', clock_timestamp()) + interval '1 month')::date;
  partition_name text := format('sessions_%s', to_char(partition_start, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS auth.%I PARTITION OF auth.sessions FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_start,
    partition_end
  );
END
$$;

CREATE TABLE IF NOT EXISTS auth.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE auth.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.direct_perms ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.direct_perms FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.groups FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.group_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.group_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.group_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_tenant_isolation ON auth.roles;
CREATE POLICY roles_tenant_isolation ON auth.roles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL);

DROP POLICY IF EXISTS memberships_tenant_isolation ON auth.memberships;
CREATE POLICY memberships_tenant_isolation ON auth.memberships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS direct_perms_membership_isolation ON auth.direct_perms;
CREATE POLICY direct_perms_membership_isolation ON auth.direct_perms
  USING (
    EXISTS (
      SELECT 1
      FROM auth.memberships membership
      WHERE membership.id = direct_perms.membership_id
        AND membership.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.memberships membership
      WHERE membership.id = direct_perms.membership_id
        AND membership.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS groups_tenant_isolation ON auth.groups;
CREATE POLICY groups_tenant_isolation ON auth.groups
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS group_memberships_isolation ON auth.group_memberships;
CREATE POLICY group_memberships_isolation ON auth.group_memberships
  USING (
    EXISTS (
      SELECT 1
      FROM auth.groups grp
      WHERE grp.id = group_memberships.group_id
        AND grp.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.groups grp
      WHERE grp.id = group_memberships.group_id
        AND grp.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS group_roles_isolation ON auth.group_roles;
CREATE POLICY group_roles_isolation ON auth.group_roles
  USING (
    EXISTS (
      SELECT 1
      FROM auth.groups grp
      WHERE grp.id = group_roles.group_id
        AND grp.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.groups grp
      WHERE grp.id = group_roles.group_id
        AND grp.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS sessions_tenant_isolation ON auth.sessions;
CREATE POLICY sessions_tenant_isolation ON auth.sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS invitations_tenant_isolation ON auth.invitations;
CREATE POLICY invitations_tenant_isolation ON auth.invitations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
