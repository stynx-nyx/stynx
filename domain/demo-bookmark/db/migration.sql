-- Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
-- Hand-finished in C-4 Session S3 (closes F-9 step 1/N).
-- Real fields per the blueprint (../../../docs/product/draft/blueprints/demo-bookmark.json).

CREATE SCHEMA IF NOT EXISTS demo;

-- ----------------------------------------------------------------------------
-- table demo.demo__bookmark_bookmark
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demo.demo__bookmark_bookmark (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid         NOT NULL,
  owner_id    uuid         NOT NULL,
  url         text         NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  title       varchar(256) NULL,
  notes       text         NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  deleted_at  timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS ix_bookmark_tenant_owner
  ON demo.demo__bookmark_bookmark (tenant_id, owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_bookmark_tenant_url
  ON demo.demo__bookmark_bookmark (tenant_id, url)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- table demo.demo__bookmark_bookmark_tag
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demo.demo__bookmark_bookmark_tag (
  bookmark_id uuid         NOT NULL
    REFERENCES demo.demo__bookmark_bookmark(id) ON DELETE CASCADE,
  tag         varchar(64)  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (bookmark_id, tag)
);

-- ----------------------------------------------------------------------------
-- PII map registration (notes is low-PII per blueprint, retention 1y)
-- Per stynx convention (reference/api/migrations/0001_reference.sql)
-- and INV-PRIVACY-001.
-- ----------------------------------------------------------------------------
INSERT INTO core.pii_map
  (table_schema, table_name, column_name, category, strategy,
   legal_basis, retention, notes)
VALUES
  ('demo', 'demo__bookmark_bookmark', 'notes', 'incidental_pii', 'nullify',
   'legitimate_interest', 'P1Y',
   'User-authored bookmark notes; may incidentally contain PII.')
ON CONFLICT (table_schema, table_name, column_name) DO UPDATE
  SET category    = EXCLUDED.category,
      strategy    = EXCLUDED.strategy,
      legal_basis = EXCLUDED.legal_basis,
      retention   = EXCLUDED.retention,
      notes       = EXCLUDED.notes;
