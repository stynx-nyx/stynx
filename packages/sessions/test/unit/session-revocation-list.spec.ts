import { generateKeyPairSync } from 'node:crypto';
import { InMemorySessionStore } from '../../src/in-memory-session-store.js';
import { SessionJwtSigningService } from '../../src/jwt-signing.service.js';
import { SessionRevocationList } from '../../src/session-revocation-list.js';
import { SessionService } from '../../src/session.service.js';
import {
  resolveSessionsOptions,
  type SessionClaimsResolver,
  type SessionMirror,
  type SessionStore,
  type StynxSessionsModuleOptions,
} from '../../src/types.js';

// INV-RBAC-001 / S-12 (SM-14): authorization claims are minted into the token and
// revocation is an in-memory list refreshed off the request path.

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keySet = {
  currentKid: 'revocation-key',
  keys: [
    {
      kid: 'revocation-key',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
  ],
};

function options(overrides: Partial<StynxSessionsModuleOptions> = {}) {
  return resolveSessionsOptions({
    issuer: 'https://sessions.revocation.test',
    redis: { url: 'redis://unused.invalid:6379' },
    jwt: { keySet },
    timeouts: { accessSeconds: 300 },
    ...overrides,
  });
}

const mirror: SessionMirror = { append: async () => undefined };

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

function service(
  resolved = options(),
  resolver?: SessionClaimsResolver,
  store: SessionStore = new InMemorySessionStore(),
) {
  const revocations = new SessionRevocationList(resolved, store);
  const sessions = new SessionService(
    resolved,
    store,
    new SessionJwtSigningService(resolved),
    mirror,
    revocations,
    resolver,
  );
  return { sessions, revocations, store };
}

describe('SessionRevocationList', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a revoked sid for the access-token TTL plus skew, then forgets it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    const list = new SessionRevocationList(options());
    list.add('sid-1');
    expect(list.isRevoked('sid-1')).toBe(true);
    expect(list.isRevoked('sid-2')).toBe(false);
    expect(list.size()).toBe(1);

    vi.setSystemTime(new Date('2026-10-19T12:05:59.000Z'));
    expect(list.isRevoked('sid-1')).toBe(true);
    vi.setSystemTime(new Date('2026-10-19T12:06:00.001Z'));
    expect(list.isRevoked('sid-1')).toBe(false);
    expect(list.size()).toBe(0);
  });

  it('is never stale without a store, and stale with a listing store until a refresh succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    expect(new SessionRevocationList(options()).isStale()).toBe(false);
    expect(new SessionRevocationList().isStale()).toBe(false);

    const listRevokedSessions = vi.fn(async (since: string) => {
      expect(since).toBe('2026-10-19T11:54:00.000Z');
      return [{ sid: 'remote-sid', revokedAt: '2026-10-19T11:59:00.000Z' }];
    });
    const list = new SessionRevocationList(
      options({ revocation: { maxStalenessMs: 10_000 } }),
      { listRevokedSessions } as unknown as SessionStore,
    );
    expect(list.isStale()).toBe(true);
    expect(list.isRevoked('remote-sid')).toBe(false);

    await list.refresh();
    expect(list.isStale()).toBe(false);
    expect(list.isRevoked('remote-sid')).toBe(true);

    vi.setSystemTime(new Date('2026-10-19T12:00:10.001Z'));
    expect(list.isStale()).toBe(true);

    listRevokedSessions.mockRejectedValueOnce(new Error('redis down'));
    await expect(list.refresh()).rejects.toThrow('redis down');
    expect(list.isStale()).toBe(true);
    expect(list.isRevoked('remote-sid')).toBe(true);
  });

  it('refreshes once at bootstrap and then on an unref timer, coalescing overlapping refreshes', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const listRevokedSessions = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          release = () => resolve([]);
        }),
    );
    const list = new SessionRevocationList(
      options({ revocation: { refreshIntervalMs: 500 } }),
      { listRevokedSessions } as unknown as SessionStore,
    );
    const first = list.refresh();
    const second = list.refresh();
    expect(listRevokedSessions).toHaveBeenCalledTimes(1);
    release!();
    await Promise.all([first, second]);

    listRevokedSessions.mockImplementation(async () => []);
    await list.onApplicationBootstrap();
    expect(listRevokedSessions).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listRevokedSessions).toHaveBeenCalledTimes(4);
    list.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listRevokedSessions).toHaveBeenCalledTimes(4);
  });

  it('starts stale but does not throw when the first bootstrap refresh fails', async () => {
    const list = new SessionRevocationList(options(), {
      listRevokedSessions: vi.fn(async () => {
        throw new Error('not connected');
      }),
    } as unknown as SessionStore);
    await expect(list.onApplicationBootstrap()).resolves.toBe(undefined);
    expect(list.isStale()).toBe(true);
    list.onModuleDestroy();
  });

  it('keeps the latest expiry per sid, tolerates unparseable instants and skips malformed store rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    const list = new SessionRevocationList(options(), {
      listRevokedSessions: async () => [
        { sid: '', revokedAt: '2026-10-19T12:00:00.000Z' },
        null,
        { sid: 'store-sid', revokedAt: '2026-10-19T11:59:00.000Z' },
      ],
    } as unknown as SessionStore);
    list.add('sid-1', '2026-10-19T12:00:00.000Z');
    list.add('sid-1', '2026-10-19T11:00:00.000Z');
    list.add('sid-garbage', 'not-an-instant');
    await list.refresh();
    expect(list.size()).toBe(3);

    vi.setSystemTime(new Date('2026-10-19T12:05:30.000Z'));
    expect(list.size()).toBe(2);
    expect(list.isRevoked('store-sid')).toBe(false);
    vi.setSystemTime(new Date('2026-10-19T12:06:00.001Z'));
    expect(list.size()).toBe(0);
  });

  it('uses defaults without options and does nothing at bootstrap without a listing store', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    const bare = new SessionRevocationList();
    bare.add('sid-1');
    vi.setSystemTime(new Date('2026-10-19T12:10:59.000Z'));
    expect(bare.isRevoked('sid-1')).toBe(true);
    await bare.refresh();
    await expect(bare.onApplicationBootstrap()).resolves.toBe(undefined);
    expect(vi.getTimerCount()).toBe(0);

    const { revocation: _omitted, ...handBuilt } = options();
    const listRevokedSessions = vi.fn(async () => []);
    const defaults = new SessionRevocationList(handBuilt, {
      listRevokedSessions,
    } as unknown as SessionStore);
    await defaults.onApplicationBootstrap();
    await defaults.onApplicationBootstrap();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listRevokedSessions).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + 15_001);
    expect(defaults.isStale()).toBe(true);
    defaults.onModuleDestroy();
    defaults.onModuleDestroy();
  });

  it('keeps the background refresh running when a tick fails', async () => {
    vi.useFakeTimers();
    const listRevokedSessions = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('tick failed'))
      .mockResolvedValue([]);
    const list = new SessionRevocationList(options({ revocation: { refreshIntervalMs: 100 } }), {
      listRevokedSessions,
    } as unknown as SessionStore);
    await list.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(250);
    expect(listRevokedSessions).toHaveBeenCalledTimes(3);
    list.onModuleDestroy();
  });

  it('lists revocations from the in-memory store, including single-session replacements', async () => {
    const store = new InMemorySessionStore();
    const { sessions, revocations } = service(
      options({ singleSession: { mode: 'revoke-existing' } }),
      undefined,
      store,
    );
    const first = await sessions.create('user-1', 'tenant-1', 'cognito-1');
    const second = await sessions.create('user-1', 'tenant-1', 'cognito-1');
    expect(second.revokedSessionIds).toEqual([first.sid]);
    expect(revocations.isRevoked(first.sid)).toBe(true);

    await sessions.revoke(second.sid);
    expect(revocations.isRevoked(second.sid)).toBe(true);
    const listed = await store.listRevokedSessions(new Date(Date.now() - 60_000).toISOString());
    expect(listed.map((entry) => entry.sid).sort()).toEqual([first.sid, second.sid].sort());
    await expect(store.listRevokedSessions(new Date(Date.now() + 60_000).toISOString())).resolves.toEqual([]);
  });
});

