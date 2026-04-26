SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.customer (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    name text NOT NULL
  );
$$);
