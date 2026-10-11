-- ADR-DOMAIN-STORAGE-0001: forward tenant isolation for the existing demo storage.
-- Apply after the unchanged domain/demo-bookmark/db/migration.sql.
-- Fixed STYNX platform roles; no credentials or elevated application role.
BEGIN;

DO $$
DECLARE
  unsafe_role text;
BEGIN
  IF current_user <> 'stynx_owner' THEN
    RAISE EXCEPTION 'demo_bookmark_migration_requires_owner';
  END IF;
  SELECT required.name INTO unsafe_role
    FROM (VALUES ('stynx_app'), ('stynx_reader')) AS required(name)
    LEFT JOIN pg_catalog.pg_roles AS role ON role.rolname = required.name
   WHERE role.oid IS NULL OR NOT role.rolcanlogin OR role.rolsuper OR role.rolbypassrls
      OR role.rolcreaterole OR role.rolcreatedb OR role.rolreplication
      OR pg_catalog.pg_has_role(required.name, 'stynx_owner', 'MEMBER')
   LIMIT 1;
  IF unsafe_role IS NOT NULL THEN
    RAISE EXCEPTION 'demo_bookmark_unsafe_application_role: %', unsafe_role;
  END IF;
  IF pg_catalog.pg_has_role('stynx_reader', 'stynx_app', 'MEMBER') THEN
    RAISE EXCEPTION 'demo_bookmark_reader_can_assume_application_role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS elevated
     WHERE (elevated.rolsuper OR elevated.rolbypassrls
       OR elevated.rolcreaterole OR elevated.rolcreatedb OR elevated.rolreplication)
       AND (pg_catalog.pg_has_role('stynx_app', elevated.oid, 'MEMBER')
         OR pg_catalog.pg_has_role('stynx_reader', elevated.oid, 'MEMBER'))
  ) THEN
    RAISE EXCEPTION 'demo_bookmark_unsafe_application_membership';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'demo'
       AND relation.relname IN ('demo__bookmark_bookmark', 'demo__bookmark_bookmark_tag')
       AND policy.polname <> 'demo_bookmark_tenant_isolation'
  ) THEN
    RAISE EXCEPTION 'demo_bookmark_unrecognized_rls_policy';
  END IF;
END $$;

ALTER SCHEMA demo OWNER TO stynx_owner;
ALTER TABLE demo.demo__bookmark_bookmark OWNER TO stynx_owner;
ALTER TABLE demo.demo__bookmark_bookmark_tag OWNER TO stynx_owner;

REVOKE ALL ON SCHEMA demo FROM PUBLIC, stynx_app, stynx_reader;
GRANT USAGE ON SCHEMA demo TO stynx_app, stynx_reader;
REVOKE ALL ON TABLE demo.demo__bookmark_bookmark,
  demo.demo__bookmark_bookmark_tag FROM PUBLIC, stynx_app, stynx_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE demo.demo__bookmark_bookmark,
  demo.demo__bookmark_bookmark_tag TO stynx_app;
GRANT SELECT ON TABLE demo.demo__bookmark_bookmark,
  demo.demo__bookmark_bookmark_tag TO stynx_reader;

