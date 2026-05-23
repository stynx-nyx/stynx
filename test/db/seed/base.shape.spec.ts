import {
  canonicalSeedIds,
  createDbRuntimeFixture,
  type DbRuntimeFixture,
} from '../runtime/fixtures';

describe('db seed base shape', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_seed');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('loads the canonical row counts from database/seed/00-base.sql', async () => {
    const result = await fixture.client.query<{ table_name: string; row_count: string }>(
      `
        select 'auth.tenancies' as table_name, count(*)::text as row_count from auth.tenancies
        union all
        select 'auth.roles', count(*)::text from auth.roles
        union all
        select 'auth.groups', count(*)::text from auth.groups
        union all
        select 'auth.group_roles', count(*)::text from auth.group_roles
        union all
        select 'auth.users', count(*)::text from auth.users
        union all
        select 'auth.tenancy_members', count(*)::text from auth.tenancy_members
        union all
        select 'auth.user_roles', count(*)::text from auth.user_roles
        union all
        select 'auth.user_groups', count(*)::text from auth.user_groups
      `,
    );

    expect(Object.fromEntries(result.rows.map((row) => [row.table_name, row.row_count]))).toEqual({
      'auth.tenancies': '1',
      'auth.roles': '4',
      'auth.groups': '2',
      'auth.group_roles': '2',
      'auth.users': '1',
      'auth.tenancy_members': '1',
      'auth.user_roles': '2',
      'auth.user_groups': '1',
    });
  });

  it('pins the default tenancy and admin user identity', async () => {
    const result = await fixture.client.query<{
      tenancy_id: string;
      tenancy_code: string;
      user_id: string;
      username: string;
      email: string;
      display_name: string;
      status: string;
      user_tenancy_id: string;
    }>(
      `
        select
          t.tenancy_id::text,
          t.code as tenancy_code,
          u.user_id::text,
          u.username,
          u.email,
          u.display_name,
          u.status,
          u.tenancy_id::text as user_tenancy_id
        from auth.tenancies t
        join auth.users u on u.tenancy_id = t.tenancy_id
      `,
    );

    expect(result.rows).toEqual([
      {
        tenancy_id: canonicalSeedIds.tenancy,
        tenancy_code: 'core',
        user_id: canonicalSeedIds.user,
        username: 'admin@example.com',
        email: 'admin@example.com',
        display_name: 'Core Admin',
        status: 'CONFIRMED',
        user_tenancy_id: canonicalSeedIds.tenancy,
      },
    ]);
  });

  it('pins role and group mappings used by the base admin identity', async () => {
    const result = await fixture.client.query<{
      user_roles: string[];
      user_groups: string[];
      group_roles: string[];
      membership_id: string;
      default_role: string;
      created_by: string;
    }>(
      `
        select
          array(
            select r.code
            from auth.user_roles ur
            join auth.roles r on r.role_id = ur.role_id
            where ur.user_id = $1::uuid
            order by r.code
          ) as user_roles,
          array(
            select g.code
            from auth.user_groups ug
            join auth.groups g on g.group_id = ug.group_id
            where ug.user_id = $1::uuid
            order by g.code
          ) as user_groups,
          array(
            select g.code || ':' || r.code
            from auth.group_roles gr
            join auth.groups g on g.group_id = gr.group_id
            join auth.roles r on r.role_id = gr.role_id
            order by g.code, r.code
          ) as group_roles,
          tm.membership_id::text,
          tm.default_role::text,
          tm.created_by::text
        from auth.tenancy_members tm
        where tm.user_id = $1::uuid
          and tm.tenancy_id = $2::uuid
      `,
      [canonicalSeedIds.user, canonicalSeedIds.tenancy],
    );

    expect(result.rows).toEqual([
      {
        user_roles: ['platform:admin', 'platform:superadmin'],
        user_groups: ['platform-admins'],
        group_roles: ['platform-admins:platform:superadmin', 'tenant-admins:tenant:admin'],
        membership_id: canonicalSeedIds.membership,
        default_role: canonicalSeedIds.roles.tenantAdmin,
        created_by: canonicalSeedIds.user,
      },
    ]);
  });
});
