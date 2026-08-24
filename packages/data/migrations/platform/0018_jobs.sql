-- @stynx-nyx/jobs (E2 — background jobs, ADR-JOBS-0001).
-- Postgres-backed scheduler + worker runtime: recurring schedules
-- materialize into a claimable job queue polled with FOR UPDATE SKIP
-- LOCKED. No new infrastructure dependency (no Redis, no external queue).

CREATE SCHEMA IF NOT EXISTS jobs AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA jobs FROM PUBLIC;
GRANT USAGE ON SCHEMA jobs TO stynx_owner, stynx_app, stynx_reader;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'jobs' AND t.typname = 'schedule_kind'
  ) THEN
    CREATE TYPE jobs.schedule_kind AS ENUM ('cron', 'interval');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'jobs' AND t.typname = 'job_status'
  ) THEN
    CREATE TYPE jobs.job_status AS ENUM (
      'pending', 'running', 'succeeded', 'failed', 'dead_letter', 'canceled'
    );
  END IF;
END
$$;

-- @no_soft_delete: schedule definitions retire by the is_enabled/deleted-by-owner
-- transition, not by soft delete; deleting a schedule does not delete jobs it
-- already materialized.
CREATE TABLE IF NOT EXISTS jobs.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  job_type text NOT NULL CHECK (char_length(job_type) BETWEEN 1 AND 200),
  kind jobs.schedule_kind NOT NULL,
  cron_expression text,
  interval_seconds integer CHECK (interval_seconds IS NULL OR interval_seconds > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority smallint NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  backoff_base_ms integer NOT NULL DEFAULT 1000 CHECK (backoff_base_ms >= 0),
  backoff_max_ms integer NOT NULL DEFAULT 300000 CHECK (backoff_max_ms >= 0),
  backoff_multiplier numeric(6, 2) NOT NULL DEFAULT 2.0 CHECK (backoff_multiplier >= 1),
  is_enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL,
  last_enqueued_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT schedules_backoff_max_gte_base CHECK (backoff_max_ms >= backoff_base_ms),
  CONSTRAINT schedules_cron_fields CHECK (
    (kind = 'cron' AND cron_expression IS NOT NULL AND interval_seconds IS NULL)
    OR (kind = 'interval' AND interval_seconds IS NOT NULL AND cron_expression IS NULL)
  ),
  CONSTRAINT schedules_tenant_name_unique UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);

-- @no_soft_delete: jobs.jobs is the claimable execution queue; rows retire by
-- status transition (succeeded/dead_letter/canceled), not by soft delete.
CREATE TABLE IF NOT EXISTS jobs.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES jobs.schedules(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (char_length(job_type) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status jobs.job_status NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  run_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_by text,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  dead_letter_reason text,
  idempotency_key text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE jobs.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedules_tenant_isolation ON jobs.schedules;
CREATE POLICY schedules_tenant_isolation ON jobs.schedules
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS jobs_tenant_isolation ON jobs.jobs;
CREATE POLICY jobs_tenant_isolation ON jobs.jobs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_jobs_schedules_due
  ON jobs.schedules (next_run_at)
  WHERE is_enabled;

CREATE INDEX IF NOT EXISTS idx_jobs_jobs_claim
  ON jobs.jobs (run_at, priority DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_jobs_reap
  ON jobs.jobs (locked_until)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_jobs_jobs_tenant_status
  ON jobs.jobs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_jobs_schedule
  ON jobs.jobs (schedule_id)
  WHERE schedule_id IS NOT NULL;

-- One materialized job per (tenant, job_type, idempotency_key): the
-- scheduler uses this to make schedule-tick materialization safe under
-- concurrent scheduler instances, and callers of JobsService.enqueue() may
-- use it for their own dedupe (e.g. one SLA-check job per worklist item).
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_jobs_idempotency
  ON jobs.jobs (tenant_id, job_type, idempotency_key)
  NULLS NOT DISTINCT
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA jobs TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA jobs TO stynx_reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA jobs TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA jobs
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA jobs
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA jobs
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;
