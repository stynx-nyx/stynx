-- 00-base.sql
-- Minimal seed for st-core: one tenancy, one admin user, and baseline roles/groups.

SELECT auth.set_user_context(NULL, ARRAY['platform:superadmin']);

INSERT INTO auth.tenancies (tenancy_id, code, name, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'core',
  'st-core Default Tenancy',
  NULL
)
ON CONFLICT (tenancy_id) DO NOTHING;

INSERT INTO auth.roles (role_id, code, name, description)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'platform:superadmin', 'Platform Super Admin', 'Full access to every tenancy'),
  ('00000000-0000-0000-0000-000000000102', 'platform:admin', 'Platform Admin', 'Administrative access to shared modules'),
  ('00000000-0000-0000-0000-000000000103', 'tenant:admin', 'Tenancy Admin', 'Manages users within the tenancy'),
  ('00000000-0000-0000-0000-000000000104', 'tenant:user', 'Standard User', 'Default user permission set')
ON CONFLICT (role_id) DO NOTHING;

INSERT INTO auth.groups (group_id, code, name, description)
VALUES
  ('00000000-0000-0000-0000-000000000201', 'platform-admins', 'Platform Administrators', 'Administrative access across tenants'),
  ('00000000-0000-0000-0000-000000000202', 'tenant-admins', 'Tenancy Administrators', 'Scoped administrators per tenancy')
ON CONFLICT (group_id) DO NOTHING;

INSERT INTO auth.group_roles (group_id, role_id)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000103')
ON CONFLICT DO NOTHING;

INSERT INTO auth.users (user_id, external_id, username, email, display_name, status, tenancy_id)
VALUES (
  '00000000-0000-0000-0000-000000001111',
  'admin@example.com',
  'admin@example.com',
  'admin@example.com',
  'Core Admin',
  'CONFIRMED',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      status = EXCLUDED.status;

INSERT INTO auth.tenancy_members (
  membership_id,
  tenancy_id,
  user_id,
  default_role,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000003001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000001111',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000001111'
)
ON CONFLICT (tenancy_id, user_id) DO UPDATE
  SET default_role = EXCLUDED.default_role;

INSERT INTO auth.user_roles (user_id, role_id, assigned_by)
VALUES
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000001111'),
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000001111')
ON CONFLICT DO NOTHING;

INSERT INTO auth.user_groups (user_id, group_id, assigned_by)
VALUES
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000001111')
ON CONFLICT DO NOTHING;

RESET ROLE;
