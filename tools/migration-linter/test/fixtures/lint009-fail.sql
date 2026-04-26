SELECT data.create_soft_deletable_table($$
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL
  );
$$);

SELECT data.create_soft_deletable_table($$
  CREATE TABLE acme.customer (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    owner_user_id uuid NOT NULL REFERENCES auth.users(id),
    -- @softdelete_fk: hide
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
$$);
