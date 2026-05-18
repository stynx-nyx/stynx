import { generateKeyPairSync } from 'node:crypto';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionSigningKeyError } from '../../src/errors';
import type {
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
} from '../../src/types';
import type { Mock } from 'vitest';

interface FakeSecretLoader {
  getSecretString: Mock<Promise<string>, [string]>;
}

function makeSecretLoader(raw: string): FakeSecretLoader {
  return { getSecretString: vi.fn(async () => raw) };
}

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

  describe('secretLoader path (validateKeySet)', () => {
    const baseOptions = {
      timeouts: { accessSeconds: 300, refreshSeconds: 86_400, idleSeconds: 1800 },
      jwt: { secretId: 'session/keys', cacheTtlMs: 60_000 },
    };

    function makeService(loader: FakeSecretLoader) {
      return new SessionJwtSigningService(baseOptions as never, loader as never);
    }

    it('signs successfully when secret loader returns a valid key set', async () => {
      const { publicKey, privateKey } = genKeyPair();
      const raw = JSON.stringify({
        currentKid: 'k1',
        keys: [{ kid: 'k1', publicKeyPem: publicKey, privateKeyPem: privateKey }],
      });
      const svc = makeService(makeSecretLoader(raw));
      const result = await svc.signAccessToken(makeRecord(), new Date());
      expect(result.token.split('.')).toHaveLength(3);
    });

    it('rejects when secret JSON is not an object', async () => {
      const svc = makeService(makeSecretLoader('"oops"'));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
        SessionSigningKeyError,
      );
    });

    it('rejects when currentKid is missing or empty', async () => {
      const svc = makeService(makeSecretLoader(JSON.stringify({ keys: [] })));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
        SessionSigningKeyError,
      );
    });

    it('rejects when keys array is missing or empty', async () => {
      const svc = makeService(makeSecretLoader(JSON.stringify({ currentKid: 'k1' })));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
        SessionSigningKeyError,
      );
    });

    it('rejects when a key entry is not an object', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({ currentKid: 'k1', keys: ['not-an-object'] })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
        SessionSigningKeyError,
      );
    });

    it('rejects when a key entry is missing kid/publicKeyPem/privateKeyPem', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({ currentKid: 'k1', keys: [{ kid: 'k1' }] })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toBeInstanceOf(
        SessionSigningKeyError,
      );
    });

    it('preserves activatesAt + expiresAt when present', async () => {
      const { publicKey, privateKey } = genKeyPair();
      const raw = JSON.stringify({
        currentKid: 'k1',
        keys: [{
          kid: 'k1',
          publicKeyPem: publicKey,
          privateKeyPem: privateKey,
          activatesAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:00:00.000Z',
        }],
      });
      const svc = makeService(makeSecretLoader(raw));
      const result = await svc.signAccessToken(makeRecord(), new Date());
      expect(result.token.split('.')).toHaveLength(3);
    });
  });
});
