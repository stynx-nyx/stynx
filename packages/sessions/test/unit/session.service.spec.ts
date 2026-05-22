import { createPublicKey, generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionMirrorWriter } from '../../src/session-mirror.writer';
import { SessionService } from '../../src/session.service';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
  SessionExpiredError,
} from '../../src/errors';
import {
  resolveSessionsOptions,
  type RefreshTokenLookup,
  type SessionMirror,
  type SessionMirrorEntry,
  type SessionRecord,
  type SessionStatus,
  type SessionStore,
} from '../../src/types';

class RecordingMirror implements SessionMirror {
  readonly entries: SessionMirrorEntry[] = [];

  async append(entry: SessionMirrorEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class StaticSessionStore implements SessionStore {
  constructor(private readonly session: SessionRecord | null) {}

  async createSession(): Promise<void> {}

  async getSession(): Promise<SessionRecord | null> {
    return this.session ? { ...this.session } : null;
  }

  async lookupRefreshToken(): Promise<RefreshTokenLookup | null> {
    return null;
  }

  async rotateRefreshToken(): Promise<SessionRecord | null> {
    return null;
  }

  async touchSession(): Promise<SessionRecord | null> {
    return null;
  }

  async revokeSession(
    sid: string,
    revokedAt: string,
    status: SessionStatus,
  ): Promise<SessionRecord | null> {
    return this.session ? { ...this.session, sid, revokedAt, status, updatedAt: revokedAt } : null;
  }

  async listSessionIdsByUser(): Promise<string[]> {
    return [];
  }

  async listSessionIdsByTenant(): Promise<string[]> {
    return [];
  }

  async publishInvalidation(): Promise<void> {}
}

class RefreshFailureStore extends StaticSessionStore {
  constructor(
    session: SessionRecord | null,
    private readonly lookup: RefreshTokenLookup | null,
    private readonly rotated: SessionRecord | null,
  ) {
    super(session);
  }

  async lookupRefreshToken(): Promise<RefreshTokenLookup | null> {
    return this.lookup ? { ...this.lookup } : null;
  }

  async rotateRefreshToken(): Promise<SessionRecord | null> {
    return this.rotated ? { ...this.rotated } : null;
  }
}

class PartialRevokeStore extends InMemorySessionStore {
  constructor(private readonly listedIds: string[]) {
    super();
  }

  override async listSessionIdsByUser(): Promise<string[]> {
    return [...this.listedIds];
  }

  override async listSessionIdsByTenant(): Promise<string[]> {
    return [...this.listedIds];
  }
}

function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'test-key-1',
    keys: [
      {
        kid: 'test-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

function decodeTokenSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

function verifyJwt(
  token: string,
  jwk: JsonWebKey,
  expectedIssuer: string,
  clockToleranceSeconds = 0,
): Record<string, unknown> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('JWT is malformed');
  }

  const payload = decodeTokenSegment(encodedPayload);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    key,
    Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedSignature.length / 4) * 4, '='),
      'base64',
    ),
  );
  expect(valid).toBe(true);
  expect(payload.iss).toBe(expectedIssuer);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === 'number') {
    expect(payload.nbf - nowSeconds).toBeLessThanOrEqual(clockToleranceSeconds);
  }
  if (typeof payload.exp === 'number') {
    expect(payload.exp).toBeGreaterThan(nowSeconds - clockToleranceSeconds);
  }

  return payload;
}

