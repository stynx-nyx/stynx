-- Explicit platform seed for the jobs 1.5 actor and timezone migration.
-- Load only after the platform migration graph, never through legacy root seeds.
INSERT INTO tenancy.tenants (id, slug, name)
VALUES ('01900000-0000-4000-8000-000000000001', 'jobs-platform-seed', 'Jobs platform seed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('01900000-0000-4000-8000-000000000002', 'jobs-platform-seed@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.memberships (tenant_id, user_id, is_active)
VALUES ('01900000-0000-4000-8000-000000000001', '01900000-0000-4000-8000-000000000002', true)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET is_active = true;

INSERT INTO jobs.schedules (tenant_id, name, job_type, actor_id, timezone, kind, interval_seconds, next_run_at, is_enabled)
VALUES (
  '01900000-0000-4000-8000-000000000001', 'seed-heartbeat', 'jobs.seed-heartbeat',
  '01900000-0000-4000-8000-000000000002', 'UTC', 'interval', 3600,
  clock_timestamp() + interval '1 hour', true
)
ON CONFLICT (tenant_id, name) DO UPDATE SET
  actor_id = EXCLUDED.actor_id,
  timezone = EXCLUDED.timezone,
  is_enabled = true,
  updated_at = clock_timestamp();
