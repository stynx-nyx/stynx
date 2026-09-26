import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { InvalidCredentialError } from '@stynx-nyx/contracts';

export { headerToString } from '@stynx-nyx/contracts';

export function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function decodeJwtClaims(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
  signingInput: string;
} {
  const segments = token.split('.');
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (segments.length !== 3 || !encodedHeader || !encodedPayload || !encodedSignature ||
    !segments.every((segment) => /^[A-Za-z0-9_-]+$/u.test(segment))) {
    throw new InvalidCredentialError('JWT is malformed');
  }

  const signatureNormalized = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
  const signaturePadded = signatureNormalized.padEnd(Math.ceil(signatureNormalized.length / 4) * 4, '=');

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>;
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;
    if (!header || typeof header !== 'object' || Array.isArray(header) ||
      !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('JWT is malformed');
    }
  } catch {
    throw new InvalidCredentialError('JWT is malformed');
  }
  return {
    header,
    payload,
    signature: Buffer.from(signaturePadded, 'base64'),
    signingInput: `${encodedHeader}.${encodedPayload}`,
  };
}

export function verifyJwtWithJwk(
  token: string,
  jwk: Record<string, string | undefined>,
): Record<string, unknown> {
  const decoded = decodeJwtClaims(token);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(decoded.signingInput),
    key,
    decoded.signature,
  );
  if (!valid) {
    throw new InvalidCredentialError('JWT signature verification failed');
  }
  return decoded.payload;
}

export function computePermissionsHash(permissions: string[]): string {
  const normalized = [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))].sort();
  return createHash('sha256').update(normalized.join('\n')).digest('hex').slice(0, 16);
}

export function expandPermissionWildcards(grants: string[], universe: string[]): string[] {
  const expanded = new Set<string>();
  const normalizedUniverse = [...new Set(universe.map((value) => value.trim()).filter(Boolean))];

  for (const grant of grants.map((value) => value.trim()).filter(Boolean)) {
    expanded.add(grant);
    if (!grant.includes('*')) {
      continue;
    }

    const pattern = new RegExp(`^${grant.split('*').map(escapeRegex).join('.*')}$`, 'u');
    for (const permission of normalizedUniverse) {
      if (pattern.test(permission)) {
        expanded.add(permission);
      }
    }
  }

  return [...expanded].sort();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