describe('SessionService', () => {
  it('creates, reads, and revokes a session', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create('user-1', 'tenant-1', 'cognito-1', { device: 'test' });
    const current = await service.get(created.sid);

    expect(current).toEqual(expect.objectContaining({
      deviceMeta: { device: 'test' },
      tenantId: 'tenant-1',
    }));
    expect(current?.tenantId).toBe('tenant-1');

    await expect(service.revoke(created.sid)).resolves.toBe(true);
    await expect(service.get(created.sid)).resolves.toBe(null);
    expect(store.invalidations).toEqual(['user-1:tenant-1']);
    expect(mirror.entries.map((entry) => entry.status)).toEqual(['active', 'revoked']);
  });

  it('omits empty device metadata and create metadata from stored session records', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);

    const created = await service.create('user-empty', 'tenant-empty', 'cognito-empty', {}, {});
    const current = await service.get(created.sid);

    expect(current).toEqual(expect.objectContaining({
      userId: 'user-empty',
      tenantId: 'tenant-empty',
      cognitoSub: 'cognito-empty',
    }));
    expect(current).not.toHaveProperty('deviceMeta');
    expect(current).not.toHaveProperty('membershipId');
    expect(current).not.toHaveProperty('permsHash');
  });

  it('rotates refresh tokens and kills the family when an old token is reused', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create('user-1', 'tenant-1', 'cognito-1');
    const rotated = await service.refresh(created.refreshToken);

    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    await expect(service.refresh(created.refreshToken)).rejects.toBeInstanceOf(
      RefreshTokenReuseDetectedError,
    );
    await expect(service.get(created.sid)).resolves.toBe(null);
    expect(mirror.entries.at(-1)?.status).toBe('reuse_detected');
  });

  it('enforces absolute and idle timeout windows', async () => {
    let now = new Date('2026-04-24T12:00:00.000Z');
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      timeouts: {
        absoluteSeconds: 4,
        idleSeconds: 2,
      },
      clock: () => now,
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create('user-1', 'tenant-1', 'cognito-1');
    now = new Date('2026-04-24T12:00:01.000Z');
    const touched = await service.touch(created.sid);
    expect(touched?.idleExpiresAt).toBe('2026-04-24T12:00:03.000Z');

    now = new Date('2026-04-24T12:00:03.500Z');
    await expect(service.refresh(created.refreshToken)).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(service.get(created.sid)).resolves.toBe(null);

    const createdAgain = await service.create('user-2', 'tenant-1', 'cognito-2');
    now = new Date('2026-04-24T12:00:08.500Z');
    await expect(service.refresh(createdAgain.refreshToken)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('treats absolute and idle expiry timestamps as expired at the exact boundary', async () => {
    const now = new Date('2026-04-24T12:00:00.000Z');
    const baseSession: SessionRecord = {
      sid: 'session-boundary',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family-1',
      refreshTokenHash: 'refresh-hash-1',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    };
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      clock: () => now,
    });

    await expect(new SessionService(
      options,
      new StaticSessionStore({ ...baseSession, expiresAt: now.toISOString() }),
      new SessionJwtSigningService(options),
      new RecordingMirror(),
    ).get('session-boundary')).resolves.toBe(null);

    await expect(new SessionService(
      options,
      new StaticSessionStore({ ...baseSession, idleExpiresAt: now.toISOString() }),
      new SessionJwtSigningService(options),
      new RecordingMirror(),
    ).get('session-boundary')).resolves.toBe(null);
  });

  it('supports clock skew when access tokens have a slightly future nbf', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      timeouts: {
        accessNotBeforeDelaySeconds: 2,
      },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create('user-1', 'tenant-1', 'cognito-1');
    const jwks = await signing.getJwks();
    const payload = verifyJwt(
      created.accessToken,
      jwks.keys[0] as JsonWebKey,
      'https://sessions.test',
      5,
    );

    expect(payload.sid).toBe(created.sid);
    expect(payload.tenant_id).toBe('tenant-1');
  });

  it('survives 1000 sequential refresh cycles without leaking live session records', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    let current = await service.create('user-1', 'tenant-1', 'cognito-1');
    for (let index = 0; index < 1000; index += 1) {
      current = await service.refresh(current.refreshToken);
    }

    expect(store.sessionCount()).toBe(1);
    expect(store.refreshLookupCount()).toBe(1001);
    expect(await service.get(current.sid)).toEqual(expect.objectContaining({ sid: current.sid }));
  });

  it('exchanges an active session for a new tenant-scoped session', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create(
      'user-1',
      'tenant-1',
      'cognito-1',
      { device: 'test' },
      { membershipId: 'membership-1', permsHash: 'hash-1' },
    );
    const exchanged = await service.exchange({
      sessionId: created.sid,
      actorUserId: 'user-1',
      newTenantId: 'tenant-2',
      membershipId: 'membership-2',
      permsHash: 'hash-2',
    });

    expect(exchanged.revokedSessionId).toBe(created.sid);
    expect(exchanged.bundle.sid).not.toBe(created.sid);
    await expect(service.get(created.sid)).resolves.toBe(null);

    const replacement = await service.get(exchanged.bundle.sid);
    expect(replacement).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-2',
      cognitoSub: 'cognito-1',
      membershipId: 'membership-2',
      permsHash: 'hash-2',
      deviceMeta: { device: 'test' },
    });
    expect(mirror.entries.map((entry) => entry.status)).toEqual(['active', 'revoked', 'active']);
    expect(mirror.entries.map((entry) => entry.tenantId)).toEqual(['tenant-1', 'tenant-1', 'tenant-2']);
  });

  it('rejects tenant exchange for a mismatched actor', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    const created = await service.create('user-1', 'tenant-1', 'cognito-1');

    await expect(service.exchange({
      sessionId: created.sid,
      actorUserId: 'user-2',
      newTenantId: 'tenant-2',
    })).rejects.toMatchObject({
      code: 'SESSION_OWNER_MISMATCH',
      message: 'Session ' + created.sid + ' does not belong to user user-2',
    });
  });

  it('rejects tenant exchange for a missing session', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    await expect(service.exchange({
      sessionId: 'missing-session',
      actorUserId: 'user-1',
      newTenantId: 'tenant-2',
    })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      message: 'Session missing-session not found',
    });
  });

  it('rejects tenant exchange for an inactive session', async () => {
    const now = new Date();
    const store = new StaticSessionStore({
      sid: 'session-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family-1',
      refreshTokenHash: 'refresh-hash-1',
      status: 'revoked',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    });
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      clock: () => now,
    });
    const signing = new SessionJwtSigningService(options);
    const service = new SessionService(options, store, signing, mirror);

    await expect(service.exchange({
      sessionId: 'session-1',
      actorUserId: 'user-1',
      newTenantId: 'tenant-2',
    })).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      message: 'Session session-1 is no longer active',
    });
  });

  it('returns null or false for missing session operations and invalid refresh tokens', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);

    await expect(service.get('missing')).resolves.toBe(null);
    await expect(service.touch('missing')).resolves.toBe(null);
    await expect(service.revoke('missing')).resolves.toBe(false);
    await expect(service.refresh('not-a-refresh-token')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rethrows non-expiry inactive session errors from get', async () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    const store = new StaticSessionStore({
      sid: 'session-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family-1',
      refreshTokenHash: 'refresh-hash-1',
      status: 'revoked',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    });
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      clock: () => now,
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), new RecordingMirror());

    await expect(service.get('session-1')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('returns null for direct in-memory touch and rotate misses', async () => {
    const store = new InMemorySessionStore();

    await expect(
      store.rotateRefreshToken(
        'missing',
        'current-hash',
        'next-hash',
        new Date().toISOString(),
        new Date().toISOString(),
      ),
    ).resolves.toBe(null);
    await expect(
      store.touchSession('missing', new Date().toISOString(), new Date().toISOString()),
    ).resolves.toBe(null);
  });

  it('rejects refresh when lookup points at a missing session or rotation fails', async () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    const activeSession: SessionRecord = {
      sid: 'sid-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family-1',
      refreshTokenHash: 'hash-1',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    };
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      clock: () => now,
    });
    const signing = new SessionJwtSigningService(options);

    await expect(
      new SessionService(
        options,
        new RefreshFailureStore(null, { sid: 'sid-1', familyId: 'family-1', state: 'active' }, null),
        signing,
        new RecordingMirror(),
      ).refresh('refresh-token'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    await expect(
      new SessionService(
        options,
        new RefreshFailureStore(activeSession, { sid: 'sid-1', familyId: 'family-1', state: 'active' }, null),
        signing,
        new RecordingMirror(),
      ).refresh('refresh-token'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('skips session mirroring when infrastructure providers are not available', async () => {
    const writer = new SessionMirrorWriter({
      get: vi.fn(() => undefined),
    } as never);

    await expect(
      writer.append({
        sid: 'sid-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).resolves.toBe(undefined);
  });

  it('writes mirror rows with membership ids when infrastructure providers are available', async () => {
    const values = vi.fn(async () => undefined);
    const runWithRequestContext = vi.fn(async (_context: unknown, callback: () => Promise<void>) => callback());
    const writer = new SessionMirrorWriter({
      get: vi.fn((token: { name?: string }) => {
        if (token.name === 'Database') {
          return {
            tx: vi.fn(async (callback: (trx: unknown) => Promise<void>) =>
              callback({
                insert: vi.fn(() => ({ values })),
              }),
            ),
          };
        }
        if (token.name === 'RequestContextMutator') {
          return { runWithRequestContext };
        }
        return undefined;
      }),
    } as never);

    await writer.append({
      sid: 'sid-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'membership-1',
      status: 'active',
      createdAt: '2026-05-18T12:00:00.000Z',
      expiresAt: '2026-05-18T13:00:00.000Z',
    });

    expect(runWithRequestContext).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      membershipId: 'membership-1',
      sid: 'sid-1',
    }));
  });

  it('resolves optional audience and secret-id session options', () => {
    expect(
      resolveSessionsOptions({
        issuer: 'https://sessions.test',
        audience: 'aud',
        redis: { url: 'redis://127.0.0.1:6379' },
        jwt: { secretId: 'sessions/key' },
        timeouts: {
          accessNotBeforeDelaySeconds: 3,
        },
      }),
    ).toMatchObject({
      audience: 'aud',
      jwt: {
        secretId: 'sessions/key',
        cacheTtlMs: 300_000,
      },
      timeouts: {
        accessNotBeforeDelaySeconds: 3,
      },
    });
  });

  it('exchanges sessions without carrying optional device metadata or create metadata', async () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    const store = new StaticSessionStore({
      sid: 'session-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-1',
      refreshFamilyId: 'family-1',
      refreshTokenHash: 'refresh-hash-1',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    });
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
      clock: () => now,
    });
    const mirror = new RecordingMirror();
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);

    const exchanged = await service.exchange({
      sessionId: 'session-1',
      actorUserId: 'user-1',
      newTenantId: 'tenant-2',
    });

    expect(exchanged.revokedSessionId).toBe('session-1');
    expect(exchanged.bundle.sid).toEqual(expect.any(String));
    expect(mirror.entries.at(-1)).toMatchObject({
      tenantId: 'tenant-2',
    });
    expect(mirror.entries.at(-1)).not.toHaveProperty('membershipId');
    expect(mirror.entries.at(-1)).not.toHaveProperty('permsHash');
  });

  it('revokes all sessions for a user or tenant with one invalidation per affected scope', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);

    await service.create('user-1', 'tenant-1', 'cognito-1', {}, { membershipId: 'm-1' });
    await service.create('user-1', 'tenant-2', 'cognito-1');
    await service.create('user-2', 'tenant-2', 'cognito-2');

    await expect(service.revokeAllForUser('user-1')).resolves.toBe(2);
    expect(store.invalidations).toEqual(expect.arrayContaining(['user-1:tenant-1', 'user-1:tenant-2']));
    expect(mirror.entries.filter((entry) => entry.status === 'revoked')).toHaveLength(2);

    await expect(service.revokeAllForTenant('tenant-2')).resolves.toBe(1);
    expect(store.invalidations).toContain('*:tenant-2');
  });

  it('does not publish tenant invalidation when no tenant sessions are active', async () => {
    const store = new InMemorySessionStore();
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);

    await expect(service.revokeAllForTenant('tenant-missing')).resolves.toBe(0);
    expect(store.invalidations).toEqual([]);
  });

  it('excludes missing sessions from revoke-all counts, invalidations, and mirror writes', async () => {
    const store = new PartialRevokeStore(['sid-active', 'sid-missing']);
    const mirror = new RecordingMirror();
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet: buildKeySet() },
    });
    const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);
    await store.createSession({
      sid: 'sid-active',
      userId: 'user-partial',
      tenantId: 'tenant-partial',
      cognitoSub: 'cognito-partial',
      refreshFamilyId: 'family-partial',
      refreshTokenHash: 'hash-partial',
      status: 'active',
      createdAt: '2026-05-18T12:00:00.000Z',
      updatedAt: '2026-05-18T12:00:00.000Z',
      lastTouchedAt: '2026-05-18T12:00:00.000Z',
      expiresAt: '2026-05-18T13:00:00.000Z',
      idleExpiresAt: '2026-05-18T13:00:00.000Z',
      membershipId: 'membership-partial',
    });

    await expect(service.revokeAllForUser('user-partial')).resolves.toBe(1);
    expect(store.invalidations).toEqual(['user-partial:tenant-partial']);
    expect(mirror.entries).toEqual([
      expect.objectContaining({
        sid: 'sid-active',
        status: 'revoked',
        membershipId: 'membership-partial',
      }),
    ]);
  });

  // ===========================================================================
  // WAVE-05A targeted kills.
  // ===========================================================================

  describe('mirror payload excludes undefined membershipId (kills EqualityOperator + ObjectLiteral at session.service.ts:293, 320)', () => {
    it('omits membershipId from mirror entry when session has none', async () => {
      const store = new InMemorySessionStore();
      const mirror = new RecordingMirror();
      const options = resolveSessionsOptions({
        issuer: 'https://sessions.test',
        redis: { url: 'redis://127.0.0.1:6379' },
        jwt: { keySet: buildKeySet() },
      });
      const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);
      const bundle = await service.create('user-no-mem', 'tenant-1', 'cog-1');
      await service.revoke(bundle.sid, 'revoked');
      const entry = mirror.entries.at(-1)!;
      expect(entry).not.toHaveProperty('membershipId');
      expect(entry.tenantId).toBe('tenant-1');
      expect(entry.userId).toBe('user-no-mem');
    });

    it('includes membershipId in mirror entry when session has one', async () => {
      const store = new InMemorySessionStore();
      const mirror = new RecordingMirror();
      const options = resolveSessionsOptions({
        issuer: 'https://sessions.test',
        redis: { url: 'redis://127.0.0.1:6379' },
        jwt: { keySet: buildKeySet() },
      });
      const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);
      const bundle = await service.create('user-with-mem', 'tenant-1', 'cog-1', {}, { membershipId: 'm-1' });
      await service.revoke(bundle.sid, 'revoked');
      const entry = mirror.entries.at(-1)!;
      expect(entry.membershipId).toBe('m-1');
    });
  });
});

