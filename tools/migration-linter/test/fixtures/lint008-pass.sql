SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.customer (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);

SELECT data.create_soft_deletable_table($$
  CREATE TABLE billing.invoice (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);
