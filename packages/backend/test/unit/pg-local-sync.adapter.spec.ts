import { IdentityAdminError } from '@stynx-nyx/contracts';
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
    expect(db.withTransaction).toHaveBeenCalledWith(expect.any(Function), undefined);
  });

  it('describes branch: syncToLocal skips users whose subject is missing entirely', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: {},
      })),
    });
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: fakeDb() as never,
    });
    await expect(adapter.syncToLocal()).resolves.toMatchObject({ skipped: 1, users: 0 });
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
    expect(result.ok).toBe(true);
    expect(result.users).toBe(1);
    expect(result.groups).toBe(1);
    expect(result.memberships).toBe(1);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO auth.roles'),
      ['admin', 'Admin group'],
      'client-handle',
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        'a@b',
        'Alice',
        null,
        expect.stringContaining('"groups":["admins","admins"]'),
      ],
      'client-handle',
    );
    expect(db.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO auth.user_roles'),
      [UUID_A, 'role-1'],
      'client-handle',
    );
  });

  it('syncToLocal trims listed usernames before loading details', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: '  alice  ' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A },
      })),
    });
    const db = fakeDb([[]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await adapter.syncToLocal();

    expect(admin.getUser).toHaveBeenCalledWith('alice');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        null,
        'alice',
        null,
        expect.stringContaining('"username":"alice"'),
      ],
      'client-handle',
    );
  });

  it('syncToLocal trims and filters provider group names before writing membership metadata', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'admins' }],
      })),
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A },
      })),
      listGroupsForUser: vi.fn(async () => [{ name: ' admins ' }, { name: '   ' }]),
    });
    const db = fakeDb([[{ role_id: 'role-1' }], [], []]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    const result = await adapter.syncToLocal();

    expect(result.memberships).toBe(1);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        null,
        'alice',
        null,
        expect.stringContaining('"groups":["admins"]'),
      ],
      'client-handle',
    );
  });

  it('describes branch: syncToLocal persists optional status when provider supplies it', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        status: 'CONFIRMED',
        attributes: { sub: UUID_A },
      })),
    });
    const db = fakeDb([[]]);
    await new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    }).syncToLocal();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      expect.arrayContaining(['CONFIRMED']),
      'client-handle',
    );
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
    expect(admin.listUsers).toHaveBeenNthCalledWith(1, { limit: 60 });
    expect(admin.listUsers).toHaveBeenNthCalledWith(2, { limit: 60, token: 'tok-1' });
    expect(admin.listGroups).toHaveBeenNthCalledWith(1, { limit: 60 });
    expect(admin.listGroups).toHaveBeenNthCalledWith(2, { limit: 60, token: 'tok-g' });
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
    await expect(adapter.syncUser('alice')).rejects.toMatchObject({
      code: 'IDENTITY_VALIDATION_ERROR',
      message: 'Identity user is missing a valid UUID subject',
      details: { username: 'alice' },
    });
  });

  it('syncUser returns the resolved user id', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        status: 'CONFIRMED',
        attributes: { sub: UUID_A, email: 'a@b' },
      })),
      listGroupsForUser: vi.fn(async () => [{ name: ' admins ' }, { name: '   ' }]),
    });
    const db = fakeDb([[{ role_id: 'role-1' }], [], []]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    const result = await adapter.syncUser('alice');
    expect(result.id).toBe(UUID_A);
    expect(result.groups).toBe(1);
    expect(result.memberships).toBe(1);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        'a@b',
        'a@b',
        'CONFIRMED',
        expect.stringContaining('"groups":["admins"]'),
      ],
      'client-handle',
    );
  });

  it('describes branch: syncUser omits optional status and email when absent', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A },
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[]]);
    await new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    }).syncUser('alice');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        null,
        'alice',
        null,
        expect.stringContaining('"groups":[]'),
      ],
      'client-handle',
    );
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

  it('listGroupsWithMetaByUserId trims the resolved username and binds the lookup query exactly', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({ items: [] })),
      listGroupsForUser: vi.fn(async () => []),
    });
    const db = fakeDb([[{ external_id: '  alice  ' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await expect(adapter.listGroupsWithMetaByUserId(UUID_A)).resolves.toEqual({ groups: [] });
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      'SELECT external_id FROM auth.users WHERE user_id = $1',
      [UUID_A],
    );
    expect(admin.listGroupsForUser).toHaveBeenCalledWith('alice');
  });

  it('listGroupsWithMetaByUserId rejects blank resolved usernames', async () => {
    const admin = fakeAdmin();
    const db = fakeDb([[{ external_id: '   ' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await expect(adapter.listGroupsWithMetaByUserId(UUID_A)).rejects.toMatchObject({
      code: 'IDENTITY_NOT_FOUND',
      message: 'Identity user not found',
      details: { userId: UUID_A },
    });
  });

  it('listGroupsWithMetaByUserId merges adapter groups with isIn flag and meta sort', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'admins', description: 'Admin group' }, { name: 'editors' }],
      })),
      listGroupsForUser: vi.fn(async () => [{ name: ' admins ' }, { name: '   ' }]),
    });
    const db = fakeDb([
      [{ external_id: '  alice  ' }], // resolveUsername
    ]);
    const loadGroupMetaRows = vi.fn(async () => [
      {
        code: 'admin',
        label: 'Admin',
        caption: 'Administrator',
        icon: 'shield',
        meta: { rank: 1 },
        sortOrder: 1,
      },
      { code: 'editor', label: 'Editor', sortOrder: 2 },
    ]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      loadGroupMetaRows,
    });
    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);
    expect(admin.listGroupsForUser).toHaveBeenCalledWith('alice');
    expect(loadGroupMetaRows).toHaveBeenCalledWith(db);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toEqual({
      name: 'admins',
      description: 'Admin group',
      isIn: true,
      code: 'admin',
      label: 'Admin',
      caption: 'Administrator',
      icon: 'shield',
      meta: { rank: 1 },
      sortOrder: 1,
    });
    expect(result.groups[1]).toMatchObject({
      name: 'editors',
      isIn: false,
      code: 'editor',
      label: 'Editor',
      caption: 'Editor',
      icon: null,
      meta: null,
      sortOrder: 2,
    });
  });

  it('listGroupsWithMetaByUserId trims user group names before membership matching', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'admins' }, { name: 'blank' }],
      })),
      listGroupsForUser: vi.fn(async () => [{ name: ' ADMINS ' }, { name: '   ' }]),
    });
    const db = fakeDb([[{ external_id: 'alice' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);

    expect(result.groups.map((group) => ({ name: group.name, isIn: group.isIn }))).toEqual([
      { name: 'admins', isIn: true },
      { name: 'blank', isIn: false },
    ]);
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
    expect(result.groups[0].label).toBe(null);
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
    expect(roleDescriptionFromGroup).toHaveBeenCalledWith({ name: 'AdminGroup' });
  });

  it('default role descriptions normalize group names when descriptions are blank', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'power_users-team', description: '   ' }],
      })),
      listUsers: vi.fn(async () => ({ items: [] })),
    });
    const db = fakeDb([[{ role_id: 'r-1' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    await adapter.syncToLocal();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.roles'),
      ['power_users-team', 'Power Users Team'],
      'client-handle',
    );
  });

  it('default role descriptions prefer a trimmed provider description', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: 'power_users-team', description: '  Provided description  ' }],
      })),
      listUsers: vi.fn(async () => ({ items: [] })),
    });
    const db = fakeDb([[{ role_id: 'r-1' }]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await adapter.syncToLocal();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.roles'),
      ['power_users-team', 'Provided description'],
      'client-handle',
    );
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
    expect(userIdFromDetail).toHaveBeenCalledWith({
      username: 'alice',
      enabled: true,
      attributes: {},
    });
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
    expect(displayNameFromDetail).toHaveBeenCalledWith({
      username: 'alice',
      enabled: true,
      attributes: { sub: UUID_A },
      groups: [],
    });
  });

  it('passes status and email into the display-name resolver when present', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: false,
        status: 'CONFIRMED',
        attributes: { sub: UUID_A, email: 'alice@example.test' },
      })),
    });
    const db = fakeDb([[]]);
    const displayNameFromDetail = vi.fn(() => 'Resolved Name');
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
      displayNameFromDetail,
    });

    await adapter.syncToLocal();

    expect(displayNameFromDetail).toHaveBeenCalledWith({
      username: 'alice',
      enabled: false,
      status: 'CONFIRMED',
      email: 'alice@example.test',
      attributes: { sub: UUID_A, email: 'alice@example.test' },
      groups: [],
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        'alice@example.test',
        'Resolved Name',
        'CONFIRMED',
        expect.stringContaining('"enabled":false'),
      ],
      'client-handle',
    );
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
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        null,
        'alice',
        null,
        expect.stringContaining('"username":"alice"'),
      ],
      'client-handle',
    );
  });

  it('default display-name resolution trims and prioritizes name before custom display name', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: {
          sub: UUID_A,
          name: '  Alice Name  ',
          'custom:displayName': 'Custom Name',
          email: 'alice@example.test',
        },
      })),
    });
    const db = fakeDb([[]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await adapter.syncToLocal();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        'alice@example.test',
        'Alice Name',
        null,
        expect.stringContaining('"name":"  Alice Name  "'),
      ],
      'client-handle',
    );
  });

  it('default display-name resolution uses custom display name before email', async () => {
    const admin = fakeAdmin({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: {
          sub: UUID_A,
          name: '   ',
          'custom:displayName': '  Custom Name  ',
          email: 'alice@example.test',
        },
      })),
    });
    const db = fakeDb([[]]);
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });

    await adapter.syncToLocal();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth.users'),
      [
        UUID_A,
        'alice',
        'alice@example.test',
        'Custom Name',
        null,
        expect.stringContaining('"custom:displayName":"  Custom Name  "'),
      ],
      'client-handle',
    );
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

  it('sorts groups by ascending sort order before name fallback', async () => {
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
      loadGroupMetaRows: vi.fn(async () => [
        { code: 'zeta', sortOrder: 10 },
        { code: 'alpha', sortOrder: 5 },
      ]),
    });

    const result = await adapter.listGroupsWithMetaByUserId(UUID_A);

    expect(result.groups.map((group) => group.name)).toEqual(['alpha', 'zeta']);
    expect(result.groups.map((group) => group.sortOrder)).toEqual([5, 10]);
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

  it('default role-code strategy trims and lowercases group names without stripping single-letter s', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({
        items: [{ name: ' S ' }, { name: ' Reviewers ' }],
      })),
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

    await adapter.syncToLocal();

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO auth.roles'),
      ['s', 'S'],
      'client-handle',
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO auth.roles'),
      ['reviewer', 'Reviewers'],
      'client-handle',
    );
  });

  it('describes branch: missing returned role ids skip group and membership counts', async () => {
    const admin = fakeAdmin({
      listGroups: vi.fn(async () => ({ items: [{ name: 'admins' }] })),
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice' }] })),
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: UUID_A },
      })),
      listGroupsForUser: vi.fn(async () => [{ name: 'admins' }]),
    });
    const result = await new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: fakeDb([[], []]) as never,
    }).syncToLocal();
    expect(result).toMatchObject({ groups: 0, users: 1, memberships: 0 });
  });

  it('rejects UUID-looking subjects only when the full string matches', async () => {
    const admin = fakeAdmin({
      getUser: vi.fn(async () => ({
        username: 'alice',
        enabled: true,
        attributes: { sub: `${UUID_A}-suffix` },
      })),
    });
    const db = fakeDb();
    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: admin as never,
      db: db as never,
    });
    await expect(adapter.syncUser('alice')).rejects.toMatchObject({
      code: 'IDENTITY_VALIDATION_ERROR',
    });
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
    expect(db.query).toHaveBeenCalledWith(
      `SELECT code, label, icon, meta, sort_order, "order"
         FROM porm.v_enum
        WHERE domain = $1
        ORDER BY "order", code`,
      ['org_role'],
    );
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
    expect(db.query).toHaveBeenCalledWith(
      `SELECT code, label, icon, meta, sort_order, "order"
         FROM my.view
        WHERE domain = $1
        ORDER BY "order", code`,
      ['my_domain'],
    );
    expect(rows[0].sortOrder).toBe(7);
  });

  it('describes branch: loadPormRoleMetaRows accepts array results and null sort order', async () => {
    const db = {
      query: vi.fn(async () => [{ code: 'c', label: undefined, order: undefined, sort_order: undefined }]),
    };
    const rows = await loadPormRoleMetaRows(db as never);
    expect(rows[0]).toEqual({
      code: 'c',
      label: null,
      caption: null,
      icon: null,
      meta: null,
      sortOrder: null,
    });
  });
});
