-- stynx pre-seed for `devai sense-migrate-check --pre-seed database/migrations/000_migrate-check-preseed.sql`
--
-- The platform migration runner normally provisions roles + grants in steps,
-- but `sense-migrate-check` applies SQL files via raw psql against a fresh
-- database without the surrounding application-layer setup. This pre-seed
-- gives stynx_owner the cross-schema privileges the platform migrations
-- expect by the time 0011_storage.sql runs (which references tenancy.tenants
-- + auth.users via FKs, and goes through SECURITY DEFINER helpers in
-- data.create_soft_deletable_table).
--
-- Applied BEFORE any migration. Idempotent — uses DO blocks + IF NOT EXISTS
-- so re-runs against an existing test DB are safe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_owner') THEN
    CREATE ROLE stynx_owner LOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_app') THEN
    CREATE ROLE stynx_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_reader') THEN
    CREATE ROLE stynx_reader LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- Grant stynx_owner ownership of every schema the migrations reference so
-- SECURITY DEFINER helpers can access them. The platform migrations
-- normally create the schemas under stynx_owner, but sense-migrate-check
-- runs everything as the connecting user; we need the role to own + manage
-- the schemas it created.
DO $$
BEGIN
  EXECUTE format('GRANT ALL ON DATABASE %I TO stynx_owner', current_database());
END
$$;

-- The SECURITY DEFINER helpers in 0010_data_helpers.sql are reassigned
-- to OWNER stynx_owner, which means `data.create_soft_deletable_table`
-- and its callers run as stynx_owner regardless of the connecting user.
-- When 0011_storage.sql defines `storage.documents` with FK to
-- tenancy.tenants(id), stynx_owner needs REFERENCES privilege on every
-- tenant-owned table the migrations later FK to. We can't enumerate them
-- here (tables don't exist yet at pre-seed time), so we register default
-- privileges that auto-grant REFERENCES + SELECT to stynx_owner on every
-- table the connecting user creates in any schema. This works because
-- ALTER DEFAULT PRIVILEGES applies to future objects created BY the
-- target role IN the named schemas.
DO $$
DECLARE
  schema_name text;
BEGIN
  -- Make sure the schemas exist before granting default privileges on them.
  FOREACH schema_name IN ARRAY ARRAY['tenancy', 'auth', 'core', 'audit', 'data', 'storage', 'archive', 'flow', 'demo', 'sample']
  LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
    EXECUTE format('GRANT ALL ON SCHEMA %I TO stynx_owner', schema_name);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL ON TABLES TO stynx_owner',
      current_user, schema_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL ON SEQUENCES TO stynx_owner',
      current_user, schema_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO stynx_owner',
      current_user, schema_name
    );
  END LOOP;
END
$$;
