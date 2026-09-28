-- Jobs 1.5: a recurring schedule may run only for a persisted technical actor.
-- Historical actorless schedules remain readable but are disabled.
ALTER TABLE jobs.schedules
  ADD COLUMN actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE jobs.schedules
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE jobs.schedules
  ADD COLUMN disabled_reason text NULL,
  ADD CONSTRAINT schedules_disabled_reason_known
  CHECK (disabled_reason IS NULL OR disabled_reason = 'invalid_schedule');

UPDATE jobs.schedules SET timezone = 'UTC' WHERE timezone IS NULL;
UPDATE jobs.schedules SET is_enabled = false WHERE actor_id IS NULL AND is_enabled;

ALTER TABLE jobs.schedules
  ADD CONSTRAINT schedules_enabled_actor_required
  CHECK (actor_id IS NOT NULL OR NOT is_enabled) NOT VALID;

ALTER TABLE jobs.schedules VALIDATE CONSTRAINT schedules_enabled_actor_required;
