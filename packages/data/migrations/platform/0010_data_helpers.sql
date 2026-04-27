CREATE SCHEMA IF NOT EXISTS data AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA data FROM PUBLIC;
GRANT USAGE ON SCHEMA data TO stynx_owner;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.archive_mirror_name(schema_name text, table_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  candidate text := format('archive.%s_%s', schema_name, table_name);
  source_comment text;
BEGIN
  IF schema_name IS NULL OR table_name IS NULL OR btrim(schema_name) = '' OR btrim(table_name) = '' THEN
    RAISE EXCEPTION 'schema_name and table_name are required';
  END IF;

  IF to_regclass(candidate) IS NOT NULL THEN
    source_comment := obj_description(to_regclass(candidate), 'pg_class');
    IF source_comment IS NOT NULL
       AND source_comment <> format('stynx:archive-source=%s.%s', schema_name, table_name) THEN
      RAISE EXCEPTION 'Archive mirror % is already mapped to %', candidate, source_comment;
    END IF;
  END IF;

  RETURN candidate;
END
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.ensure_archive_mirror(live_table regclass)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  live_schema text;
  live_name text;
  live_qualified text;
  mirror_name text;
  mirror_table text;
BEGIN
  SELECT n.nspname, c.relname
    INTO live_schema, live_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = live_table;

  IF live_schema IS NULL OR live_name IS NULL THEN
    RAISE EXCEPTION 'Live table % not found', live_table;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_view
    WHERE columns_view.table_schema = live_schema
      AND columns_view.table_name = live_name
      AND columns_view.column_name = 'tenant_id'
      AND columns_view.udt_name = 'uuid'
      AND columns_view.is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Soft-deletable tables must include tenant_id uuid not null';
  END IF;

  live_qualified := format('%I.%I', live_schema, live_name);
  mirror_name := data.archive_mirror_name(live_schema, live_name);
  mirror_table := split_part(mirror_name, '.', 2);

  IF to_regclass(mirror_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %s (LIKE %s INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS)',
      mirror_name,
      live_qualified
    );
    EXECUTE format('ALTER TABLE %s ADD COLUMN archive_id bigserial PRIMARY KEY', mirror_name);
    EXECUTE format(
      'ALTER TABLE %s ADD COLUMN archived_at timestamptz NOT NULL DEFAULT clock_timestamp()',
      mirror_name
    );
    EXECUTE format('ALTER TABLE %s ADD COLUMN deleted_at timestamptz NOT NULL', mirror_name);
    EXECUTE format('ALTER TABLE %s ADD COLUMN deleted_by uuid NOT NULL', mirror_name);
    EXECUTE format('ALTER TABLE %s ADD COLUMN last_erasure_at timestamptz', mirror_name);
    EXECUTE format(
      'COMMENT ON TABLE %s IS %L',
      mirror_name,
      format('stynx:archive-source=%s.%s', live_schema, live_name)
    );
  END IF;

  EXECUTE format('ALTER TABLE %s OWNER TO stynx_owner', mirror_name);
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', live_qualified);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', live_qualified);
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', mirror_name);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', mirror_name);

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', live_qualified);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
    live_qualified
  );

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', mirror_name);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
    mirror_name
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (id)', mirror_table || '_id_idx', mirror_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (tenant_id)', mirror_table || '_tenant_id_idx', mirror_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (deleted_at DESC)', mirror_table || '_deleted_at_idx', mirror_name);

  PERFORM audit.enable_for(live_qualified::regclass);
  PERFORM audit.enable_for(mirror_name::regclass);
  RETURN mirror_name;
