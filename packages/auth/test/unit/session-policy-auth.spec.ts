import type { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { SessionService, type SessionBundle } from '@stynx-nyx/sessions';
import { StynxAuthService } from '../../src/auth.service';

// UPS-SES-02: Cognito's validated claims are the sole factor source.
const bundle: SessionBundle = {
  sid: 'new-sid', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: '2026-09-28T00:00:00Z', idleExpiresAt: '2026-09-27T01:00:00Z',
  accessTokenExpiresAt: '2026-09-27T00:10:00Z',
};

function harness() {
  const validator = { validateAccessToken: vi.fn().mockResolvedValue({ sub: 'cognito', email: 'u@test.example', claims: { sub: 'cognito', amr: ['pwd', 'mfa'] } }) };
  const sessions = { create: vi.fn().mockResolvedValue(bundle), exchange: vi.fn().mockResolvedValue({ bundle, revokedSessionId: 'old-sid' }), revoke: vi.fn().mockResolvedValue(true) };
  const cache = { prime: vi.fn().mockResolvedValue(undefined), invalidateSid: vi.fn().mockResolvedValue(undefined) };
  const queries = { resolveForUser: vi.fn().mockResolvedValue({ membershipId: 'membership', permissions: [], hash: 'hash', generation: 1 }) };
  const hash = { ensureMembershipHash: vi.fn().mockResolvedValue(undefined) };
  const database = {
    withSystemContext: vi.fn((_reason: string, fn: () => Promise<unknown>) => fn()),
    tx: vi.fn(async (fn: (trx: { query: () => Promise<unknown> }) => Promise<unknown>) => fn({ query: async () => ({ rows: [{ id: 'user', email: 'u@test.example', external_subject: 'cognito' }] }) })),
  };
  const moduleRef = { get: vi.fn((token: unknown) => {
    if (token === SessionService) return sessions;
    if (token === RequestContextMutator) return undefined;
    if (token === RequestContext) return undefined;
    if (typeof token === 'function' && token.name === 'Database') return database;
    return undefined;
  }) } as unknown as ModuleRef;
  const service = new StynxAuthService(moduleRef, cache as never, queries as never, hash as never, validator as never);
  return { service, validator, sessions, cache };
}

describe('UPS-SES-02 auth factor and switch boundary', () => {
  it('passes only validator claims as factor evidence, never client device metadata', async () => {
    const { service, sessions } = harness();
    await service.exchangeCognitoToken('cognito-token', 'tenant', { amr: 'spoofed', acr: 'spoofed' });
    expect(sessions.create).toHaveBeenCalledWith(
      'user', 'tenant', 'cognito',
      { amr: 'spoofed', acr: 'spoofed' },
      expect.objectContaining({ verifiedFactorClaims: expect.objectContaining({ amr: ['pwd', 'mfa'] }) }),
    );
  });

  it('uses actor.sid as the authenticated prior session and invalidates it after commit', async () => {
    const { service, sessions, cache } = harness();
    await service.switchTenant({ sid: 'old-sid', sub: 'user', cognitoSub: 'cognito' }, 'next-tenant');
    expect(sessions.create).toHaveBeenCalledWith(
      'user', 'next-tenant', 'cognito', {},
      expect.objectContaining({ priorSessionId: 'old-sid' }),
    );
    expect(cache.invalidateSid).toHaveBeenCalledWith('old-sid');
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('does not revoke or invalidate the prior sid when target policy denies creation', async () => {
    const { service, sessions, cache } = harness();
    sessions.create.mockRejectedValueOnce(new Error('SESSION_CONFLICT'));
    await expect(service.switchTenant({ sid: 'old-sid', sub: 'user' }, 'occupied')).rejects.toThrow('SESSION_CONFLICT');
    expect(sessions.revoke).not.toHaveBeenCalled();
    expect(cache.invalidateSid).not.toHaveBeenCalledWith('old-sid');
  });
});