ALTER TABLE demo.demo__bookmark_bookmark ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo.demo__bookmark_bookmark FORCE ROW LEVEL SECURITY;
ALTER TABLE demo.demo__bookmark_bookmark_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo.demo__bookmark_bookmark_tag FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_bookmark_tenant_isolation ON demo.demo__bookmark_bookmark;
CREATE POLICY demo_bookmark_tenant_isolation ON demo.demo__bookmark_bookmark
  TO stynx_app, stynx_reader
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Tags retain their historical compound key and have no invented tenant column.
-- Parent visibility supplies both the tenant check and FORCE-RLS boundary.
-- Soft-deleted parent rows remain tenant history; HTTP services filter them.
DROP POLICY IF EXISTS demo_bookmark_tenant_isolation ON demo.demo__bookmark_bookmark_tag;
CREATE POLICY demo_bookmark_tenant_isolation ON demo.demo__bookmark_bookmark_tag
  TO stynx_app, stynx_reader
  USING (EXISTS (
    SELECT 1 FROM demo.demo__bookmark_bookmark AS parent
     WHERE parent.id = bookmark_id
       AND parent.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM demo.demo__bookmark_bookmark AS parent
     WHERE parent.id = bookmark_id
       AND parent.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

-- Refuse inherited or differently granted privileges that the owner cannot
-- revoke directly. This also checks column-only writes independently.
DO $$
DECLARE
  relation regclass;
  reachable record;
  maintenance_privilege text := CASE
    WHEN current_setting('server_version_num')::integer >= 170000 THEN ',MAINTAIN'
    ELSE ''
  END;
  maintenance_grant_privilege text := CASE
    WHEN current_setting('server_version_num')::integer >= 170000 THEN ',MAINTAIN WITH GRANT OPTION'
    ELSE ''
  END;
BEGIN
  IF pg_catalog.has_schema_privilege('stynx_app', 'demo', 'CREATE')
     OR pg_catalog.has_schema_privilege('stynx_reader', 'demo', 'CREATE')
     OR pg_catalog.has_schema_privilege('public', 'demo', 'USAGE,CREATE') THEN
    RAISE EXCEPTION 'demo_bookmark_unsafe_schema_privilege';
  END IF;
  FOREACH relation IN ARRAY ARRAY[
    'demo.demo__bookmark_bookmark'::regclass,
    'demo.demo__bookmark_bookmark_tag'::regclass
  ] LOOP
    IF pg_catalog.has_table_privilege('stynx_app', relation, 'TRUNCATE,REFERENCES,TRIGGER' || maintenance_privilege)
       OR pg_catalog.has_any_column_privilege('stynx_app', relation, 'REFERENCES')
       OR pg_catalog.has_table_privilege('stynx_reader', relation, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER' || maintenance_privilege)
       OR pg_catalog.has_any_column_privilege('stynx_reader', relation, 'INSERT,UPDATE,REFERENCES')
       OR pg_catalog.has_table_privilege('public', relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER' || maintenance_privilege)
       OR pg_catalog.has_any_column_privilege('public', relation, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'demo_bookmark_unsafe_table_privilege: %', relation;
    END IF;
  END LOOP;
  -- PostgreSQL 16+ SET reachability is independent of current INHERIT/USAGE.
  -- A NOINHERIT login can otherwise SET ROLE into an ordinary privileged group.
  -- Benign memberships remain permitted; inspect their effective capabilities.
  FOR reachable IN
    SELECT actor.rolname AS actor_name, target.oid AS target_oid,
      target.rolname AS target_name
      FROM pg_catalog.pg_roles AS actor
      CROSS JOIN pg_catalog.pg_roles AS target
     WHERE actor.rolname IN ('stynx_app', 'stynx_reader')
       AND pg_catalog.pg_has_role(actor.oid, target.oid, 'SET')
  LOOP
    IF pg_catalog.has_schema_privilege(reachable.target_oid, 'demo', 'CREATE,USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'demo_bookmark_unsafe_assumable_schema_privilege: % -> %', reachable.actor_name, reachable.target_name;
    END IF;
    FOREACH relation IN ARRAY ARRAY[
      'demo.demo__bookmark_bookmark'::regclass,
      'demo.demo__bookmark_bookmark_tag'::regclass
    ] LOOP
      IF pg_catalog.has_table_privilege(reachable.target_oid, relation, 'TRUNCATE,REFERENCES,TRIGGER' || maintenance_privilege)
         OR pg_catalog.has_any_column_privilege(reachable.target_oid, relation, 'REFERENCES')
         OR (reachable.actor_name = 'stynx_reader' AND (
           pg_catalog.has_table_privilege(reachable.target_oid, relation, 'INSERT,UPDATE,DELETE')
           OR pg_catalog.has_any_column_privilege(reachable.target_oid, relation, 'INSERT,UPDATE')
         )) THEN
        RAISE EXCEPTION 'demo_bookmark_unsafe_assumable_table_privilege: % -> %: %', reachable.actor_name, reachable.target_name, relation;
      END IF;
      IF pg_catalog.has_table_privilege(reachable.target_oid, relation, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION' || maintenance_grant_privilege) THEN
        RAISE EXCEPTION 'demo_bookmark_unsafe_assumable_table_grant_option: % -> %: %', reachable.actor_name, reachable.target_name, relation;
      END IF;
      IF pg_catalog.has_any_column_privilege(reachable.target_oid, relation, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'demo_bookmark_unsafe_assumable_column_grant_option: % -> %: %', reachable.actor_name, reachable.target_name, relation;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