// ===========================================================================
// InMemorySessionStore mutation kills.
// ===========================================================================

describe('InMemorySessionStore — mutation kills', () => {
  it('rotateRefreshToken returns null when refresh-lookup state is not active (kills ConditionalExpression at L48)', async () => {
    const store = new InMemorySessionStore();
    const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const expiresAt = new Date('2026-02-01T00:00:00.000Z').toISOString();
    await store.createSession({
      sid: 's-rotate-not-active', tenantId: 't', userId: 'u', cognitoSub: 'c',
      refreshTokenHash: 'h-old', refreshFamilyId: 'f-1',
      createdAt: now, updatedAt: now, lastTouchedAt: now,
      expiresAt, idleExpiresAt: expiresAt, status: 'active',
    } as never);
    await store.rotateRefreshToken('s-rotate-not-active', 'h-old', 'h-mid', expiresAt, now);
    const result = await store.rotateRefreshToken('s-rotate-not-active', 'h-old', 'h-next', expiresAt, now);
    expect(result).toBe(null);
  });

  it('rotateRefreshToken returns null when currentHash does not match session refreshTokenHash (kills second ConditionalExpression at L48)', async () => {
    const store = new InMemorySessionStore();
    const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const expiresAt = new Date('2026-02-01T00:00:00.000Z').toISOString();
    await store.createSession({
      sid: 's-rotate-mismatch', tenantId: 't', userId: 'u', cognitoSub: 'c',
      refreshTokenHash: 'h-current', refreshFamilyId: 'f-1',
      createdAt: now, updatedAt: now, lastTouchedAt: now,
      expiresAt, idleExpiresAt: expiresAt, status: 'active',
    } as never);
    const result = await store.rotateRefreshToken('s-rotate-mismatch', 'h-WRONG', 'h-next', expiresAt, now);
    expect(result).toBe(null);
  });

  it('publishInvalidation emits on the literal "invalidate" channel (kills StringLiteral at L130)', async () => {
    const store = new InMemorySessionStore();
    const received: string[] = [];
    (store as unknown as { invalidationEvents: { on(e: string, cb: (msg: string) => void): void } })
      .invalidationEvents.on('invalidate', (msg) => received.push(msg));
    await store.publishInvalidation('test-channel');
    expect(received).toEqual(['test-channel']);
  });
});
