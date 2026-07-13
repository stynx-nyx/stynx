import { describe, expect, it, vi } from 'vitest';
import {
  DeterministicSessionProviderFake,
  InMemorySessionRegistry,
  SessionControlError,
  SessionControlService,
  type SessionAuditEvent,
  type SessionControlCapabilities,
  type SessionGuarantee,
  type SessionRegistration,
  type TrustedSessionContext,
} from '../../src/control';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-7000-8000-000000000002';
const currentSid = '00000000-0000-4000-8000-000000000011';
const otherSid = '00000000-0000-7000-8000-000000000012';
const operationId = '00000000-0000-4000-8000-000000000021';
const none: SessionGuarantee = {
  kind: 'none',
  effectiveBy: null,
  propagationBoundSeconds: null,
  accessTokenExpiresAt: null,
};
const capabilities: SessionControlCapabilities = {
  stableSessionIdentity: true,
  listScopes: ['tenant'],
  controlScopes: ['tenant'],
  revokeOne: true,
  revokeOthers: true,
  revokeAll: true,
  localEnforcement: 'none',
  providerConfirmation: true,
  retryReconciliation: true,
  identityGlobalAuthority: false,
  sharedAnchorBlastRadius: false,
};
const context = (overrides: Partial<TrustedSessionContext> = {}): TrustedSessionContext => ({
  actorId: 'subject-a',
  subjectId: 'subject-a',
  tenantId: tenantA,
  currentSessionId: currentSid,
  authorities: new Set(['sessions:self']),
  requestId: 'request-1',
  ...overrides,
});
const registration = (overrides: Partial<SessionRegistration> = {}): SessionRegistration => ({
  sid: currentSid,
  anchorId: '00000000-0000-4000-8000-000000000031',
  tenantId: tenantA,
  subjectId: 'subject-a',
  state: 'active',
  provider: 'fixture',
  capabilities,
  guarantee: none,
  metadata: { deviceLabel: '<img src=x onerror=alert(1)>', userAgentFamily: 'Firefox' },
  createdAt: '2026-07-13T00:00:00.000Z',
  lastSeenAt: null,
  expiresAt: null,
  terminalAt: null,
  sharedAnchor: false,
  ...overrides,
});

async function harness(rows: SessionRegistration[], outcomes: ConstructorParameters<typeof DeterministicSessionProviderFake>[0] = []) {
  const registry = new InMemorySessionRegistry();
  for (const row of rows) await registry.register(row);
  const provider = new DeterministicSessionProviderFake(outcomes, capabilities);
  const events: SessionAuditEvent[] = [];
  const service = new SessionControlService(registry, provider, { write: (event) => events.push(event) }, () => new Date('2026-07-13T00:00:00.000Z'));
  return { registry, provider, events, service };
}

