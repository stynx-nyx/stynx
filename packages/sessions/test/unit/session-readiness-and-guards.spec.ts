import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { createSessionStoreReadinessIndicator } from '../../src/readiness';
import { SessionService } from '../../src/session.service';
import { resolveSessionsOptions, type SessionRecord, type SessionStore } from '../../src/types';

const now = new Date('2026-05-18T12:00:00.000Z');

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sid: 'prior',
    userId: 'user-1',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-1',
    refreshFamilyId: 'family-1',
    refreshTokenHash: 'hash-1',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastTouchedAt: now.toISOString(),
    expiresAt: '2026-05-18T13:00:00.000Z',
    idleExpiresAt: '2026-05-18T12:30:00.000Z',
    ...overrides,
  };
}

function service(store: SessionStore, policy: Record<string, unknown> = {}): SessionService {
  const options = resolveSessionsOptions({
    issuer: 'https://sessions.test',
    redis: { url: 'redis://127.0.0.1:6379' },
    jwt: { keySet: { currentKid: 'unused', keys: [] } },
    clock: () => now,
    ...policy,
  });
  return new SessionService(options, store, new SessionJwtSigningService(options), {
    append: async () => undefined,
  });
}

describe('session store readiness', () => {
  afterEach(() => vi.useRealTimers());

  it('reports an available store through its probe and through the legacy read-only lookup', async () => {
    const probe = vi.fn(async () => true);
    const withProbe = createSessionStoreReadinessIndicator({ probeReadiness: probe } as SessionStore);
    expect(withProbe.name).toBe('stynx-session-store');
    await expect(withProbe.check()).resolves.toEqual({ status: 'up' });
    expect(probe).toHaveBeenCalledOnce();

    const getSession = vi.fn(async () => null);
    const legacy = createSessionStoreReadinessIndicator({ getSession } as unknown as SessionStore, { timeoutMs: 25 });
    await expect(legacy.check()).resolves.toEqual({ status: 'up' });
    expect(getSession).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
  });

  it('reports an unavailable store when its probe fails, rejects, or times out', async () => {
    const down = { status: 'down', details: { reason: 'store-unavailable' } };
    const unavailable = createSessionStoreReadinessIndicator({
      probeReadiness: async () => false,
    } as SessionStore);
    await expect(unavailable.check()).resolves.toEqual(down);

    const rejected = createSessionStoreReadinessIndicator({
      probeReadiness: async () => { throw new Error('connection lost'); },
    } as SessionStore);
    await expect(rejected.check()).resolves.toEqual(down);

    vi.useFakeTimers();
    const stalled = createSessionStoreReadinessIndicator({
      probeReadiness: () => new Promise<boolean>(() => undefined),
    } as SessionStore, { timeoutMs: 25 });
    const check = stalled.check();
    await vi.advanceTimersByTimeAsync(25);
    await expect(check).resolves.toEqual(down);
  });

  it('handles a synchronous probe failure before a timeout is scheduled', async () => {
    const broken = createSessionStoreReadinessIndicator({
      probeReadiness: () => { throw new Error('client not initialized'); },
    } as SessionStore);
    await expect(broken.check()).resolves.toEqual({
      status: 'down', details: { reason: 'store-unavailable' },
    });
  });

  it('exposes the in-memory store readiness probe', async () => {
    await expect(new InMemorySessionStore().probeReadiness()).resolves.toBe(true);
  });
});

describe('session creation guards', () => {
  it('rejects a missing prior session atomically in the in-memory store', async () => {
    const store = new InMemorySessionStore();
    await expect(store.createWithPolicy(record({ sid: 'new' }), {
      mode: 'off', priorSessionId: 'missing', now: now.toISOString(),
    })).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    await expect(store.getSession('new')).resolves.toBe(null);
  });

  it('rejects an empty strong-factor policy at module startup', () => {
    const sessions = service(new InMemorySessionStore(), {
      strongFactor: { acceptedValues: ['  '] },
    });
    expect(() => sessions.onModuleInit()).toThrow('Strong-factor policy requires an accepted value');
  });

  it('accepts a store with atomic transitions when strong-factor policy is disabled', () => {
    expect(() => service(new InMemorySessionStore()).onModuleInit()).not.toThrow();
  });

  it('rejects prior sessions belonging to another actor or no longer active', async () => {
    const store = new InMemorySessionStore();
    await store.createSession(record());
    const sessions = service(store);

    await expect(sessions.create('user-2', 'tenant-2', 'cognito-2', {}, {
      priorSessionId: 'prior',
    })).rejects.toMatchObject({ code: 'SESSION_OWNER_MISMATCH' });
    await expect(sessions.create('user-1', 'tenant-2', 'cognito-1', {}, {
      priorSessionId: 'missing',
    })).rejects.toMatchObject({ code: 'SESSION_OWNER_MISMATCH' });

    await store.revokeSession('prior', now.toISOString(), 'revoked');
    await store.createSession(record({ status: 'revoked' }));
    await expect(sessions.create('user-1', 'tenant-2', 'cognito-1', {}, {
      priorSessionId: 'prior',
    })).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    await expect(store.listSessionIdsByTenant('tenant-2')).resolves.toEqual([]);
  });

  it('fails closed when atomic policy creation is unavailable at call time', async () => {
    const store = new InMemorySessionStore();
    const nonAtomic: SessionStore = store;
    nonAtomic.createWithPolicy = undefined;
    const sessions = service(nonAtomic, { singleSession: { mode: 'reject-new' } });
    await expect(sessions.create('user-1', 'tenant-1', 'cognito-1')).rejects.toThrow(
      'Atomic session transition unavailable',
    );
  });
});
