-- auth.sessions is range-partitioned by created_at, but 0005_auth.sql created
-- only the partition for the month in which it ran. Nothing created later
-- months, so every session insert failed with 23514 ("no partition of relation
-- sessions found for row") from the first month rollover after migration.
--
-- auth.ensure_sessions_partition() creates the month partition for a reference
-- time. The session mirror writer calls it before each insert, following the
-- audit.ensure_monthly_partition() precedent. It runs as the owner because the
-- RLS app role cannot create partitions. It returns early when the partition
-- already exists, so the hot path performs no DDL. It refuses months outside a
-- bounded window, so an app-role caller cannot create arbitrary tables.

-- @security-definer-approved: platform-architects/ADR-SESSIONS-0002
CREATE OR REPLACE FUNCTION auth.ensure_sessions_partition(reference_time timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
DECLARE
  current_month date := date_trunc('month', clock_timestamp())::date;
  partition_start date;
  partition_end date;
  partition_name text;
BEGIN
  IF reference_time IS NULL THEN
    RAISE EXCEPTION 'auth.sessions partition reference time is required'
      USING ERRCODE = '22004';
  END IF;

  partition_start := date_trunc('month', reference_time)::date;
  -- Sessions are created now; their mirror rows may be appended while they
  -- live. Twelve months back covers the longest session lifetime, and one month
  -- ahead covers clock skew across the rollover.
  IF partition_start < (current_month - interval '12 months')::date
     OR partition_start > (current_month + interval '1 month')::date THEN
    RAISE EXCEPTION 'auth.sessions partition month % is outside the maintained window', partition_start
      USING ERRCODE = '22023';
  END IF;

  partition_name := format('sessions_%s', to_char(partition_start, 'YYYY_MM'));
  IF to_regclass(format('auth.%I', partition_name)) IS NOT NULL THEN
    RETURN partition_name;
  END IF;

  partition_end := (partition_start + interval '1 month')::date;
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS auth.%I PARTITION OF auth.sessions FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_start,
    partition_end
  );
  RETURN partition_name;
END
$$;

REVOKE ALL ON FUNCTION auth.ensure_sessions_partition(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.ensure_sessions_partition(timestamptz) TO stynx_app, stynx_owner;

-- Existing deployments: create the current and next month now, so inserts
-- across the next rollover succeed before any writer runs.
SELECT auth.ensure_sessions_partition(clock_timestamp());
SELECT auth.ensure_sessions_partition(clock_timestamp() + interval '1 month');
