-- Keep auth.sessions writable across UTC month boundaries without relying on a
-- process restart or on schema migrations being newly applicable.

CREATE TABLE IF NOT EXISTS auth.sessions_default
  PARTITION OF auth.sessions DEFAULT;

-- @security-definer-approved: platform-architects/STYNX-SESSION-PARTITIONS
CREATE OR REPLACE FUNCTION auth.ensure_session_partitions(
  reference_time timestamptz,
  months_ahead integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth
SET timezone = 'UTC'
AS $$
DECLARE
  offset_month integer;
  partition_start timestamptz;
  partition_end timestamptz;
  partition_name text;
  partition_oid oid;
  relation_kind "char";
  attached_parent oid;
  actual_bound text;
  expected_bound text;
  default_debt boolean;
BEGIN
  IF reference_time IS NULL OR months_ahead IS NULL OR months_ahead < 0 OR months_ahead > 2 THEN
    RAISE EXCEPTION 'session partition maintenance arguments are invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('auth.sessions.partition-maintenance', 0));

  FOR offset_month IN 0..months_ahead LOOP
    partition_start := date_trunc('month', reference_time AT TIME ZONE 'UTC')
      AT TIME ZONE 'UTC' + make_interval(months => offset_month);
    partition_end := partition_start + interval '1 month';
    partition_name := format('sessions_%s', to_char(partition_start, 'YYYY_MM'));
    expected_bound := format(
      'FOR VALUES FROM (%L) TO (%L)',
      partition_start,
      partition_end
    );
    partition_oid := to_regclass(format('%I.%I', 'auth', partition_name));

    IF partition_oid IS NOT NULL THEN
      SELECT child.relkind, inherits.inhparent, pg_get_expr(child.relpartbound, child.oid)
      INTO relation_kind, attached_parent, actual_bound
      FROM pg_class AS child
      LEFT JOIN pg_inherits AS inherits ON inherits.inhrelid = child.oid
      WHERE child.oid = partition_oid;

      IF relation_kind <> 'r'
        OR attached_parent IS DISTINCT FROM 'auth.sessions'::regclass::oid
        OR actual_bound IS DISTINCT FROM expected_bound
      THEN
        RAISE EXCEPTION 'session partition relation drift: auth.%', partition_name;
      END IF;
    ELSE
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM auth.sessions_default WHERE created_at >= %L AND created_at < %L)',
        partition_start,
        partition_end
      ) INTO default_debt;
      IF default_debt THEN
        RAISE EXCEPTION 'session default partition contains rows for auth.%', partition_name;
      END IF;

      EXECUTE format(
        'CREATE TABLE auth.%I PARTITION OF auth.sessions FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        partition_start,
        partition_end
      );
    END IF;

    EXECUTE format('ALTER TABLE auth.%I ENABLE ROW LEVEL SECURITY', partition_name);
    EXECUTE format('ALTER TABLE auth.%I FORCE ROW LEVEL SECURITY', partition_name);
    EXECUTE format('DROP POLICY IF EXISTS sessions_tenant_isolation ON auth.%I', partition_name);
    EXECUTE format(
      'CREATE POLICY sessions_tenant_isolation ON auth.%I '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      partition_name
    );
    EXECUTE format('REVOKE ALL ON TABLE auth.%I FROM stynx_app, stynx_reader', partition_name);
  END LOOP;

  ALTER TABLE auth.sessions_default ENABLE ROW LEVEL SECURITY;
  ALTER TABLE auth.sessions_default FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS sessions_tenant_isolation ON auth.sessions_default;
  CREATE POLICY sessions_tenant_isolation ON auth.sessions_default
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE auth.sessions_default FROM stynx_app, stynx_reader;
END
$$;

-- @security-definer-approved: platform-architects/STYNX-SESSION-PARTITIONS
CREATE OR REPLACE FUNCTION auth.ensure_current_session_partitions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
  SELECT auth.ensure_session_partitions(clock_timestamp(), 2)
$$;

REVOKE ALL ON FUNCTION auth.ensure_session_partitions(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.ensure_current_session_partitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.ensure_current_session_partitions() TO stynx_app;

SELECT auth.ensure_current_session_partitions();
