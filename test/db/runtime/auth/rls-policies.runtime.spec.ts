import { createDbRuntimeFixture, type DbRuntimeFixture } from '../fixtures';

const tenantA = '00000000-0000-0000-0000-00000000a001';
const tenantB = '00000000-0000-0000-0000-00000000b001';
const userA = '00000000-0000-0000-0000-00000000a101';
const userB = '00000000-0000-0000-0000-00000000b101';
const membershipA = '00000000-0000-0000-0000-00000000a301';
const membershipB = '00000000-0000-0000-0000-00000000b301';
const tenantUserRole = '00000000-0000-0000-0000-000000000104';
const tenantAdminRole = '00000000-0000-0000-0000-000000000103';
const platformAdminsGroup = '00000000-0000-0000-0000-000000000201';
const tenantAdminsGroup = '00000000-0000-0000-0000-000000000202';

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

describe('auth runtime RLS policies', () => {
  let fixture: DbRuntimeFixture;
  let runtimeRole: string;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_auth_rls');
    runtimeRole = `stynx_rls_${fixture.database.database.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    await fixture.client.query(`CREATE ROLE ${quoteIdentifier(runtimeRole)} NOLOGIN NOBYPASSRLS`);
    await fixture.client.query(`GRANT USAGE ON SCHEMA auth TO ${quoteIdentifier(runtimeRole)}`);
    await fixture.client.query(
      `
        GRANT EXECUTE ON FUNCTION
          auth.set_tenant(uuid),
          auth.set_user_context(uuid, text[], text),
          auth.current_tenant(),
          auth.current_user_id(),
          auth.current_roles(),
          auth.has_role(text)
        TO ${quoteIdentifier(runtimeRole)}
      `,
    );
    await fixture.client.query(
      `
        GRANT SELECT, INSERT, UPDATE ON
          auth.tenancies,
          auth.users,
          auth.tenancy_members,
          auth.user_roles,
          auth.user_groups
        TO ${quoteIdentifier(runtimeRole)}
      `,
    );
    await fixture.client.query(
      `
        GRANT SELECT ON
          auth.roles,
          auth.groups,
          auth.group_roles
        TO ${quoteIdentifier(runtimeRole)}
      `,
    );

    await seedTenantFixtures();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.client.query('RESET ROLE').catch(() => undefined);
      if (runtimeRole) {
        await fixture.client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`).catch(() => undefined);
      }
      await fixture.dispose();
    }
  });

  async function seedTenantFixtures(): Promise<void> {
    await fixture.client.query('SELECT auth.set_tenant(NULL)');
    await fixture.client.query("SELECT auth.set_user_context(NULL, ARRAY['platform:superadmin'])");
    await fixture.client.query(
      `
        INSERT INTO auth.tenancies (tenancy_id, code, name)
        VALUES
          ($1::uuid, 'tenant-a', 'Tenant A'),
          ($2::uuid, 'tenant-b', 'Tenant B')
        ON CONFLICT (tenancy_id) DO NOTHING
      `,
      [tenantA, tenantB],
    );
    await fixture.client.query(
      `
        INSERT INTO auth.users (user_id, external_id, username, email, display_name, status, tenancy_id)
        VALUES
          ($1::uuid, 'tenant-a-user', 'tenant-a-user', 'tenant-a@example.com', 'Tenant A User', 'CONFIRMED', $2::uuid),
          ($3::uuid, 'tenant-b-user', 'tenant-b-user', 'tenant-b@example.com', 'Tenant B User', 'CONFIRMED', $4::uuid)
        ON CONFLICT (user_id) DO UPDATE
          SET display_name = EXCLUDED.display_name,
              tenancy_id = EXCLUDED.tenancy_id
      `,
      [userA, tenantA, userB, tenantB],
    );
    await fixture.client.query(
      `
        INSERT INTO auth.tenancy_members (membership_id, tenancy_id, user_id, default_role, created_by)
        VALUES
          ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $3::uuid),
          ($5::uuid, $6::uuid, $7::uuid, $8::uuid, $7::uuid)
        ON CONFLICT (tenancy_id, user_id) DO UPDATE
          SET default_role = EXCLUDED.default_role
      `,
      [membershipA, tenantA, userA, tenantUserRole, membershipB, tenantB, userB, tenantAdminRole],
    );
    await fixture.client.query(
      `
        INSERT INTO auth.user_roles (user_id, role_id, assigned_by)
        VALUES
          ($1::uuid, $2::uuid, $1::uuid),
          ($3::uuid, $4::uuid, $3::uuid)
        ON CONFLICT DO NOTHING
      `,
      [userA, tenantUserRole, userB, tenantAdminRole],
    );
    await fixture.client.query(
      `
        INSERT INTO auth.user_groups (user_id, group_id, assigned_by)
        VALUES
          ($1::uuid, $2::uuid, $1::uuid),
          ($3::uuid, $4::uuid, $3::uuid)
        ON CONFLICT DO NOTHING
      `,
      [userA, tenantAdminsGroup, userB, platformAdminsGroup],
    );
  }

  async function withRuntimeContext<T>(
    tenantId: string,
    userId: string,
    roles: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    await fixture.client.query('RESET ROLE');
    await fixture.client.query(`SET ROLE ${quoteIdentifier(runtimeRole)}`);
    await fixture.client.query('SET row_security = on');
    await fixture.client.query('SELECT auth.set_tenant($1::uuid)', [tenantId]);
    await fixture.client.query('SELECT auth.set_user_context($1::uuid, $2::text[], $3::text)', [
      userId,
      roles,
      'en',
    ]);

    try {
      return await action();
    } finally {
      await fixture.client.query('RESET ROLE');
      await fixture.client.query('RESET row_security');
      await fixture.client.query('SELECT auth.set_tenant(NULL)');
      await fixture.client.query('SELECT auth.set_user_context(NULL, NULL, NULL)');
    }
  }

  it('filters auth.tenancies through the tenant_isolation policy', async () => {
    const visibleToTenantA = await withRuntimeContext(tenantA, userA, ['tenant:user'], async () =>
      fixture.client.query<{ tenancy_id: string; code: string }>(
        `
          SELECT tenancy_id::text, code
          FROM auth.tenancies
          WHERE tenancy_id IN ($1::uuid, $2::uuid)
          ORDER BY code
        `,
        [tenantA, tenantB],
      ),
    );
    const visibleToTenantB = await withRuntimeContext(tenantB, userB, ['tenant:user'], async () =>
      fixture.client.query<{ tenancy_id: string; code: string }>(
        `
          SELECT tenancy_id::text, code
          FROM auth.tenancies
          WHERE tenancy_id IN ($1::uuid, $2::uuid)
          ORDER BY code
        `,
        [tenantA, tenantB],
      ),
    );

    expect(visibleToTenantA.rows).toEqual([{ tenancy_id: tenantA, code: 'tenant-a' }]);
    expect(visibleToTenantB.rows).toEqual([{ tenancy_id: tenantB, code: 'tenant-b' }]);
  });

  it('rejects cross-tenant tenancy inserts through tenant_isolation WITH CHECK', async () => {
    await expect(
      withRuntimeContext(tenantA, userA, ['tenant:user'], async () =>
        fixture.client.query(
          `
            INSERT INTO auth.tenancies (tenancy_id, code, name)
            VALUES ($1::uuid, 'tenant-b-shadow', 'Tenant B Shadow')
          `,
          [tenantB],
        ),
      ),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('filters auth.tenancy_members through tenant_isolation and membership_isolation', async () => {
    const visibleToTenantA = await withRuntimeContext(tenantA, userA, ['tenant:user'], async () =>
      fixture.client.query<{ membership_id: string; tenancy_id: string; user_id: string }>(
        `
          SELECT membership_id::text, tenancy_id::text, user_id::text
          FROM auth.tenancy_members
          WHERE membership_id IN ($1::uuid, $2::uuid)
          ORDER BY membership_id
        `,
        [membershipA, membershipB],
      ),
    );
    const visibleToTenantB = await withRuntimeContext(tenantB, userB, ['tenant:user'], async () =>
      fixture.client.query<{ membership_id: string; tenancy_id: string; user_id: string }>(
        `
          SELECT membership_id::text, tenancy_id::text, user_id::text
          FROM auth.tenancy_members
          WHERE membership_id IN ($1::uuid, $2::uuid)
          ORDER BY membership_id
        `,
        [membershipA, membershipB],
      ),
    );

    expect(visibleToTenantA.rows).toEqual([
      { membership_id: membershipA, tenancy_id: tenantA, user_id: userA },
    ]);
    expect(visibleToTenantB.rows).toEqual([
      { membership_id: membershipB, tenancy_id: tenantB, user_id: userB },
    ]);
  });

  it('filters auth.users through users_isolation and hides cross-tenant updates', async () => {
    const visibleToTenantA = await withRuntimeContext(tenantA, userA, ['tenant:user'], async () => {
      const users = await fixture.client.query<{ user_id: string; display_name: string }>(
        `
          SELECT user_id::text, display_name
          FROM auth.users
          WHERE user_id IN ($1::uuid, $2::uuid)
          ORDER BY user_id
        `,
        [userA, userB],
      );
      const update = await fixture.client.query(
        `
          UPDATE auth.users
          SET display_name = 'Invisible Tenant B Update'
          WHERE user_id = $1::uuid
        `,
        [userB],
      );

      return { users: users.rows, updatedRows: update.rowCount };
    });
    const tenantBUser = await withRuntimeContext(tenantB, userB, ['tenant:user'], async () =>
      fixture.client.query<{ user_id: string; display_name: string }>(
        `
          SELECT user_id::text, display_name
          FROM auth.users
          WHERE user_id = $1::uuid
        `,
        [userB],
      ),
    );

    expect(visibleToTenantA).toEqual({
      users: [{ user_id: userA, display_name: 'Tenant A User' }],
      updatedRows: 0,
    });
    expect(tenantBUser.rows).toEqual([{ user_id: userB, display_name: 'Tenant B User' }]);
  });

  it('filters auth.user_roles through user_roles_isolation', async () => {
    const visibleToTenantA = await withRuntimeContext(tenantA, userA, ['tenant:user'], async () =>
      fixture.client.query<{ user_id: string; role_code: string }>(
        `
          SELECT ur.user_id::text, r.code AS role_code
          FROM auth.user_roles ur
          JOIN auth.roles r ON r.role_id = ur.role_id
          WHERE ur.user_id IN ($1::uuid, $2::uuid)
          ORDER BY ur.user_id, r.code
        `,
        [userA, userB],
      ),
    );
    const visibleToTenantB = await withRuntimeContext(tenantB, userB, ['tenant:user'], async () =>
      fixture.client.query<{ user_id: string; role_code: string }>(
        `
          SELECT ur.user_id::text, r.code AS role_code
          FROM auth.user_roles ur
          JOIN auth.roles r ON r.role_id = ur.role_id
          WHERE ur.user_id IN ($1::uuid, $2::uuid)
          ORDER BY ur.user_id, r.code
        `,
        [userA, userB],
      ),
    );

    expect(visibleToTenantA.rows).toEqual([{ user_id: userA, role_code: 'tenant:user' }]);
    expect(visibleToTenantB.rows).toEqual([{ user_id: userB, role_code: 'tenant:admin' }]);
  });

  it('filters auth.user_groups through user_groups_isolation', async () => {
    const visibleToTenantA = await withRuntimeContext(tenantA, userA, ['tenant:user'], async () =>
      fixture.client.query<{ user_id: string; group_code: string }>(
        `
          SELECT ug.user_id::text, g.code AS group_code
          FROM auth.user_groups ug
          JOIN auth.groups g ON g.group_id = ug.group_id
          WHERE ug.user_id IN ($1::uuid, $2::uuid)
          ORDER BY ug.user_id, g.code
        `,
        [userA, userB],
      ),
    );
    const visibleToTenantB = await withRuntimeContext(tenantB, userB, ['tenant:user'], async () =>
      fixture.client.query<{ user_id: string; group_code: string }>(
        `
          SELECT ug.user_id::text, g.code AS group_code
          FROM auth.user_groups ug
          JOIN auth.groups g ON g.group_id = ug.group_id
          WHERE ug.user_id IN ($1::uuid, $2::uuid)
          ORDER BY ug.user_id, g.code
        `,
        [userA, userB],
      ),
    );

    expect(visibleToTenantA.rows).toEqual([{ user_id: userA, group_code: 'tenant-admins' }]);
    expect(visibleToTenantB.rows).toEqual([{ user_id: userB, group_code: 'platform-admins' }]);
  });

  it('honors auth.set_user_context roles when platform:superadmin is present', async () => {
    const visibleToSuperadmin = await withRuntimeContext(tenantA, userA, ['platform:superadmin'], async () =>
      fixture.client.query<{ tenancy_id: string; code: string }>(
        `
          SELECT tenancy_id::text, code
          FROM auth.tenancies
          WHERE tenancy_id IN ($1::uuid, $2::uuid)
          ORDER BY code
        `,
        [tenantA, tenantB],
      ),
    );

    expect(visibleToSuperadmin.rows).toEqual([
      { tenancy_id: tenantA, code: 'tenant-a' },
      { tenancy_id: tenantB, code: 'tenant-b' },
    ]);
  });
});
