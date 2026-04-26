ALTER TABLE tenancy.tenants
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE tenancy.tenants
SET state = CASE
  WHEN is_active THEN 'active'
  ELSE 'suspended'
END
WHERE state IS NULL OR state = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_state_check'
      AND conrelid = 'tenancy.tenants'::regclass
  ) THEN
    ALTER TABLE tenancy.tenants
      ADD CONSTRAINT tenants_state_check
      CHECK (state IN ('provisioning', 'active', 'suspended', 'archived', 'purged'));
  END IF;
END
$$;
