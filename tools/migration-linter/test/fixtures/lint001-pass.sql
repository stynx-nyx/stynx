-- @no_soft_delete: shared reference table for isolated LINT001 coverage
CREATE TABLE acme.customer (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL
);

ALTER TABLE acme.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE acme.customer FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_tenant_isolation ON acme.customer
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
