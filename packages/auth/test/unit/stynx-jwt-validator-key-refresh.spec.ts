import type { ModuleRef } from '@nestjs/core';
import type { Mock } from 'vitest';
import { InvalidCredentialError } from '@stynx-nyx/contracts';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, createPublicKey: vi.fn(actual.createPublicKey) };
});

vi.mock('../../src/utils', async () => {
  const actual = await vi.importActual('../../src/utils');
  return { ...actual, verifyJwtWithJwk: vi.fn() };
});

import { createPublicKey } from 'node:crypto';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator';
import { base64UrlEncode, verifyJwtWithJwk } from '../../src/utils';

type Jwk = Record<string, string>;
type KeySet = { source: unknown; version: number; keys: Jwk[]; expiresAt: number; forcedRefreshStartedAt?: number };
interface ValidatorInternals {
  resolveKeys: (forceRefresh: boolean, ...rest: unknown[]) => Promise<KeySet>;
  refreshAfterSignatureMiss: (initial: KeySet, signingService?: unknown) => Promise<KeySet>;
}

const ISSUER = 'https://stynx.test';
const OPTIONS = { stynx: { issuer: ISSUER }, permissions: { dbFallbackOnRedisDown: true } } as never;

async function keyPair(kid: string): Promise<{ privateKey: CryptoKey; jwk: Jwk }> {
  const { generateKeyPair } = await import('jose');
  const pair = await generateKeyPair('RS256');
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' } as Jwk;
  return { privateKey: pair.privateKey, jwk };
}

