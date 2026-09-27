import { generateKeyPairSync } from 'node:crypto';
import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionService } from '../../src/session.service';
import { RefreshTokenReuseDetectedError, SessionConflictError, StrongFactorRequiredError } from '../../src/errors';
import { resolveSessionsOptions, type SessionMirror, type SessionMirrorEntry, type StynxSessionsModuleOptions } from '../../src/types';

// UPS-SES-01/02: policy is evaluated against active records in the target tenant.
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keySet = { currentKid: 'policy-test', keys: [{
  kid: 'policy-test',
  publicKeyPem: keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  privateKeyPem: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}] };

function harness(policy: Record<string, unknown> = {}, clock?: () => Date) {
  const options = resolveSessionsOptions({
    issuer: 'https://sessions.test',
    redis: { url: 'redis://127.0.0.1:6379' },
    jwt: { keySet },
    ...(clock ? { clock } : {}),
    ...policy,
  } as StynxSessionsModuleOptions);
  const store = new InMemorySessionStore();
  const entries: SessionMirrorEntry[] = [];
  const mirror: SessionMirror = { append: async (entry) => { entries.push(entry); } };
  const service = new SessionService(options, store, new SessionJwtSigningService(options), mirror);
  return { service, store, entries };
}

describe('UPS-SES-01 single-session policy', () => {
  it('keeps the default off: two active sessions in one tenant', async () => {
    const { service } = harness();
    const first = await service.create('u', 't', 'c');
    const second = await service.create('u', 't', 'c');
    expect(second.sid).not.toBe(first.sid);
    await expect(service.get(first.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(service.get(second.sid)).resolves.toMatchObject({ status: 'active' });
  });

  it('revoke-existing invalidates every target-tenant session and refresh token after commit', async () => {
    const { service, store, entries } = harness({ singleSession: { mode: 'revoke-existing' } });
    const otherTenant = await service.create('u', 'other', 'c');
    const first = await service.create('u', 't', 'c');
    const second = await service.create('u', 't', 'c');
    await expect(service.get(first.sid)).resolves.toBe(null);
    await expect(service.refresh(first.refreshToken)).rejects.toThrow(RefreshTokenReuseDetectedError);
    await expect(service.get(second.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(service.get(otherTenant.sid)).resolves.toMatchObject({ status: 'active' });
    expect(entries).toContainEqual(expect.objectContaining({ sid: first.sid, status: 'revoked' }));
    expect(store.invalidations).toContain('u:t');
    expect(store.invalidations).not.toContain('u:other');
  });

  it('reject-new leaves both records and refresh lookups untouched', async () => {
    const { service, store, entries } = harness({ singleSession: { mode: 'reject-new' } });
    const first = await service.create('u', 't', 'c');
    const count = entries.length;
    await expect(service.create('u', 't', 'c')).rejects.toThrow(SessionConflictError);
    await expect(service.get(first.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(service.refresh(first.refreshToken)).resolves.toMatchObject({ sid: first.sid });
    expect(entries).toHaveLength(count);
    expect(store.invalidations).toEqual([]);
    await expect(service.create('u', 'other', 'c')).resolves.toMatchObject({ sid: expect.any(String) });
  });

  it('does not treat an idle-expired record as a conflict', async () => {
    let now = new Date('2026-09-27T12:00:00Z');
    const { service } = harness({ singleSession: { mode: 'reject-new' }, timeouts: { idleSeconds: 2 } }, () => now);
    const first = await service.create('u', 't', 'c');
    now = new Date('2026-09-27T12:00:03Z');
    const second = await service.create('u', 't', 'c');
    expect(second.sid).not.toBe(first.sid);
    await expect(service.get(second.sid)).resolves.toMatchObject({ status: 'active' });
  });

  it.each(['revoke-existing', 'reject-new'])('switches the prior sid atomically in %s mode', async (mode) => {
    const { service, entries } = harness({ singleSession: { mode } });
    const prior = await service.create('u', 't', 'c');
    const switched = await service.exchange({ sessionId: prior.sid, actorUserId: 'u', newTenantId: 't' });
    expect(switched.revokedSessionId).toBe(prior.sid);
    await expect(service.get(prior.sid)).resolves.toBe(null);
    await expect(service.refresh(prior.refreshToken)).rejects.toThrow(RefreshTokenReuseDetectedError);
    await expect(service.get(switched.bundle.sid)).resolves.toMatchObject({ status: 'active' });
    expect(entries).toContainEqual(expect.objectContaining({ sid: prior.sid, status: 'revoked' }));
  });

  it('keeps the prior active on a target-tenant conflict during direct exchange', async () => {
    const { service } = harness({ singleSession: { mode: 'reject-new' } });
    const prior = await service.create('u', 'source', 'c');
    const target = await service.create('u', 'target', 'c');
    await expect(service.exchange({ sessionId: prior.sid, actorUserId: 'u', newTenantId: 'target' })).rejects.toThrow(SessionConflictError);
    await expect(service.get(prior.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(service.get(target.sid)).resolves.toMatchObject({ status: 'active' });
  });

  it('preserves the prior record when the replacement write fails', async () => {
    const { service, store } = harness({ singleSession: { mode: 'revoke-existing' } });
    const prior = await service.create('u', 'source', 'c');
    vi.spyOn(store, 'createSession').mockRejectedValueOnce(new Error('write failed'));
    (store as unknown as { createWithPolicy: () => Promise<never> }).createWithPolicy = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(service.exchange({ sessionId: prior.sid, actorUserId: 'u', newTenantId: 'target' })).rejects.toThrow('write failed');
    await expect(service.get(prior.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(service.refresh(prior.refreshToken)).resolves.toMatchObject({ sid: prior.sid });
  });
});

describe('UPS-SES-02 verified strong factor', () => {
  it.each([
    ['amr', ['pwd', 'MFA'], 'mfa'],
    ['acr', 'urn:loa:1, HIGH', 'high'],
    ['verified_level', 'low\tHIGH', 'high'],
  ])('accepts a verified %s claim in array or delimited string form', async (name, value, accepted) => {
    const { service } = harness({ strongFactor: { claimName: name, acceptedValues: [accepted] } });
    const created = await service.create('u', 't', 'c', {}, { verifiedFactorClaims: { [name]: value } } as never);
    const record = await service.get(created.sid);
    expect(record?.strongFactorVerifiedAt).toEqual(expect.any(String));
    expect(record).not.toHaveProperty('verifiedFactorClaims');
    expect(JSON.stringify(record)).not.toContain('MFA');
  });

  it.each([undefined, 123, { value: 'mfa' }, 'password', ['pwd', 42]])('rejects unverified or malformed factor %s before a write', async (value) => {
    const { service, store, entries } = harness({ strongFactor: { acceptedValues: ['mfa'] } });
    await expect(service.create('u', 't', 'c', { amr: 'mfa' }, { verifiedFactorClaims: { amr: value } } as never)).rejects.toThrow(StrongFactorRequiredError);
    expect(store.sessionCount()).toBe(0);
    expect(entries).toEqual([]);
  });

  it('does not accept blank configured values or empty tokens from a whitespace-padded claim', async () => {
    const { service, store, entries } = harness({ strongFactor: { acceptedValues: ['', 'mfa'] } });
    await expect(service.create('u', 't', 'c', {}, { verifiedFactorClaims: { amr: ' pwd ' } } as never))
      .rejects.toBeInstanceOf(StrongFactorRequiredError);
    expect(store.sessionCount()).toBe(0);
    expect(entries).toEqual([]);
  });

  it('accepts a whitespace-padded valid factor claim', async () => {
    const { service } = harness({ strongFactor: { acceptedValues: ['mfa'] } });
    const created = await service.create('u', 't', 'c', {}, { verifiedFactorClaims: { amr: ' MFA ' } } as never);
    await expect(service.get(created.sid)).resolves.toMatchObject({ strongFactorVerifiedAt: expect.any(String) });
  });

  it('carries the original verified timestamp across two switches', async () => {
    const { service } = harness({ strongFactor: { acceptedValues: ['mfa'] } });
    const first = await service.create('u', 't1', 'c', {}, { verifiedFactorClaims: { amr: 'mfa' } } as never);
    const marker = (await service.get(first.sid) as { strongFactorVerifiedAt?: string }).strongFactorVerifiedAt;
    const second = await service.exchange({ sessionId: first.sid, actorUserId: 'u', newTenantId: 't2' });
    const third = await service.exchange({ sessionId: second.bundle.sid, actorUserId: 'u', newTenantId: 't3' });
    expect((await service.get(second.bundle.sid))).toBe(null);
    expect((await service.get(third.bundle.sid) as { strongFactorVerifiedAt?: string }).strongFactorVerifiedAt).toBe(marker);
  });

  it('denies a switch from an older session without a verified marker before revoking it', async () => {
    const store = new InMemorySessionStore();
    const oldOptions = resolveSessionsOptions({ issuer: 'https://sessions.test', redis: { url: 'redis://127.0.0.1:6379' }, jwt: { keySet } });
    const mirror: SessionMirror = { append: async () => undefined };
    const oldService = new SessionService(oldOptions, store, new SessionJwtSigningService(oldOptions), mirror);
    const old = await oldService.create('u', 't1', 'c');
    const strictOptions = resolveSessionsOptions({
      issuer: 'https://sessions.test', redis: { url: 'redis://127.0.0.1:6379' }, jwt: { keySet },
      strongFactor: { acceptedValues: ['mfa'] },
    } as StynxSessionsModuleOptions);
    const strictService = new SessionService(strictOptions, store, new SessionJwtSigningService(strictOptions), mirror);
    await expect(strictService.exchange({ sessionId: old.sid, actorUserId: 'u', newTenantId: 't2' })).rejects.toThrow(StrongFactorRequiredError);
    await expect(oldService.get(old.sid)).resolves.toMatchObject({ status: 'active' });
  });

  it('allows switching an older session when strong factor is disabled', async () => {
    const { service } = harness();
    const first = await service.create('u', 't1', 'c');
    await expect(service.exchange({ sessionId: first.sid, actorUserId: 'u', newTenantId: 't2' })).resolves.toMatchObject({ revokedSessionId: first.sid });
  });
});
