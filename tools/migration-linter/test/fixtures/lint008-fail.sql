SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.foo_bar (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);

SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme_foo.bar (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);
