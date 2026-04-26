import { createPublicKey, generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionService } from '../../src/session.service';
import { RefreshTokenReuseDetectedError, SessionExpiredError } from '../../src/errors';
import { resolveSessionsOptions, type SessionMirror, type SessionMirrorEntry } from '../../src/types';

class RecordingMirror implements SessionMirror {
  readonly entries: SessionMirrorEntry[] = [];

  async append(entry: SessionMirrorEntry): Promise<void> {
    this.entries.push(entry);
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

    expect(current).not.toBeNull();
    expect(current?.tenantId).toBe('tenant-1');

    await expect(service.revoke(created.sid)).resolves.toBe(true);
    await expect(service.get(created.sid)).resolves.toBeNull();
    expect(store.invalidations).toEqual(['user-1:tenant-1']);
    expect(mirror.entries.map((entry) => entry.status)).toEqual(['active', 'revoked']);
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
    await expect(service.get(created.sid)).resolves.toBeNull();
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
    await expect(service.get(created.sid)).resolves.toBeNull();

    const createdAgain = await service.create('user-2', 'tenant-1', 'cognito-2');
    now = new Date('2026-04-24T12:00:08.500Z');
    await expect(service.refresh(createdAgain.refreshToken)).rejects.toBeInstanceOf(SessionExpiredError);
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
    expect(await service.get(current.sid)).not.toBeNull();
  });
});