async function signedToken(privateKey: CryptoKey, kid: string): Promise<string> {
  const { SignJWT } = await import('jose');
  return new SignJWT({ sub: 'user-1', sid: 'sid-1', tenant_id: 'tenant-1' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(ISSUER)
    .setExpirationTime('1h')
    .sign(privateKey);
}

function validatorFor(service: { getJwks: Mock }): StynxJwtValidator {
  return new StynxJwtValidator({ get: vi.fn(() => service) } as unknown as ModuleRef, OPTIONS);
}

/** Holds the next non-forced key resolution after it completes, modelling a request that loaded keys before a concurrent refresh. */
function holdNextInitialResolution(validator: StynxJwtValidator): { arm: () => void; release: () => void } {
  const internals = validator as unknown as ValidatorInternals;
  const original = internals.resolveKeys.bind(validator);
  let armed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  internals.resolveKeys = async (forceRefresh, ...rest) => {
    const hold = armed && !forceRefresh;
    if (hold) armed = false;
    const result = await original(forceRefresh, ...rest);
    if (hold) await gate;
    return result;
  };
  return { arm: () => { armed = true; }, release: () => release() };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

describe('StynxJwtValidator key-source edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Jwk) => actual.verifyJwtWithJwk(token, key));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a non-RS256 token header as malformed before loading any signing keys', async () => {
    const service = { getJwks: vi.fn() };
    const token = `${base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify({ sub: 'user-1' }))}.c2ln`;
    await expect(validatorFor(service).validate(token)).rejects.toThrow(new InvalidCredentialError('JWT is malformed'));
    expect(service.getJwks).toHaveBeenCalledTimes(0);
  });

  it('propagates a non-credential failure raised while verifying a signature', async () => {
    const { privateKey, jwk } = await keyPair('primary');
    const failure = new Error('crypto backend unavailable');
    (verifyJwtWithJwk as Mock).mockImplementation(() => { throw failure; });
    const service = { getJwks: vi.fn(async () => ({ keys: [jwk] })) };
    await expect(validatorFor(service).validate(await signedToken(privateKey, 'primary'))).rejects.toBe(failure);
    expect(service.getJwks).toHaveBeenCalledTimes(1);
  });

  it('filters null, non-object, encryption, non-RS256, and unimportable keys out of the verification set', async () => {
    const { privateKey, jwk } = await keyPair('usable');
    const { jwk: template } = await keyPair('template');
    const unimportable = { ...template, kid: 'unimportable' };
    const actualCrypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
    (createPublicKey as Mock).mockImplementation((input: { key: Jwk }) => {
      if (input.key.kid === 'unimportable') throw new TypeError('Invalid JWK RSA key');
      return actualCrypto.createPublicKey(input as never);
    });
    const candidates: unknown[] = [null, 'not-a-key', { ...template, kid: 'enc', use: 'enc' }, { ...template, kid: 'rs512', alg: 'RS512' }, unimportable];

    for (const candidate of candidates) {
      const service = { getJwks: vi.fn(async () => ({ keys: [candidate] })) };
      await expect(validatorFor(service).validate(await signedToken(privateKey, 'usable')))
        .rejects.toThrow('STYNX JWKS contains no usable verification keys');
    }

    (verifyJwtWithJwk as Mock).mockClear();
    const mixed = { getJwks: vi.fn(async () => ({ keys: [...candidates, jwk] })) };
    await expect(validatorFor(mixed).validate(await signedToken(privateKey, 'usable'))).resolves.toMatchObject({ sub: 'user-1', sid: 'sid-1', tenantId: 'tenant-1' });
    expect((verifyJwtWithJwk as Mock).mock.calls.map(([, key]) => (key as Jwk).kid)).toEqual(['usable']);
  });

  it('adopts a key set that a concurrent refresh published while a cold initial load was in flight', async () => {
    const old = await keyPair('old');
    const fresh = await keyPair('fresh');
    let releaseSecondInitial!: (value: { keys: Jwk[] }) => void;
    const service = {
      getJwks: vi.fn()
        .mockResolvedValueOnce({ keys: [old.jwk] })
        .mockImplementationOnce(() => new Promise((resolve) => { releaseSecondInitial = resolve; }))
        .mockResolvedValueOnce({ keys: [fresh.jwk] }),
    };
    const validator = validatorFor(service);
    const freshToken = await signedToken(fresh.privateKey, 'fresh');

    const first = validator.validate(freshToken);
    const second = validator.validate(freshToken);
    await expect(first).resolves.toMatchObject({ sub: 'user-1' });
    releaseSecondInitial({ keys: [old.jwk] });

    await expect(second).resolves.toMatchObject({ sub: 'user-1' });
    expect(service.getJwks).toHaveBeenCalledTimes(3);
    expect((verifyJwtWithJwk as Mock).mock.calls.at(-1)?.[1]).toMatchObject({ kid: 'fresh' });
  });

  it('reuses a newer forced-refresh key set when a request that loaded stale keys misses afterwards', async () => {
    const old = await keyPair('old');
    const fresh = await keyPair('fresh');
    const service = { getJwks: vi.fn().mockResolvedValueOnce({ keys: [old.jwk] }).mockResolvedValueOnce({ keys: [fresh.jwk] }) };
    const validator = validatorFor(service);
    const gate = holdNextInitialResolution(validator);
    await validator.validate(await signedToken(old.privateKey, 'old'));
    const freshToken = await signedToken(fresh.privateKey, 'fresh');

    gate.arm();
    const stale = validator.validate(freshToken);
    await expect(validator.validate(freshToken)).resolves.toMatchObject({ sub: 'user-1' });
    gate.release();

    await expect(stale).resolves.toMatchObject({ sub: 'user-1', sid: 'sid-1', tenantId: 'tenant-1' });
    expect(service.getJwks).toHaveBeenCalledTimes(2);
  });

  it('suppresses a stale request whose newer key set came from an earlier refresh than the latest attempt', async () => {
    const old = await keyPair('old');
    const fresh = await keyPair('fresh');
    const unknown = await keyPair('unknown');
    const refreshFailure = new Error('JWKS refresh unavailable');
    const service = {
      getJwks: vi.fn()
        .mockResolvedValueOnce({ keys: [old.jwk] })
        .mockResolvedValueOnce({ keys: [fresh.jwk] })
        .mockRejectedValueOnce(refreshFailure),
    };
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const validator = validatorFor(service);
    const gate = holdNextInitialResolution(validator);
    await validator.validate(await signedToken(old.privateKey, 'old'));
    const freshToken = await signedToken(fresh.privateKey, 'fresh');

    gate.arm();
    const stale = validator.validate(freshToken);
    await expect(validator.validate(freshToken)).resolves.toMatchObject({ sub: 'user-1' });
    now.mockReturnValue(1_030_001);
    await expect(validator.validate(await signedToken(unknown.privateKey, 'unknown'))).rejects.toBe(refreshFailure);
    gate.release();

    await expect(stale).rejects.toThrow('STYNX JWKS refresh suppressed after signature miss');
    expect(service.getJwks).toHaveBeenCalledTimes(3);
  });

  it('keeps a newer in-flight refresh registered when an overlapping older refresh settles first', async () => {
    const old = await keyPair('old');
    const fresh = await keyPair('fresh');
    const unknown = await keyPair('unknown');
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    let releaseOuter!: (value: { keys: Jwk[] }) => void;
    let releaseInner!: (value: { keys: Jwk[] }) => void;
    let inner: Promise<KeySet> | undefined;
    const service: { getJwks: Mock } = { getJwks: vi.fn() };
    const validator = validatorFor(service);
    const internals = validator as unknown as ValidatorInternals;
    service.getJwks
      .mockResolvedValueOnce({ keys: [old.jwk] })
      .mockImplementationOnce(() => {
        // Re-enter the refresh path after the outer refresh has started but before it registers as in flight.
        now.mockReturnValue(2_030_001);
        inner = internals.refreshAfterSignatureMiss({ source: service, version: 1, keys: [old.jwk], expiresAt: 0 }, service);
        return new Promise((resolve) => { releaseOuter = resolve; });
      })
      .mockImplementationOnce(() => new Promise((resolve) => { releaseInner = resolve; }));

    await validator.validate(await signedToken(old.privateKey, 'old'));
    const outer = validator.validate(await signedToken(fresh.privateKey, 'fresh'));
    await flushMicrotasks();
    releaseInner({ keys: [fresh.jwk] });
    await expect(inner).resolves.toMatchObject({ version: 2, forcedRefreshStartedAt: 2_030_001 });

    let joinedSettled = false;
    const joined = validator.validate(await signedToken(unknown.privateKey, 'unknown')).finally(() => { joinedSettled = true; });
    await flushMicrotasks();
    expect(joinedSettled).toBe(false);
    expect(service.getJwks).toHaveBeenCalledTimes(3);

    releaseOuter({ keys: [fresh.jwk] });
    await expect(outer).resolves.toMatchObject({ sub: 'user-1' });
    await expect(joined).rejects.toThrow(new InvalidCredentialError('STYNX access token verification failed'));
    expect(service.getJwks).toHaveBeenCalledTimes(3);
  });
});
