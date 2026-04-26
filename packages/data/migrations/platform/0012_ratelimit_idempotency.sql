ALTER TABLE core.rate_limit_overrides
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'tenant';

ALTER TABLE core.idempotency_keys
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS response_headers jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'core_idempotency_keys_tenant_key_unique'
  ) THEN
    ALTER TABLE core.idempotency_keys
      ADD CONSTRAINT core_idempotency_keys_tenant_key_unique
      UNIQUE NULLS NOT DISTINCT (tenant_id, key);
  END IF;
END
$$;
