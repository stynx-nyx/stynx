import { createDbRuntimeFixture, type DbRuntimeFixture } from '../runtime/fixtures';

const tenantScopedTables = [
  { table: 'auth.tenancies', policies: ['tenant_isolation'] },
  { table: 'auth.tenancy_members', policies: ['membership_isolation', 'tenant_isolation'] },
  { table: 'auth.users', policies: ['users_isolation'] },
  { table: 'auth.user_roles', policies: ['user_roles_isolation'] },
  { table: 'auth.user_groups', policies: ['user_groups_isolation'] },
  { table: 'audit.events', policies: ['tenant_scope'] },
  { table: 'storage.files', policies: ['tenant_scope'] },
];

const expectedTenantScopedTableNames = tenantScopedTables.map((entry) => entry.table).sort();
const expectedPolicyTargets = tenantScopedTables
  .flatMap((entry) =>
    entry.policies.map((policy) => ({
      table_name: entry.table,
      policy_name: policy,
    })),
  )
  .sort((left, right) =>
    `${left.table_name}.${left.policy_name}`.localeCompare(`${right.table_name}.${right.policy_name}`),
  );

describe('db invariant: RLS policy completeness', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_inv_rls');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('keeps the current DDL tenant-scoped table set deterministic', async () => {
    const tenantScopedRelations = await fixture.client.query<{ table_name: string }>(
      `
        select distinct namespace.nspname || '.' || cls.relname as table_name
        from pg_class cls
        join pg_namespace namespace
          on namespace.oid = cls.relnamespace
        left join information_schema.columns tenant_column
          on tenant_column.table_schema = namespace.nspname
         and tenant_column.table_name = cls.relname
         and tenant_column.column_name in ('tenant_id', 'tenancy_id')
        where namespace.nspname in ('auth', 'audit', 'storage')
          and cls.relkind in ('r', 'p')
          and (
            cls.relrowsecurity
            or tenant_column.column_name is not null
            or exists (
              select 1
              from pg_policy policy
              where policy.polrelid = cls.oid
            )
          )
        order by table_name
      `,
    );

    expect(tenantScopedRelations.rows.map((row) => row.table_name)).toEqual(expectedTenantScopedTableNames);
  });

  it('enables and forces RLS on the current DDL tenant-scoped tables', async () => {
    const tableState = await fixture.client.query<{
      table_name: string;
      relrowsecurity: boolean | null;
      relforcerowsecurity: boolean | null;
      policy_names: string[];
    }>(
      `
        with expected(schema_name, table_name) as (
          values
            ('auth', 'tenancies'),
            ('auth', 'tenancy_members'),
            ('auth', 'users'),
            ('auth', 'user_roles'),
            ('auth', 'user_groups'),
            ('audit', 'events'),
            ('storage', 'files')
        )
        select
          expected.schema_name || '.' || expected.table_name as table_name,
          cls.relrowsecurity,
          cls.relforcerowsecurity,
          coalesce(
            array_agg(policy.polname::text order by policy.polname)
              filter (where policy.polname is not null),
            array[]::text[]
          ) as policy_names
        from expected
        left join pg_namespace namespace
          on namespace.nspname = expected.schema_name
        left join pg_class cls
          on cls.relnamespace = namespace.oid
         and cls.relname = expected.table_name
         and cls.relkind in ('r', 'p')
        left join pg_policy policy
          on policy.polrelid = cls.oid
        group by expected.schema_name, expected.table_name, cls.relrowsecurity, cls.relforcerowsecurity
        order by expected.schema_name, expected.table_name
      `,
    );

    expect(tableState.rows.map((row) => row.table_name).sort()).toEqual(expectedTenantScopedTableNames);

    for (const expected of tenantScopedTables) {
      const actual = tableState.rows.find((row) => row.table_name === expected.table);
      expect(actual).toMatchObject({
        table_name: expected.table,
        relrowsecurity: true,
        relforcerowsecurity: true,
        policy_names: expected.policies,
      });
    }
  });

  it('keeps the expected policy names attached to the expected targets', async () => {
    const policyState = await fixture.client.query<{
      table_name: string;
      policy_name: string;
    }>(
      `
        with expected(schema_name, table_name) as (
          values
            ('auth', 'tenancies'),
            ('auth', 'tenancy_members'),
            ('auth', 'users'),
            ('auth', 'user_roles'),
            ('auth', 'user_groups'),
            ('audit', 'events'),
            ('storage', 'files')
        )
        select
          namespace.nspname || '.' || cls.relname as table_name,
          policy.polname::text as policy_name
        from expected
        join pg_namespace namespace
          on namespace.nspname = expected.schema_name
        join pg_class cls
          on cls.relnamespace = namespace.oid
         and cls.relname = expected.table_name
        join pg_policy policy
          on policy.polrelid = cls.oid
        order by namespace.nspname, cls.relname, policy.polname
      `,
    );

    expect(policyState.rows).toEqual(expectedPolicyTargets);
  });
});
