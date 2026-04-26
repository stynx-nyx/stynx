import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SessionJwtSigningService, resolveSessionsOptions, type StynxSessionSigningKeySet } from '@stynx/sessions';
import type { MintedTestSession, MintTestSessionInput } from './types';

function createDefaultKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'stynx-testing-key',
    keys: [
      {
        kid: 'stynx-testing-key',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

export async function mintTestSession(input: MintTestSessionInput): Promise<MintedTestSession> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('mintTestSession is only available when NODE_ENV === "test"');
  }

  const keySet = input.keySet ?? createDefaultKeySet();
  const signingService = new SessionJwtSigningService(
    resolveSessionsOptions({
      issuer: input.issuer ?? 'https://stynx.testing.local',
      ...(input.audience ? { audience: input.audience } : {}),
      redis: { url: 'redis://127.0.0.1:6379' },
      jwt: { keySet },
    }),
  );

  const sid = input.sid ?? randomUUID();
  const accessToken = await signingService.signAccessToken(
    {
      sid,
      userId: input.userId,
      tenantId: input.tenantId,
      cognitoSub: input.cognitoSub ?? input.userId,
      refreshFamilyId: randomUUID(),
      refreshTokenHash: randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastTouchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...(input.perms && input.perms.length > 0 ? { permsHash: input.perms.sort().join('|') } : {}),
    },
    new Date(),
  );

  return {
    token: accessToken.token,
    sid,
    jwks: await signingService.getJwks(),
  };
}
