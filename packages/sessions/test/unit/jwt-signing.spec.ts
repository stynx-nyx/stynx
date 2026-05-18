import { generateKeyPairSync } from 'node:crypto';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionSigningKeyError } from '../../src/errors';
import type {
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
} from '../../src/types';

function genKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function makeOptions(keyMaterialOverride?: unknown): ResolvedStynxSessionsModuleOptions {
  const { publicKey, privateKey } = genKeyPair();
  const keyMaterial =
    keyMaterialOverride === undefined
      ? {
          currentKid: 'k1',
          keys: [{ kid: 'k1', publicKeyPem: publicKey, privateKeyPem: privateKey }],
        }
      : keyMaterialOverride;
  return {
    issuer: 'https://stynx.test',
    audience: 'stynx',
    timeouts: { accessSeconds: 300, refreshSeconds: 86_400, idleSeconds: 1800 },
    jwt: { keySet: keyMaterial, cacheTtlMs: 60_000 },
    cookies: { secure: true, sameSite: 'lax', name: 'stynx.session' },
  } as unknown as ResolvedStynxSessionsModuleOptions;
}

function makeRecord(): SessionRecord {
  return {
    id: 'session-1',
    actorId: 'user-1',
    tenantId: 'tenant-1',
    permissions: ['read'],
    roles: ['member'],
    issuedAt: new Date('2026-05-17T00:00:00.000Z'),
    refreshExpiresAt: new Date('2026-05-18T00:00:00.000Z'),
    idleExpiresAt: new Date('2026-05-17T01:00:00.000Z'),
  } as unknown as SessionRecord;
}

describe('SessionJwtSigningService.signAccessToken', () => {
  it('produces a 3-segment JWT signed by the active key', async () => {
    const svc = new SessionJwtSigningService(makeOptions());
    const result = await svc.signAccessToken(makeRecord(), new Date('2026-05-17T00:00:00.000Z'));
    expect(result.token.split('.')).toHaveLength(3);
    expect(typeof result.expiresAt).toBeDefined();
  });

  it('caches resolved keys across calls (singleton)', async () => {
    const svc = new SessionJwtSigningService(makeOptions());
    await svc.signAccessToken(makeRecord(), new Date());
    const cacheBefore = (svc as unknown as { cache: unknown }).cache;
    await svc.signAccessToken(makeRecord(), new Date());
    const cacheAfter = (svc as unknown as { cache: unknown }).cache;
    expect(cacheBefore).toBe(cacheAfter);
  });

  it('throws SessionSigningKeyError when activeKid is not present in keys', async () => {
    const { publicKey, privateKey } = genKeyPair();
    const svc = new SessionJwtSigningService(
      makeOptions({
        currentKid: 'missing-kid',
        keys: [{ kid: 'k1', publicKeyPem: publicKey, privateKeyPem: privateKey }],
      }),
    );
    await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
      SessionSigningKeyError,
    );
  });

  it('throws when neither jwt.keySet nor jwt.secretId is configured', async () => {
    const svc = new SessionJwtSigningService({
      jwt: { cacheTtlMs: 60_000 },
      timeouts: { accessSeconds: 300, refreshSeconds: 86_400, idleSeconds: 1800 },
    } as never);
    await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
      SessionSigningKeyError,
    );
  });

  it('throws when jwt.secretId is set but SecretLoader is unavailable', async () => {
    const svc = new SessionJwtSigningService({
      jwt: { secretId: 'some-secret', cacheTtlMs: 60_000 },
      timeouts: { accessSeconds: 300, refreshSeconds: 86_400, idleSeconds: 1800 },
    } as never);
    await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
      SessionSigningKeyError,
    );
  });
});
