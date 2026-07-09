-- ============================================================================
-- STYNX Reference Migration
-- Version: v1.0
-- Purpose: Canonical example exercising the full STYNX data model in one file.
-- Doubles as: the `stynx init` seed migration for new apps; the worked
--             example referenced in onboarding docs; the test fixture
--             used by @stynx-nyx/testing's integration suite.
-- ============================================================================
--
-- This migration demonstrates:
--   - Five STYNX-owned schemas (core, tenancy, auth, audit, storage) + archive
--   - Three DB roles (stynx_owner, stynx_app, stynx_reader)
--   - A domain schema `sample` with five tenant-scoped tables
--   - All three FK annotations (cascade, block, hide) in use
--   - The `data.create_soft_deletable_table(...)` helper as the authoring path
--   - RLS on live AND archive tables
--   - Audit triggers enabled on live AND archive
--   - Seed data for default roles and permissions
--
-- It does NOT demonstrate:
--   - The STYNX platform's own schemas (those are shipped by @stynx-nyx/data's
--     bootstrap migrations; this file assumes they exist)
--   - LGPD erasure functions (shipped by @stynx-nyx/privacy)
--   - Index strategies beyond the defaults (consumer apps add theirs later)
--
-- Conventions:
--   - UUIDv7 preferred for IDs (time-ordered; better for B-tree locality)
--   - citext for email columns
--   - tstzrange for effective-dating when relevant (not shown here)
--   - All timestamps timestamptz, all defaults via clock_timestamp()
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 0. Assumptions about prior state
-- ----------------------------------------------------------------------------
-- The following schemas and helpers are assumed to exist via prior
-- @stynx-nyx/* bootstrap migrations:
--
--   - Extensions: pgcrypto, citext, uuid-ossp (or pg_uuidv7 if adopted)
--   - Schemas: core, tenancy, auth, audit, storage, archive
--   - Roles:   stynx_owner (owns objects, BYPASSRLS),
--              stynx_app   (RW under RLS),
--              stynx_reader (RO under RLS)
--   - Functions:
--       data.create_soft_deletable_table(ddl text)
--       data.alter_soft_deletable_table(table regclass, alter_stmt text)
--       audit.enable_for(table regclass)
--       audit.fn_row_change()
--   - Tables (platform):
--       tenancy.tenants
--       auth.users
--       auth.memberships (with effective_hash, effective_hash_generation)
--       auth.roles, auth.perms, auth.role_perms, ...
--       core.softdelete_fk_registry, core.idempotency_keys, core.config
--
-- This migration creates only the domain layer (`sample.*`).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- SECTION 1. Domain schema
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS sample AUTHORIZATION stynx_owner;
GRANT USAGE  ON SCHEMA sample TO stynx_app, stynx_reader;

-- Default privileges so subsequently-created tables inherit the right grants:
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA sample
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA sample
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA sample
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;

-- ----------------------------------------------------------------------------
-- SECTION 2. Soft-deletable domain tables
--
-- Each call to data.create_soft_deletable_table(...) produces:
--   - The live table `sample.{name}`
--   - The archive mirror `archive.sample_{name}` with archive_id, archived_at,
--     deleted_at, deleted_by, last_erasure_at
--   - RLS + tenant-isolation policy on both
--   - Default archive indexes: (id), (tenant_id), (deleted_at DESC)
--   - audit.enable_for(live) and audit.enable_for(archive)
-- ----------------------------------------------------------------------------

-- 2.1 Record — top-level tenant-scoped aggregate root
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    title         text        NOT NULL,
    email         citext      NOT NULL,
    external_ref  text        NULL,
    status        text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','inactive')),

    owner_user_id uuid NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL,

    UNIQUE (tenant_id, email)
  );
$$);

-- 2.2 Record note — cascade child of record
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record_note (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade
    -- Rationale: a note only exists because of its parent record.

    kind          text        NOT NULL CHECK (kind IN ('primary','secondary','internal')),
    label         text        NOT NULL,
    detail        text        NOT NULL,
    detail2       text        NULL,
    region        text        NOT NULL,
    code          text        NOT NULL,
    locale        text        NOT NULL DEFAULT 'en',

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL
  );
$$);

-- 2.3 Work item — block child of record, hide child of auth.users
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block
    -- Rationale: deleting a record with active work items should fail loudly.

    created_by_user_id uuid   NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,
    -- @softdelete_fk: hide
    -- Rationale: if the creating user is archived, the work item keeps living;
    -- the audit log retains who it was. FK column is nullable per `hide` rules.

    code          text        NOT NULL,
    opened_on     date        NOT NULL,
    target_on     date        NOT NULL,
    category      text        NOT NULL DEFAULT 'GEN',
    total_units   bigint      NOT NULL DEFAULT 0 CHECK (total_units >= 0),
    status        text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','ready','done','cancelled')),

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL,

    UNIQUE (tenant_id, code)
  );
$$);

-- 2.4 Work item entry — cascade child of work item
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item_entry (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid        NOT NULL REFERENCES tenancy.tenants(id),

    work_item_id   uuid        NOT NULL REFERENCES sample.work_item(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade

    description    text        NOT NULL,
    quantity       numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit_units     bigint      NOT NULL CHECK (unit_units >= 0),
    total_units    bigint      NOT NULL GENERATED ALWAYS AS
                      ((quantity * unit_units)::bigint) STORED,

    created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by     uuid        NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by     uuid        NOT NULL
  );
$$);

-- 2.5 Work item lock — block child of work item
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item_lock (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES tenancy.tenants(id),

    work_item_id    uuid        NOT NULL REFERENCES sample.work_item(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block

    locked_at       timestamptz NOT NULL,
    amount_units    bigint      NOT NULL CHECK (amount_units > 0),
    reason          text        NOT NULL CHECK (reason IN ('manual','external','review','hold')),
    external_ref    text        NULL,

    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by      uuid        NOT NULL
  );
$$);

-- ----------------------------------------------------------------------------
-- SECTION 3. FK registry entries
--
-- For every FK to a soft-deletable parent, register the intended behavior
-- in core.softdelete_fk_registry. In normal operation this is done
-- automatically by the migration linter parsing `-- @softdelete_fk` comments.
-- We show the equivalent explicit registrations here for clarity:
-- ----------------------------------------------------------------------------

SELECT data.register_softdelete_fk('sample','record','sample','record_note',
                                   'record_note_record_id_fkey','cascade');
SELECT data.register_softdelete_fk('sample','record','sample','work_item',
                                   'work_item_record_id_fkey','block');
SELECT data.register_softdelete_fk('auth','users','sample','record',
                                   'record_owner_user_id_fkey','hide');
SELECT data.register_softdelete_fk('auth','users','sample','work_item',
                                   'work_item_created_by_user_id_fkey','hide');
SELECT data.register_softdelete_fk('sample','work_item','sample','work_item_entry',
                                   'work_item_entry_work_item_id_fkey','cascade');
SELECT data.register_softdelete_fk('sample','work_item','sample','work_item_lock',
                                   'work_item_lock_work_item_id_fkey','block');

-- ----------------------------------------------------------------------------
-- SECTION 4. Domain-specific indexes (beyond the defaults)
--
-- Live table indexes for common query patterns. Archive tables already have
-- default indexes (id, tenant_id, deleted_at) applied by the helper; add more
-- only if archive-side queries demand them.
-- ----------------------------------------------------------------------------

CREATE INDEX idx_record_tenant_status
  ON sample.record (tenant_id, status)
  WHERE status IN ('active','pending');

CREATE INDEX idx_record_note_record
  ON sample.record_note (record_id);

CREATE INDEX idx_work_item_tenant_status_target
  ON sample.work_item (tenant_id, status, target_on);

CREATE INDEX idx_work_item_record
  ON sample.work_item (record_id);

CREATE INDEX idx_work_item_entry_work_item
  ON sample.work_item_entry (work_item_id);

CREATE INDEX idx_work_item_lock_work_item
  ON sample.work_item_lock (work_item_id);

CREATE INDEX idx_work_item_lock_tenant_locked_at
  ON sample.work_item_lock (tenant_id, locked_at DESC);

-- ----------------------------------------------------------------------------
-- SECTION 5. Permissions seeded for this domain
--
-- Every route gated by @Permission needs a permission key registered.
-- Convention: `resource:action:scope`
-- ----------------------------------------------------------------------------

INSERT INTO auth.perms (key, resource, action, scope, description) VALUES
  ('record:read:*',                'record',        'read',        '*',    'Read any record in the tenant.'),
  ('record:read:own',              'record',        'read',        'own',  'Read records owned by the actor.'),
  ('record:write:*',               'record',        'write',       '*',    'Create or update records.'),
  ('record:delete:*',              'record',        'delete',      '*',    'Soft-delete records (moves to archive).'),
  ('record:hard_delete:*',         'record',        'hard_delete', '*',    'Hard-delete records without archive move. Admin only.'),
  ('record:restore:*',             'record',        'restore',     '*',    'Restore soft-deleted records from archive.'),
  ('record:read_trash:*',          'record',        'read_trash',  '*',    'List soft-deleted records in trash.'),

  ('work_item:read:*',             'work_item',     'read',        '*',    'Read any work item in the tenant.'),
  ('work_item:write:*',            'work_item',     'write',       '*',    'Create or update work items.'),
  ('work_item:activate:*',         'work_item',     'activate',    '*',    'Transition draft -> ready.'),
  ('work_item:complete:*',         'work_item',     'complete',    '*',    'Transition ready -> done.'),
  ('work_item:delete:*',           'work_item',     'delete',      '*',    'Soft-delete work items.'),
  ('work_item:hard_delete:*',      'work_item',     'hard_delete', '*',    'Hard-delete work items.'),
  ('work_item:restore:*',          'work_item',     'restore',     '*',    'Restore soft-deleted work items.'),
  ('work_item:read_trash:*',       'work_item',     'read_trash',  '*',    'List soft-deleted work items.'),

  ('work_item_lock:read:*',        'work_item_lock','read',        '*',    'Read work-item locks.'),
  ('work_item_lock:write:*',       'work_item_lock','write',       '*',    'Create or clear a work-item lock.')
ON CONFLICT (key) DO NOTHING;

-- Map domain perms onto the default tenant roles (owner / admin / member / viewer).
-- These roles are seeded by the platform bootstrap at tenant creation; here
-- we attach the sample-specific perms.

-- Owner: everything
INSERT INTO auth.role_perms (role_id, perm_key)
SELECT r.id, p.key
  FROM auth.roles r, auth.perms p
 WHERE r.key = 'owner'
   AND p.key LIKE ANY (ARRAY[
         'record:%', 'work_item:%', 'work_item_lock:%'
       ])
ON CONFLICT DO NOTHING;

-- Admin: everything except hard_delete
INSERT INTO auth.role_perms (role_id, perm_key)
SELECT r.id, p.key
  FROM auth.roles r, auth.perms p
 WHERE r.key = 'admin'
   AND (p.key LIKE ANY (ARRAY['record:%', 'work_item:%', 'work_item_lock:%']))
   AND p.action NOT IN ('hard_delete')
ON CONFLICT DO NOTHING;

-- Member: read + write, no delete/restore
INSERT INTO auth.role_perms (role_id, perm_key)
SELECT r.id, p.key
  FROM auth.roles r, auth.perms p
 WHERE r.key = 'member'
   AND p.action IN ('read', 'write', 'activate')
ON CONFLICT DO NOTHING;

-- Viewer: read only
INSERT INTO auth.role_perms (role_id, perm_key)
SELECT r.id, p.key
  FROM auth.roles r, auth.perms p
 WHERE r.key = 'viewer'
   AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- SECTION 6. PII map for LGPD
--
-- Declared inline; @stynx-nyx/privacy reads from core.pii_map at erasure time.
-- Platform bootstrap created the table; domain migration adds entries.
-- ----------------------------------------------------------------------------

INSERT INTO core.pii_map (schema_name, table_name, column_name, category, erasure_strategy, notes)
VALUES
  ('sample', 'record', 'title',        'direct_pii', 'nullify',
    'Display title may contain personal information; nullify on erasure.'),
  ('sample', 'record', 'email',        'direct_pii', 'hash_with_salt',
    'Retain hash for deduplication; source email erased.'),
  ('sample', 'record', 'external_ref', 'direct_pii', 'hash_with_salt',
    'External identifiers may encode user data.'),

  ('sample', 'record_note', 'detail',  'direct_pii', 'nullify', NULL),
  ('sample', 'record_note', 'detail2', 'direct_pii', 'nullify', NULL),
  ('sample', 'record_note', 'region',  'incidental_pii', 'nullify', NULL),
  ('sample', 'record_note', 'code',    'direct_pii', 'nullify', NULL),

  ('sample', 'work_item', 'created_by_user_id', 'subject_link', NULL,
    'Link to user; erasure handled via auth.users pipeline.'),

  ('sample', 'work_item_lock', 'external_ref', 'incidental_pii', 'nullify',
    'External references may contain third-party identifiers.')
ON CONFLICT (schema_name, table_name, column_name) DO UPDATE
  SET category         = EXCLUDED.category,
      erasure_strategy = EXCLUDED.erasure_strategy,
      notes            = EXCLUDED.notes;

-- ----------------------------------------------------------------------------
-- SECTION 7. Seed data (dev/test only — gated by flag)
--
-- A single sample tenant with one admin user for dev bootstrap. Wrapped in
-- a guard so production deployments don't seed fixtures.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_seed boolean := COALESCE(current_setting('stynx.seed_fixtures', true)::boolean, false);
  v_tid  uuid;
  v_uid  uuid;
BEGIN
  IF NOT v_seed THEN
    RAISE NOTICE 'Skipping fixture seed (stynx.seed_fixtures not enabled).';
    RETURN;
  END IF;

  INSERT INTO tenancy.tenants (id, slug, name, plan, state, region)
  VALUES (gen_random_uuid(), 'sample-demo', 'Sample Demo Tenant', 'pro', 'active', 'sa-east-1')
  RETURNING id INTO v_tid;

  INSERT INTO auth.users (id, cognito_sub, email, email_verified, locale)
  VALUES (gen_random_uuid(), 'cognito-sub-seed-0001', 'admin@sample-demo.test', true, 'pt-BR')
  RETURNING id INTO v_uid;

  INSERT INTO auth.memberships (id, tenant_id, user_id, status, joined_at)
  VALUES (gen_random_uuid(), v_tid, v_uid, 'active', clock_timestamp());

  INSERT INTO auth.membership_roles (membership_id, role_id)
  SELECT m.id, r.id
    FROM auth.memberships m, auth.roles r
   WHERE m.user_id = v_uid AND r.key = 'admin' AND (r.tenant_id = v_tid OR r.tenant_id IS NULL)
   LIMIT 1;

  RAISE NOTICE 'Seeded tenant %, admin user %', v_tid, v_uid;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 8. Post-migration verification (optional, advisory)
--
-- These queries run as a sanity check after the migration; they don't mutate
-- state but raise loudly if the invariants are violated. Wrapped in a DO
-- block so a failure aborts the transaction.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_live    text;
  v_missing int;
BEGIN
  -- I5: every soft-deletable live table has tenant_id and RLS
  FOR v_live IN
    SELECT c.relnamespace::regnamespace::text || '.' || c.relname
      FROM pg_class c
     WHERE c.relnamespace::regnamespace::text = 'sample'
       AND c.relkind = 'r'
  LOOP
    PERFORM 1
      FROM pg_attribute a
     WHERE a.attrelid = v_live::regclass
       AND a.attname  = 'tenant_id'
       AND NOT a.attisdropped;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invariant I5 violated: % missing tenant_id', v_live;
    END IF;

    PERFORM 1
      FROM pg_class c
     WHERE c.oid = v_live::regclass
       AND c.relrowsecurity AND c.relforcerowsecurity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invariant I5 violated: % missing FORCE ROW LEVEL SECURITY', v_live;
    END IF;
  END LOOP;

  -- I8: every sample.* live table has its archive mirror
  SELECT count(*) INTO v_missing
    FROM pg_class live
    LEFT JOIN pg_class arc
      ON arc.relname = 'sample_' || live.relname
     AND arc.relnamespace = 'archive'::regnamespace
   WHERE live.relnamespace = 'sample'::regnamespace
     AND live.relkind = 'r'
     AND arc.oid IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Invariant I8 violated: % sample.* live tables lack archive mirrors', v_missing;
  END IF;

  RAISE NOTICE 'Invariants I5 and I8 verified for sample.* schema.';
END $$;

COMMIT;

-- ============================================================================
-- End of reference migration.
-- To verify the result end-to-end, run:
--
--   ALTER DATABASE <db> SET stynx.seed_fixtures = on;   -- dev only
--   \i reference-migration.sql
--
-- Then exercise with the STYNX integration test harness:
--
--   pnpm --filter @stynx-nyx/testing test:reference-migration
-- ============================================================================
