import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import { CognitoTokenVerifier } from '../../src/cognito-token-verifier.js';

const issuer = 'https://auth-boundary.example.invalid';
function authorization(token: unknown) {
  const tail = {
    trim() {
      expect(this).toBe(tail);
      return token;
    },
  };
  const header = {
    startsWith(prefix: string) {
      expect(this).toBe(header);
      expect(prefix).toBe('Bearer ');
      return true;
    },
    slice(index: number) {
      expect(this).toBe(header);
      expect(index).toBe(7);
      return tail;
    },
  };
  return header;
}

afterEach(() => vi.unstubAllGlobals());

describe('Cognito raw authorization and byte token boundaries', () => {
  it('verifies genuine locally signed Uint8Array, Buffer and subclass tokens without replacing them', async () => {
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const keys = await generateKeyPair('RS256');
    const jwk = await exportJWK(keys.publicKey);
    const jwt = await new SignJWT({ sub: 'byte-user' })
      .setProtectedHeader({ alg: 'RS256', kid: 'local-byte-key' })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    const fetch = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe(`${issuer}/.well-known/jwks.json`);
      return new Response(
        JSON.stringify({ keys: [{ ...jwk, kid: 'local-byte-key', alg: 'RS256', use: 'sig' }] }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    class ByteToken extends Uint8Array {}
    for (const token of [
      new TextEncoder().encode(jwt),
      Buffer.from(jwt),
      new ByteToken(new TextEncoder().encode(jwt)),
    ]) {
      const result = await new CognitoTokenVerifier({ issuer }).verifyAuthorizationHeader(
        authorization(token),
      );
      expect(result.token).toBe(token);
      expect(result.principal.id).toBe('byte-user');
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('preserves native byte-proxy, cross-realm and revoked-proxy refusals before fetch', async () => {
    const fetch = vi.fn(() => {
      throw new Error('unexpected fetch');
    });
    vi.stubGlobal('fetch', fetch);
    const bytes = new TextEncoder().encode('header.payload.signature');
    const revoked = Proxy.revocable(bytes, {});
    revoked.revoke();
    const cases = [
      {
        token: new Proxy(bytes, {}),
        type: TypeError,
        message:
          'The "list" argument must be an instance of SharedArrayBuffer, ArrayBuffer or ArrayBufferView.',
      },
      {
        token: runInNewContext('Uint8Array.from(bytes)', { bytes: [...bytes] }),
        type: InvalidCredentialError,
        message: 'Compact JWS must be a string or Uint8Array',
      },
      {
        token: revoked.proxy,
        type: TypeError,
        message: "Cannot perform 'getPrototypeOf' on a proxy that has been revoked",
      },
    ];
    for (const { token, type, message } of cases) {
      const result = new CognitoTokenVerifier({ issuer }).verifyAuthorizationHeader(
        authorization(token),
      );
      await expect(result).rejects.toBeInstanceOf(type);
      await expect(result).rejects.toHaveProperty('message', message);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'slice noncallable',
      header: { startsWith: () => true, slice: 3 },
      message: 'authorization.slice is not a function',
    },
    {
      name: 'trim noncallable',
      header: { startsWith: () => true, slice: () => ({ trim: 3 }) },
      message: 'authorization.slice(...).trim is not a function',
    },
    {
      name: 'null trim receiver',
      header: { startsWith: () => true, slice: () => null },
      message: "Cannot read properties of null (reading 'trim')",
    },
    {
      name: 'undefined trim receiver',
      header: { startsWith: () => true, slice: () => undefined },
      message: "Cannot read properties of undefined (reading 'trim')",
    },
    {
      name: 'startsWith class',
      header: { startsWith: class Starts {} },
      message: "Class constructor Starts cannot be invoked without 'new'",
    },
    {
      name: 'slice class',
      header: { startsWith: () => true, slice: class Slice {} },
      message: "Class constructor Slice cannot be invoked without 'new'",
    },
    {
      name: 'trim class',
      header: { startsWith: () => true, slice: () => ({ trim: class Trim {} }) },
      message: "Class constructor Trim cannot be invoked without 'new'",
    },
  ])('preserves $name native error before fetch', async ({ header, message }) => {
    const fetch = vi.fn(() => {
      throw new Error('unexpected fetch');
    });
    vi.stubGlobal('fetch', fetch);
    const result = new CognitoTokenVerifier({ issuer }).verifyAuthorizationHeader(header);
    await expect(result).rejects.toBeInstanceOf(TypeError);
    await expect(result).rejects.toHaveProperty('message', message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves revoked callable failure', async () => {
    const callable = Proxy.revocable(() => true, {});
    callable.revoke();
    const result = new CognitoTokenVerifier({ issuer }).verifyAuthorizationHeader({
      startsWith: callable.proxy,
    });
    await expect(result).rejects.toBeInstanceOf(TypeError);
    await expect(result).rejects.toHaveProperty(
      'message',
      "Cannot perform 'apply' on a proxy that has been revoked",
    );
  });

  it('reads methods once with their original receiver and propagates issuer failure before token refusal', async () => {
    const order: string[] = [];
    const sentinel = new Error('issuer sentinel');
    const options = {
      jwksUri: `${issuer}/.well-known/jwks.json`,
      get issuer() {
        order.push('issuer');
        throw sentinel;
      },
    };
    const tail = {
      get trim() {
        order.push('get trim');
        return function (this: unknown) {
          expect(this).toBe(tail);
          order.push('trim');
          return 3;
        };
      },
    };
    const header = {
      get startsWith() {
        order.push('get startsWith');
        return function (this: unknown, prefix: string) {
          expect(this).toBe(header);
          expect(prefix).toBe('Bearer ');
          order.push('startsWith');
          return true;
        };
      },
      get slice() {
        order.push('get slice');
        return function (this: unknown, index: number) {
          expect(this).toBe(header);
          expect(index).toBe(7);
          order.push('slice');
          return tail;
        };
      },
    };
    const fetch = vi.fn(() => {
      throw new Error('unexpected fetch');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(new CognitoTokenVerifier(options).verifyAuthorizationHeader(header)).rejects.toBe(
      sentinel,
    );
    expect(order).toEqual([
      'get startsWith',
      'startsWith',
      'get slice',
      'slice',
      'get trim',
      'trim',
      'issuer',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