describe('SessionService mints authorization claims into the access token', () => {
  it('mints perms and roles from the claims resolver on create and refresh', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ permissions: ['records:read'], roles: ['viewer'], permsHash: 'h1' })
      .mockResolvedValueOnce({
        permissions: ['records:read', 'records:write'],
        roles: ['editor'],
        permsHash: 'h2',
      });
    const { sessions } = service(options(), { resolve });

    const created = await sessions.create('user-1', 'tenant-1', 'cognito-1');
    expect(resolve).toHaveBeenNthCalledWith(1, {
      sid: created.sid,
      userId: 'user-1',
      tenantId: 'tenant-1',
      expiresAt: created.expiresAt,
    });
    expect(payloadOf(created.accessToken)).toMatchObject({
      sid: created.sid,
      perms: ['records:read'],
      roles: ['viewer'],
      perms_hash: 'h1',
    });

    const refreshed = await sessions.refresh(created.refreshToken);
    expect(payloadOf(refreshed.accessToken)).toMatchObject({
      sid: created.sid,
      perms: ['records:read', 'records:write'],
      roles: ['editor'],
      perms_hash: 'h2',
    });
  });

  it('prefers explicit metadata claims and mints no perms claim when nothing resolves them', async () => {
    const resolve = vi.fn();
    const { sessions } = service(options(), { resolve });
    const explicit = await sessions.create('user-1', 'tenant-1', 'cognito-1', {}, {
      claims: { permissions: ['a:b'], roles: [] },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(payloadOf(explicit.accessToken)).toMatchObject({ perms: ['a:b'], roles: [] });

    const bare = await service().sessions.create('user-1', 'tenant-1', 'cognito-1');
    const payload = payloadOf(bare.accessToken);
    expect(payload).not.toHaveProperty('perms');
    expect(payload).not.toHaveProperty('roles');
  });

  it('creates no session when claims cannot be resolved and keeps the refresh token usable', async () => {
    const store = new InMemorySessionStore();
    const resolve = vi.fn().mockRejectedValueOnce(new Error('TENANT_ACCESS_DENIED'));
    const { sessions } = service(options(), { resolve }, store);
    await expect(sessions.create('user-1', 'tenant-1', 'cognito-1')).rejects.toThrow(
      'TENANT_ACCESS_DENIED',
    );
    expect(store.sessionCount()).toBe(0);

    resolve.mockResolvedValue({ permissions: [], roles: [] });
    const created = await sessions.create('user-1', 'tenant-1', 'cognito-1');
    resolve.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(sessions.refresh(created.refreshToken)).rejects.toThrow('database unavailable');
    await expect(sessions.refresh(created.refreshToken)).resolves.toMatchObject({ sid: created.sid });
  });

  it('mints authorization claims only together, so a record without permissions gets neither', async () => {
    const signer = new SessionJwtSigningService(options());
    const now = new Date();
    const minted = await signer.signAccessToken(
      {
        sid: 'sid-roles',
        userId: 'user-1',
        tenantId: 'tenant-1',
        cognitoSub: 'cognito-1',
        refreshFamilyId: 'family',
        refreshTokenHash: 'hash',
        status: 'active',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lastTouchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
        idleExpiresAt: new Date(now.getTime() + 1_800_000).toISOString(),
        roles: ['auditor'],
      },
      now,
    );
    const payload = payloadOf(minted.token);
    expect(payload).not.toHaveProperty('perms');
    expect(payload).not.toHaveProperty('roles');

    const record = { sid: 'sid-perms', userId: 'user-1', tenantId: 'tenant-1' };
    const permsOnly = await signer.signAccessToken(
      {
        ...record,
        cognitoSub: 'cognito-1',
        refreshFamilyId: 'family',
        refreshTokenHash: 'hash',
        status: 'active',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lastTouchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
        idleExpiresAt: new Date(now.getTime() + 1_800_000).toISOString(),
        permissions: ['records:read'],
      },
      now,
    );
    expect(payloadOf(permsOnly.token)).toMatchObject({ perms: ['records:read'], roles: [] });
  });

  it('never mints an access token that outlives the session absolute or idle deadline', async () => {
    const signer = new SessionJwtSigningService(options());
    const issuedAt = new Date('2026-10-19T12:00:00.000Z');
    const base = {
      sid: 'sid-clamp',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family',
      refreshTokenHash: 'hash',
      status: 'active' as const,
      createdAt: issuedAt.toISOString(),
      updatedAt: issuedAt.toISOString(),
      lastTouchedAt: issuedAt.toISOString(),
      expiresAt: '2026-10-19T13:00:00.000Z',
      idleExpiresAt: '2026-10-19T12:30:00.000Z',
      permissions: [],
      roles: [],
    };
    const ttl = await signer.signAccessToken(base, issuedAt);
    expect(payloadOf(ttl.token).exp).toBe(Date.parse('2026-10-19T12:05:00.000Z') / 1000);

    const absolute = await signer.signAccessToken({ ...base, expiresAt: '2026-10-19T12:02:00.000Z' }, issuedAt);
    expect(payloadOf(absolute.token).exp).toBe(Date.parse('2026-10-19T12:02:00.000Z') / 1000);
    expect(absolute.expiresAt).toBe('2026-10-19T12:02:00.000Z');

    const idle = await signer.signAccessToken({ ...base, idleExpiresAt: '2026-10-19T12:01:00.000Z' }, issuedAt);
    expect(payloadOf(idle.token).exp).toBe(Date.parse('2026-10-19T12:01:00.000Z') / 1000);
  });
});