END
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.create_soft_deletable_table(ddl text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  schema_name text;
  table_name text;
  live_name text;
BEGIN
  schema_name := (regexp_match(ddl, 'CREATE\s+TABLE\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)'))[1];
  table_name := (regexp_match(ddl, 'CREATE\s+TABLE\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)'))[2];

  IF schema_name IS NULL OR table_name IS NULL THEN
    RAISE EXCEPTION 'Unable to parse CREATE TABLE statement';
  END IF;

  live_name := format('%I.%I', schema_name, table_name);
  IF to_regclass(live_name) IS NOT NULL THEN
    RAISE EXCEPTION 'Live table % already exists', live_name;
  END IF;

  PERFORM data.archive_mirror_name(schema_name, table_name);
  EXECUTE ddl;
  PERFORM data.ensure_archive_mirror(live_name::regclass);
END
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.alter_soft_deletable_table(live_table regclass, alter_stmt text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  live_schema text;
  live_name text;
  live_qualified text;
  mirror_name text;
  action_sql text;
  normalized_action text;
  live_stmt text;
  mirror_stmt text;
BEGIN
  SELECT n.nspname, c.relname
    INTO live_schema, live_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = live_table;

  IF live_schema IS NULL OR live_name IS NULL THEN
    RAISE EXCEPTION 'Live table % not found', live_table;
  END IF;

  live_qualified := format('%I.%I', live_schema, live_name);
  mirror_name := data.ensure_archive_mirror(live_table);
  action_sql := btrim(alter_stmt);

  IF action_sql ~* '^\s*ALTER\s+TABLE\s+' THEN
    action_sql := regexp_replace(
      action_sql,
      '^\s*ALTER\s+TABLE\s+(ONLY\s+)?((\"?[A-Za-z0-9_]+\"?\.)?\"?[A-Za-z0-9_]+\"?)\s+',
      '',
      'i'
    );
  END IF;

  normalized_action := regexp_replace(action_sql, '\s+', ' ', 'g');
  IF normalized_action !~* '^(ADD COLUMN|DROP COLUMN|ALTER COLUMN .+ TYPE)' THEN
    RAISE EXCEPTION 'Unsupported alter for soft-deletable table: %', alter_stmt;
  END IF;

  IF normalized_action ~* '^DROP COLUMN' AND action_sql !~* '@destructive' THEN
    RAISE EXCEPTION 'DROP COLUMN requires @destructive annotation';
  END IF;

  live_stmt := format('ALTER TABLE %s %s', live_qualified, action_sql);
  EXECUTE live_stmt;

  IF normalized_action ~* '(ADD CONSTRAINT|UNIQUE|REFERENCES|CHECK)' THEN
    RETURN;
  END IF;

  mirror_stmt := format('ALTER TABLE %s %s', mirror_name, action_sql);
  EXECUTE mirror_stmt;
END
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.register_softdelete_fk(
  p_parent_schema text,
  p_parent_table text,
  p_child_schema text,
  p_child_table text,
  p_fk_constraint text,
  p_behavior text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_behavior NOT IN ('hide', 'cascade', 'block') THEN
    RAISE EXCEPTION 'Invalid softdelete FK behavior: %', p_behavior;
  END IF;

  INSERT INTO core.softdelete_fk_registry (
    id,
    parent_schema,
    parent_table,
    child_schema,
    child_table,
    fk_constraint,
    behavior,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    p_parent_schema,
    p_parent_table,
    p_child_schema,
    p_child_table,
    p_fk_constraint,
    p_behavior,
    clock_timestamp()
  )
  ON CONFLICT (child_schema, child_table, fk_constraint) DO UPDATE
  SET
    parent_schema = EXCLUDED.parent_schema,
    parent_table = EXCLUDED.parent_table,
    behavior = EXCLUDED.behavior;
END
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.softdelete_fk_audit()
RETURNS TABLE (
  parent_schema text,
  parent_table text,
  child_schema text,
  child_table text,
  fk_constraint text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    parent_ns.nspname::text,
    parent_cls.relname::text,
    child_ns.nspname::text,
    child_cls.relname::text,
    constraint_item.conname::text
  FROM pg_constraint constraint_item
  JOIN pg_class child_cls ON child_cls.oid = constraint_item.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
  JOIN pg_class parent_cls ON parent_cls.oid = constraint_item.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent_cls.relnamespace
  LEFT JOIN core.softdelete_fk_registry registry
    ON registry.child_schema = child_ns.nspname
   AND registry.child_table = child_cls.relname
   AND registry.fk_constraint = constraint_item.conname
  WHERE constraint_item.contype = 'f'
    AND registry.id IS NULL
    AND to_regclass(format('archive.%s_%s', parent_ns.nspname, parent_cls.relname)) IS NOT NULL;
$$;

-- @security-definer-approved: platform-architects/STYNX-I5
CREATE OR REPLACE FUNCTION data.adopt_soft_deletable_table(
  live_table regclass,
  soft_delete_column text,
  deleted_at_column text,
  deleted_by_column text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  live_schema text;
  live_name text;
  live_qualified text;
  mirror_name text;
  live_columns text;
BEGIN
  SELECT n.nspname, c.relname
    INTO live_schema, live_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = live_table;

  IF live_schema IS NULL OR live_name IS NULL THEN
    RAISE EXCEPTION 'Live table % not found', live_table;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_view
    WHERE columns_view.table_schema = live_schema
      AND columns_view.table_name = live_name
      AND columns_view.column_name = soft_delete_column
  ) THEN
    RAISE EXCEPTION 'Soft delete column % is missing on %.%', soft_delete_column, live_schema, live_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_view
    WHERE columns_view.table_schema = live_schema
      AND columns_view.table_name = live_name
      AND columns_view.column_name = deleted_at_column
  ) THEN
    RAISE EXCEPTION 'deleted_at column % is missing on %.%', deleted_at_column, live_schema, live_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_view
    WHERE columns_view.table_schema = live_schema
      AND columns_view.table_name = live_name
      AND columns_view.column_name = deleted_by_column
  ) THEN
    RAISE EXCEPTION 'deleted_by column % is missing on %.%', deleted_by_column, live_schema, live_name;
  END IF;

  live_qualified := format('%I.%I', live_schema, live_name);
  mirror_name := data.ensure_archive_mirror(live_table);

  SELECT string_agg(format('%I', columns_view.column_name), ', ' ORDER BY columns_view.ordinal_position)
    INTO live_columns
  FROM information_schema.columns columns_view
  WHERE columns_view.table_schema = live_schema
    AND columns_view.table_name = live_name;

  EXECUTE format(
    'INSERT INTO %s (%s, deleted_at, deleted_by) SELECT %s, %I, %I FROM %s WHERE %I = true',
    mirror_name,
    live_columns,
    live_columns,
    deleted_at_column,
    deleted_by_column,
    live_qualified,
    soft_delete_column
  );

  EXECUTE format('DELETE FROM %s WHERE %I = true', live_qualified, soft_delete_column);
END
$$;

ALTER FUNCTION data.archive_mirror_name(text, text) OWNER TO stynx_owner;
ALTER FUNCTION data.ensure_archive_mirror(regclass) OWNER TO stynx_owner;
ALTER FUNCTION data.create_soft_deletable_table(text) OWNER TO stynx_owner;
ALTER FUNCTION data.alter_soft_deletable_table(regclass, text) OWNER TO stynx_owner;
ALTER FUNCTION data.register_softdelete_fk(text, text, text, text, text, text) OWNER TO stynx_owner;
ALTER FUNCTION data.softdelete_fk_audit() OWNER TO stynx_owner;
ALTER FUNCTION data.adopt_soft_deletable_table(regclass, text, text, text) OWNER TO stynx_owner;

REVOKE ALL ON FUNCTION data.archive_mirror_name(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION data.ensure_archive_mirror(regclass) FROM PUBLIC;
REVOKE ALL ON FUNCTION data.create_soft_deletable_table(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION data.alter_soft_deletable_table(regclass, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION data.register_softdelete_fk(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION data.softdelete_fk_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION data.adopt_soft_deletable_table(regclass, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION data.archive_mirror_name(text, text) TO stynx_owner;
GRANT EXECUTE ON FUNCTION data.create_soft_deletable_table(text) TO stynx_owner;
GRANT EXECUTE ON FUNCTION data.alter_soft_deletable_table(regclass, text) TO stynx_owner;
GRANT EXECUTE ON FUNCTION data.register_softdelete_fk(text, text, text, text, text, text) TO stynx_owner;
GRANT EXECUTE ON FUNCTION data.softdelete_fk_audit() TO stynx_owner;
GRANT EXECUTE ON FUNCTION data.adopt_soft_deletable_table(regclass, text, text, text) TO stynx_owner;
