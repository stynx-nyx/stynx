-- @no_soft_delete: shared reference table for isolated LINT001 coverage
CREATE TABLE acme.customer (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL
);
