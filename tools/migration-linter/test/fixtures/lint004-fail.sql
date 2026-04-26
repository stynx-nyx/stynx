SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.parent_entity (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);

SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.child_entity (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    parent_id uuid NOT NULL REFERENCES acme.parent_entity(id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
$$);
