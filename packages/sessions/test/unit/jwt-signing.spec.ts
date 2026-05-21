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

    // =========================================================================
    // WAVE-05A targeted kills — distinguish error messages so ConditionalExpression
    // mutations on the guard chain are observable through which error path fires.
    // =========================================================================

    it('rejects null with the EXACT "Session key material is missing" message (kills ConditionalExpression L34)', async () => {
      const svc = makeService(makeSecretLoader('null'));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing$/u,
      );
    });

    it('rejects undefined with the EXACT "Session key material is missing" message', async () => {
      const svc = makeService(makeSecretLoader('null')); // null is the JSON.stringify for undefined
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing$/u,
      );
    });

    it('rejects scalar with EXACT "Session key material is missing" (kills LogicalOperator || → &&)', async () => {
      // Original `!value || typeof value !== 'object'`:
      // For a scalar (truthy non-object), `!value` is false, `typeof !== 'object'` is true → throws "missing".
      // Mutation `&&`: false && true → false → does NOT throw at L34 → falls through to currentKid check → throws "missing currentKid" (different message).
      const svc = makeService(makeSecretLoader('"oops"'));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing$/u,
      );
    });

    it('rejects missing currentKid with EXACT "missing currentKid" message (kills StringLiteral L44)', async () => {
      const svc = makeService(makeSecretLoader(JSON.stringify({ keys: [] })));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing currentKid$/u,
      );
    });

    it('rejects empty-string currentKid with EXACT "missing currentKid" (kills EqualityOperator currentKid.length === 0 → !== 0)', async () => {
      const svc = makeService(makeSecretLoader(JSON.stringify({ currentKid: '', keys: [] })));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing currentKid$/u,
      );
    });

    it('rejects non-string currentKid (numeric) with the SAME currentKid message (kills ConditionalExpression typeof)', async () => {
      const svc = makeService(makeSecretLoader(JSON.stringify({ currentKid: 42, keys: [] })));
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material is missing currentKid$/u,
      );
    });

    it('rejects non-array keys with EXACT "has no keys" message (kills ConditionalExpression on Array.isArray)', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({ currentKid: 'k1', keys: 'not-array' })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material has no keys$/u,
      );
    });

    it('rejects empty-array keys with EXACT "has no keys" message (kills EqualityOperator keys.length === 0 → !== 0)', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({ currentKid: 'k1', keys: [] })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session key material has no keys$/u,
      );
    });

    it('rejects null key entry with EXACT "is invalid" message (kills ConditionalExpression L54)', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({ currentKid: 'k1', keys: [null] })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session signing key entry is invalid$/u,
      );
    });

    it('rejects key entry missing kid with EXACT "is incomplete" message (kills LogicalOperator || chain L63-67)', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({
          currentKid: 'k1',
          keys: [{ publicKeyPem: 'p', privateKeyPem: 'q' }],
        })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session signing key entry is incomplete$/u,
      );
    });

    it('rejects key entry missing privateKeyPem with EXACT "is incomplete" message', async () => {
      const svc = makeService(
        makeSecretLoader(JSON.stringify({
          currentKid: 'k1',
          keys: [{ kid: 'k1', publicKeyPem: 'p' }],
        })),
      );
      await expect(svc.signAccessToken(makeRecord(), new Date())).rejects.toThrow(
        /Session signing key entry is incomplete$/u,
      );
    });
  });

  describe('base64UrlEncode (kills Regex survivors at jwt-signing.service.ts:30)', () => {
    // The base64UrlEncode helper is private; we observe its output via the
    // produced JWT segments. The padding-strip /=+$/u differs from the
    // mutations /=+/u (no anchor, strips ALL contiguous = runs anywhere) and
    // /=$/u (single trailing =).
    it('produces a 3-part token with no trailing = in any segment', async () => {
      const { publicKey, privateKey } = genKeyPair();
      const raw = JSON.stringify({
        currentKid: 'k1',
        keys: [{ kid: 'k1', publicKeyPem: publicKey, privateKeyPem: privateKey }],
      });
      const svc = new SessionJwtSigningService(
        {
          timeouts: { accessSeconds: 300, refreshSeconds: 86_400, idleSeconds: 1800 },
          jwt: { secretId: 'session/keys', cacheTtlMs: 60_000 },
        } as never,
        makeSecretLoader(raw) as never,
      );
      const result = await svc.signAccessToken(makeRecord(), new Date());
      const parts = result.token.split('.');
      // No '=' in any base64url segment (trailing padding is stripped).
      for (const segment of parts) {
        expect(segment.endsWith('=')).toBe(false);
      }
    });
  });
});