describe('R21 session-control accepted contract', () => {
  it('lists only the trusted tenant and subject, marks current from trusted context, and exposes no secret fields', async () => {
    const { service } = await harness([
      registration(),
      registration({ sid: otherSid, tenantId: tenantB }),
      registration({ sid: '00000000-0000-4000-8000-000000000013', subjectId: 'subject-b' }),
    ]);
    const result = await service.list(context());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sid: currentSid, current: true, tenantId: tenantA });
    expect(JSON.stringify(result)).not.toMatch(/anchorId|subjectId|token|handle|fingerprint|lastIp/i);
  });

  it('enforces self, tenant-admin, identity-admin and shared-anchor authority independently', async () => {
    const shared = registration({ sharedAnchor: true });
    const { service } = await harness([shared]);
    await expect(service.list(context({ subjectId: 'subject-b' }), { subjectId: 'subject-b' }))
      .rejects.toMatchObject({ code: 'SESSION_FORBIDDEN', status: 403 });
    await expect(service.list(context(), { scope: 'identity' }))
      .rejects.toMatchObject({ code: 'SESSION_FORBIDDEN', status: 403 });
    await expect(service.execute(context(), { action: 'revoke-one', operationId, targetSessionId: currentSid }))
      .rejects.toMatchObject({ code: 'SESSION_FORBIDDEN', status: 403 });
  });

  it('implements current, one, others, and all target sets exactly', async () => {
    for (const [action, expected] of [
      ['logout-current', [currentSid]],
      ['revoke-one', [otherSid]],
      ['revoke-others', [otherSid]],
      ['revoke-all', [currentSid, otherSid]],
    ] as const) {
      const { service } = await harness([registration(), registration({ sid: otherSid })]);
      const result = await service.execute(context(), {
        action,
        operationId,
        ...(action === 'revoke-one' ? { targetSessionId: otherSid } : {}),
      });
      expect(result.results.map((item) => item.sid).sort()).toEqual([...expected].sort());
    }
  });

  it('returns the same result and performs one provider effect for concurrent identical requests', async () => {
    const { service, provider } = await harness([registration()]);
    const command = { action: 'revoke-one' as const, operationId, targetSessionId: currentSid };
    const [a, b] = await Promise.all([service.execute(context(), command), service.execute(context(), command)]);
    expect(a).toEqual(b);
    expect(provider.calls).toHaveLength(1);
  });

  it('rejects operation-id reuse with changed normalized input', async () => {
    const { service } = await harness([registration(), registration({ sid: otherSid })]);
    await service.execute(context(), { action: 'revoke-one', operationId, targetSessionId: currentSid });
    await expect(service.execute(context(), { action: 'revoke-one', operationId, targetSessionId: otherSid }))
      .rejects.toMatchObject({ code: 'SESSION_IDEMPOTENCY_CONFLICT', status: 409 });
  });

  it('persists provider outage as pending, retries on schedule, and ends failed without claiming revocation', async () => {
    const registry = new InMemorySessionRegistry();
    await registry.register(registration());
    const provider = { provider: 'down', capabilities: async () => capabilities, revoke: vi.fn(async () => { throw new Error('secret-token-value'); }) };
    let now = new Date('2026-07-13T00:00:00.000Z');
    const service = new SessionControlService(registry, provider, undefined, () => now);
    const result = await service.execute(context(), { action: 'revoke-one', operationId, targetSessionId: currentSid });
    expect(result.status).toBe('pending');
    for (const seconds of [5, 30, 120, 600, 1800, 7200]) {
      now = new Date(now.getTime() + seconds * 1000);
      await service.reconcile(context());
    }
    const final = await service.getOperation(context(), operationId);
    expect(final.status).toBe('failed');
    const [stored] = await registry.list(context(), { subjectId: 'subject-a' });
    expect(stored?.state).toBe('failed');
    expect(JSON.stringify(final)).not.toContain('secret-token-value');
  });

  it('rejects a provider guarantee that exceeds the normative bounded-local range', async () => {
    const { service } = await harness([registration()], [{
      status: 'revoked',
      guarantee: {
        kind: 'bounded_local',
        effectiveBy: '2026-07-13T00:01:00.000Z',
        propagationBoundSeconds: 60,
        accessTokenExpiresAt: null,
      },
    }]);
    await expect(service.execute(context(), {
      action: 'revoke-one', operationId, targetSessionId: currentSid,
    })).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('keeps itemized partial outcomes truthful and never collapses them to revoked', async () => {
    const { service } = await harness(
      [registration(), registration({ sid: otherSid })],
      [
        { status: 'revoked', guarantee: { ...none, kind: 'provider_confirmed' } },
        { status: 'pending', guarantee: none, errorCode: 'SESSION_OPERATION_PENDING' },
      ],
    );
    const result = await service.execute(context(), { action: 'revoke-all', operationId });
    expect(result.status).toBe('pending');
    expect(result.results.map((item) => item.status)).toEqual(['revoked', 'pending']);
  });

  it('purges terminal metadata before a cutoff and erases only the requested tenant subject', async () => {
    const { registry } = await harness([
      registration({ terminalAt: '2026-06-01T00:00:00.000Z', state: 'revoked' }),
      registration({ sid: otherSid, tenantId: tenantB, terminalAt: '2026-06-01T00:00:00.000Z', state: 'revoked' }),
    ]);
    expect(await registry.eraseSubject(tenantA, 'subject-a')).toBe(1);
    expect(await registry.purgeTerminal('2026-06-13T00:00:00.000Z')).toBe(1);
  });

  it('accepts general RFC UUID versions while rejecting malformed identifiers', async () => {
    const { service } = await harness([registration({ sid: otherSid })]);
    await expect(
      service.execute(context(), { action: 'revoke-one', operationId, targetSessionId: otherSid }),
    ).resolves.toEqual(expect.objectContaining({ action: 'revoke-one', operationId }));
    await expect(service.execute(context(), { action: 'revoke-one', operationId: 'not-a-uuid', targetSessionId: otherSid }))
      .rejects.toBeInstanceOf(SessionControlError);
  });
});
