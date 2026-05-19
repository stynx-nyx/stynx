import { base64UrlDecode, base64UrlEncode, computePermissionsHash, decodeJwtClaims, expandPermissionWildcards, headerToString, verifyJwtWithJwk } from '../../src/utils';

describe('auth utils', () => {
  it('normalizes permissions before hashing', () => {
    expect(computePermissionsHash([' b ', 'a', '', 'a'])).toBe(computePermissionsHash(['a', 'b']));
    expect(computePermissionsHash(['a', 'b'])).not.toBe(computePermissionsHash(['a']));
    expect(computePermissionsHash(['ab', 'c'])).not.toBe(computePermissionsHash(['a', 'bc']));
  });

  it('expands wildcard grants deterministically and preserves explicit grants', () => {
    expect(
      expandPermissionWildcards(
        [' document:*:* ', 'document:read:*', '', 'user:view'],
        ['document:read:*', 'document:write:*', 'user:view', 'other'],
      ),
    ).toEqual(['document:*:*', 'document:read:*', 'document:write:*', 'user:view']);
  });

  it('converts supported header forms to strings', () => {
    expect(headerToString('tenant-1')).toBe('tenant-1');
    expect(headerToString(['tenant-2'])).toBe('tenant-2');
    expect(headerToString([1, 2, 3])).toBeUndefined();
    expect(headerToString(null)).toBeUndefined();
  });

  it('round-trips base64url values without padding and rejects malformed JWT shapes', () => {
    const encoded = base64UrlEncode('{"sub":"user-1"}');

    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(base64UrlDecode(encoded)).toBe('{"sub":"user-1"}');
    expect(base64UrlEncode(Buffer.from([251, 255]))).toBe('-_8');
    expect(base64UrlDecode('eyJhIjoxfQ')).toBe('{"a":1}');
    expect(base64UrlDecode('eyJhIjoxfQ==')).toBe('{"a":1}');
    expect(base64UrlDecode('8J-YgA')).toBe('\uD83D\uDE00');
    expect(base64UrlDecode('4KC_')).toBe('\u083F');
    expect(() => decodeJwtClaims('header.payload')).toThrow('JWT is malformed');
  });

  it('decodes JWT claims and expands wildcard grants with regex metacharacters literally', () => {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256' }));
    const payload = base64UrlEncode(JSON.stringify({ sub: 'user-1', tenant_id: 'tenant-1' }));
    const signature = base64UrlEncode('signature');

    expect(decodeJwtClaims(`${header}.${payload}.${signature}`)).toMatchObject({
      header: { alg: 'RS256' },
      payload: { sub: 'user-1', tenant_id: 'tenant-1' },
      signingInput: `${header}.${payload}`,
    });
    expect(
      expandPermissionWildcards(
        ['billing.invoice+*'],
        ['billing.invoice+read', 'billingXinvoice+read', 'billing.invoice-write'],
      ),
    ).toEqual(['billing.invoice+*', 'billing.invoice+read']);
  });

  it('verifies a valid RS256 JWT with the supplied JWK', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKey);

    await expect(verifyJwtWithJwk(token, await exportJWK(publicKey))).toMatchObject({
      sub: 'user-1',
    });
  });

  it('deduplicates trimmed wildcard universes and keeps unmatched grants explicit', () => {
    expect(
      expandPermissionWildcards(
        [' storage:read:* ', 'storage:admin:*', ''],
        [' storage:read:file ', 'storage:read:file', '', 'storage:write:file'],
      ),
    ).toEqual(['storage:admin:*', 'storage:read:*', 'storage:read:file']);
    expect(expandPermissionWildcards(['plain:grant'], ['plain:grant', 'plain:other'])).toEqual(['plain:grant']);
    expect(expandPermissionWildcards(['alpha:*'], [' alpha:read ', 'alpha:write'])).toEqual([
      'alpha:*',
      'alpha:read',
      'alpha:write',
    ]);
  });
});
