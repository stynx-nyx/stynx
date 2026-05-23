-- 00-extensions.sql
-- Shared extensions required by stynx DB (derived from porm and pec baselines)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
