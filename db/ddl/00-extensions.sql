-- 00-extensions.sql
-- Shared extensions required by st-core DB (derived from porm and pec baselines)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
