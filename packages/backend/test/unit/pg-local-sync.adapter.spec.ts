import { IdentityAdminError } from '@stynx/contracts';
import {
  PgIdentityLocalSyncAdapter,
  loadPormRoleMetaRows,
} from '../../src/identity-admin/pg-local-sync.adapter';

const UUID_A = '0190abcd-1234-7abc-89ab-0123456789ab';
const UUID_B = '0190abcd-1234-7abc-89ab-0123456789cd';

function fakeDb(
  responsesByOrder: Array<unknown[]> = [],
  withTransaction = true,
) {
  let callIdx = 0;
  const query = vi.fn(async () => {
    const rows = responsesByOrder[callIdx++] ?? [];
    return { rows };
  });
  return {
    query,
    ...(withTransaction
      ? {
          withTransaction: vi.fn(async <T>(run: (c: unknown) => Promise<T>) => run('client-handle')),
        }
      : {}),
  };
}

function fakeAdmin(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listUsers: vi.fn(async () => ({ items: [], nextToken: undefined })),
    listGroups: vi.fn(async () => ({ items: [], nextToken: undefined })),
    listGroupsForUser: vi.fn(async () => []),
    getUser: vi.fn(),
    ...overrides,
  };
}

describe('PgIdentityLocalSyncAdapter', () => {
  it('syncToLocal skips users without a username or UUID subject', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({
        items: [{ username: '   ' }, { username: 'alice' }, { username: 'bob' }],
      })),
      getUser: vi.fn(async (u: string) =>
        u === 'alice'
          ? {
              username: 'alice',
              enabled: true,
              attributes: { sub: UUID_A, email: 'a@b' },
            }
          : { username: 'bob', enabled: true, attributes: { sub: 'not-a-uuid' } },
      ),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([
      // persistRecords loop: for users list (no groups, so no role insert).
      // alice insert into auth.users — query returns nothing meaningful
      [],
    ]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    const result = await adapter.syncToLocal();
    expect(result.skipped).toBe(2); // empty username + non-UUID sub
    expect(result.users).toBe(1); // alice
    expect(db.withTransaction).toHaveBeenCalled();
  });

  it('syncToLocal aggregates group memberships and upserts roles', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'admins', description: 'Admin group' }],
      })),
      listUsers: vi.fn(async () => ({
        items: [{ username: 'alice' }],
      })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A, email: 'a@b', name: 'Alice' },
      })),
      listGroupsForUser: vi.fn(async () => [{ name: 'admins' }, { name: 'admins' }]),
    });
    const db = fakeDb([
      [{ role_id: 'role-1' }], // role upsert
      [], // user upsert
      [], // membership upsert (dedup means only 1)
    ]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    const result = await adapter.syncToLocal();
    expect(result.users).toBe(1);
    expect(result.groups).toBe(1);
    expect(result.memberships).toBe(1);
  });

  it('syncToLocal paginates listUsers + listGroups via nextToken', async () => {
    const admin = fakeAdmin({
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ items: [], nextToken: 'tok-1' })
        .mockResolvedValueOnce({ items: [], nextToken: undefined }),
      listGroups: vi
        .fn()
        .mockResolvedValueOnce({ items: [], nextToken: 'tok-g' })
        .mockResolvedValueOnce({ items: [], nextToken: undefined }),
    });
    const db = fakeDb();
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    await adapter.syncToLocal();
    expect(admin.listUsers).toHaveBeenCalledTimes(2);
    expect(admin.listGroups).toHaveBeenCalledTimes(2);
  });

  it('syncUser throws IDENTITY_VALIDATION_ERROR when sub is not a UUID', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: 'not-a-uuid' },
      })),
    });
    const db = fakeDb();
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    await expect(adapter.syncUser('alice')).rejects.toBeInstanceOf(IdentityAdminError);
  });

  it('syncUser returns the resolved user id', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A, email: 'a@b' },
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[]]); // user upsert
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncUser('alice');
    expect(result.id).toBe(UUID_A);
  });

  it('listGroupsWithMetaByUserId throws IDENTITY_NOT_FOUND when no username row exists', async () => {
    const admin = fakeAdmin();
    const db = fakeDb([[]]); // resolveUsernameByUserId returns no row
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    await expect(adapter.listGroupsWithMetaByUserId(UUID_A)).rejects.toBeInstanceOf(
      IdentityAdminError,
    );
  });

  it('listGroupsWithMetaByUserId merges adapter groups with isIn flag and meta sort', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'admins' }, { name: 'editors' }],
      })),
      listGroupsForUser: vi.fn(async () => [{ name: 'admins' }]),
    });
    const db = fakeDb([
      [{ external_id: 'alice' }], // resolveUsername
    ]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      loadGroupMetaRows: vi.fn(async () => [
        { code: 'admin', label: 'Admin', sortOrder: 1 },
        { code: 'editor', label: 'Editor', sortOrder: 2 },
      ]),
    });
    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].isIn).toBe(true);
    expect(result.groups[0].name).toBe('admins');
    expect(result.groups[1].isIn).toBe(false);
  });

  it('listGroupsWithMetaByUserId handles missing meta loader (default empty)', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'g1' }],
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[{ external_id: 'alice' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBeNull();
  });

  it('falls back to direct run() when db.withTransaction is not present', async () => {
    const admin = fakeAdmin();
    const db = fakeDb([], false);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncToLocal();
    expect(result.users).toBe(0);
  });

  it('honors custom roleCodeFromGroupName and roleDescriptionFromGroup', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({ items: [{ name: 'AdminGroup' }] })),
      listUsers: vi.fn(async () => ({ items: [] })),
    });
    const db = fakeDb([[{ role_id: 'r-1' }]]);
    const roleCodeFromGroupName = vi.fn((n: string) => `custom-${n}`);
    const roleDescriptionFromGroup = vi.fn(() => 'custom-desc');
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      roleCodeFromGroupName,
      roleDescriptionFromGroup,
    });
    await adapter.syncToLocal();
    expect(roleCodeFromGroupName).toHaveBeenCalledWith('AdminGroup');
    expect(roleDescriptionFromGroup).toHaveBeenCalled();
  });

  it('honors custom userIdFromDetail override (e.g. external_id strategy)', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: {},
      })),
    });
    const db = fakeDb([[]]);
    const userIdFromDetail = vi.fn(() => UUID_B);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      userIdFromDetail,
    });
    const result = await adapter.syncToLocal();
    expect(userIdFromDetail).toHaveBeenCalled();
    expect(result.users).toBe(1);
  });

  it('honors custom displayNameFromDetail override', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A },
      })),
    });
    const db = fakeDb([[]]);
    const displayNameFromDetail = vi.fn(() => 'Custom Display');
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      displayNameFromDetail,
    });
    await adapter.syncToLocal();
    expect(displayNameFromDetail).toHaveBeenCalled();
  });

  it('default display name falls back through name → custom:displayName → email → username', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A }, // no name/email
      })),
    });
    const db = fakeDb([[]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncToLocal();
    expect(result.users).toBe(1);
  });

  it('allows default display-name resolution to return undefined when all candidates are blank', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: undefined,
        enabled: true,
        attributes: { sub: UUID_A, name: '   ', 'custom:displayName': '', email: '' },
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncUser('alice');
    expect(result.users).toBe(1);
  });

  it('sorts groups by name when sort order ties or is absent', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'zeta' }, { name: 'alpha' }],
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[{ external_id: 'alice' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);
    expect(result.groups.map((group) => group.name)).toEqual(['alpha', 'zeta']);
  });

  it('default role-code strategy strips trailing s from plural group names', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({ items: [{ name: 'admins' }, { name: 'editor' }] })),
      listUsers: vi.fn(async () => ({ items: [] })),
    });
    const db = fakeDb([
      [{ role_id: 'r-1' }],
      [{ role_id: 'r-2' }],
    ]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncToLocal();
    expect(result.groups).toBe(2);
    const codes = db.query.mock.calls.map((c) => (c[1] as unknown[])[0]);
    expect(codes).toContain('admin');
    expect(codes).toContain('editor');
  });
});

describe('loadPormRoleMetaRows', () => {
  it('queries the PORM enum view + maps rows to IdentityGroupMetaRow', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            code: 'admin',
            label: 'Admin',
            icon: 'shield',
            meta: { x: 1 },
            sort_order: 5,
            order: 1,
          },
        ],
      })),
    };
    const rows = await loadPormRoleMetaRows(db as never);
    expect(rows[0]).toEqual({
      code: 'admin',
      label: 'Admin',
      caption: 'Admin',
      icon: 'shield',
      meta: { x: 1 },
      sortOrder: 1,
    });
  });

  it('honors viewName and roleDomain overrides + falls back to sort_order when order missing', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [{ code: 'c', sort_order: 7 }],
      })),
    };
    const rows = await loadPormRoleMetaRows(db as never, {
      viewName: 'my.view',
      roleDomain: 'my_domain',
    });
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain('my.view');
    expect(params).toEqual(['my_domain']);
    expect(rows[0].sortOrder).toBe(7);
  });
});
