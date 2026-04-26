ALTER TABLE auth.memberships
  ADD COLUMN IF NOT EXISTS effective_hash text;

ALTER TABLE auth.memberships
  ADD COLUMN IF NOT EXISTS effective_hash_generation bigint NOT NULL DEFAULT 0;
