-- auth.sessions monthly partition retention (ADR-SESSIONS-0003, Owner decision
-- 2026-10-04): a month partition is retained until 90 days after the month ends,
-- matching audit's standard_90d class, and is then dropped. Session rows are
-- personal data (user, tenant, sid), and their audit trail lives in audit.log
-- under audit retention, so expired months are dropped rather than archived.
--
-- The sweep is operator-triggered through PrivacyService.applyRetention(),
-- which runs as stynx_owner and is a dry run by default. The cutoff is computed
-- here from the database clock, never supplied by the caller, and only
-- partitions named sessions_YYYY_MM are considered. The current and next month
-- can never qualify, because their month ends in the future.

CREATE OR REPLACE FUNCTION auth.sessions_partition_expired(partition_start date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT (partition_start + interval '1 month' + interval '90 days') <= clock_timestamp();
$$;

REVOKE ALL ON FUNCTION auth.sessions_partition_expired(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.sessions_partition_expired(date) TO stynx_app, stynx_owner;

-- The ensure function now refuses a month that retention would drop, so a late
-- mirror append can never resurrect an expired partition. The forward bound is
-- unchanged.
-- @security-definer-approved: platform-architects/ADR-SESSIONS-0003
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
  IF auth.sessions_partition_expired(partition_start)
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

-- @destructive: approved-by=ADR-SESSIONS-0003
CREATE OR REPLACE FUNCTION auth.drop_expired_sessions_partitions(dry_run boolean DEFAULT true)
RETURNS TABLE (partition_name text, month_end date, dropped boolean)
LANGUAGE plpgsql
SET search_path = pg_catalog, auth
AS $$
DECLARE
  candidate record;
BEGIN
  IF dry_run IS NULL THEN
    RAISE EXCEPTION 'auth.sessions retention dry_run flag is required'
      USING ERRCODE = '22004';
  END IF;

  FOR candidate IN
    SELECT c.relname AS name,
           to_date(substring(c.relname from '^sessions_([0-9]{4}_[0-9]{2})$'), 'YYYY_MM') AS month_start
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE i.inhparent = 'auth.sessions'::regclass
      AND n.nspname = 'auth'
      AND c.relname ~ '^sessions_[0-9]{4}_[0-9]{2}$'
    ORDER BY c.relname
  LOOP
    IF NOT auth.sessions_partition_expired(candidate.month_start) THEN
      CONTINUE;
    END IF;
    partition_name := format('auth.%I', candidate.name);
    month_end := (candidate.month_start + interval '1 month')::date;
    dropped := NOT dry_run;
    IF NOT dry_run THEN
      EXECUTE format('DROP TABLE auth.%I', candidate.name);
    END IF;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION auth.drop_expired_sessions_partitions(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.drop_expired_sessions_partitions(boolean) TO stynx_owner;
