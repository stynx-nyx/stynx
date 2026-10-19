-- @no_soft_delete: reference table for isolated LINT011 coverage
CREATE TABLE acme.ledger (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
);

ALTER TABLE acme.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE acme.ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON acme.ledger
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
