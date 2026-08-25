import {
  COGNITO_COMPATIBLE_CAPABILITIES,
  DeterministicSessionProviderFake,
  InMemorySessionRegistry,
  PostgresSessionRegistry,
  SessionControlController,
  SessionControlError,
  SessionControlService,
} from '../../src/control';
import type {
  SessionMutationResult,
  SessionOperationRecord,
  SessionRegistration,
  TrustedSessionContext,
} from '../../src/control';
import { SessionMirrorWriter } from '../../src/session-mirror.writer';

const tenantId = '00000000-0000-4000-8000-000000000001';
const sid = '00000000-0000-4000-8000-000000000011';
const operationId = '00000000-0000-4000-8000-000000000021';
const now = '2026-08-25T12:00:00.000Z';
const none = {
  kind: 'none' as const,
  effectiveBy: null,
  propagationBoundSeconds: null,
  accessTokenExpiresAt: null,
};
const context: TrustedSessionContext = {
  actorId: 'subject-a',
  subjectId: 'subject-a',
  tenantId,
  currentSessionId: sid,
  authorities: new Set(['sessions:self']),
  requestId: 'request-1',
};
const registration: SessionRegistration = {
  sid,
  anchorId: '00000000-0000-4000-8000-000000000031',
  tenantId,
  subjectId: 'subject-a',
  state: 'active',
  provider: 'fixture',
  capabilities: COGNITO_COMPATIBLE_CAPABILITIES,
  guarantee: none,
  metadata: {
    providerLabel: 'Provider',
    deviceLabel: 'Laptop',
    client: 'Browser',
    userAgentFamily: 'Firefox',
    deviceClass: 'desktop',
    country: 'BR',
    region: 'SP',
  },
  createdAt: now,
  lastSeenAt: now,
  expiresAt: '2026-08-26T12:00:00.000Z',
  terminalAt: null,
  sharedAnchor: true,
};
const result: SessionMutationResult = {
  operationId,
  action: 'revoke-one',
  scope: 'tenant',
  status: 'revoked',
  guarantee: none,
  effectiveBy: null,
  results: [{ sid, status: 'revoked', guarantee: none }],
};
const operation: SessionOperationRecord = {
  key: `tenant:subject-a:revoke-one:${operationId}`,
  requestHash: 'a'.repeat(64),
  result,
  attempts: 2,
  nextAttemptAt: null,
  leaseUntil: null,
};

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    sid,
    anchor_id: registration.anchorId,
    tenant_id: tenantId,
    subject_id: 'subject-a',
    state: 'active',
    provider: 'fixture',
    capabilities: COGNITO_COMPATIBLE_CAPABILITIES,
    provider_label: 'Provider',
    device_label: 'Laptop',
    client_label: 'Browser',
    user_agent_family: 'Firefox',
    device_class: 'desktop',
    country: 'BR',
    region: 'SP',
    guarantee: 'none',
    effective_by: null,
    propagation_bound_seconds: null,
    access_token_expires_at: null,
    blast_radius: 'identity',
    created_at: new Date(now),
    last_seen_at: now,
    expires_at: new Date('2026-08-26T12:00:00.000Z'),
    terminal_at: null,
    ...overrides,
  };
}

function operationRow(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: operationId,
    scope: 'tenant',
    actor_id: 'subject-a',
    action: 'revoke-one',
    request_hash: operation.requestHash,
    result_json: result,
    attempt_count: '2',
    next_attempt_at: null,
    lease_until: new Date('2026-08-25T12:01:00.000Z'),
    ...overrides,
  };
}

function postgres(query: ReturnType<typeof vi.fn>) {
  const database = {
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  };
  return { database, registry: new PostgresSessionRegistry(database as never) };
}

describe('PostgresSessionRegistry depth', () => {
  it('provisions either opaque anchor form with optional expiration', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { registry } = postgres(query);
    await registry.provisionAnchor({
      id: registration.anchorId,
      provider: 'fixture',
      providerSubjectKey: 'subject-key',
      encryptedHandle: new Uint8Array([1]),
      capabilities: COGNITO_COMPATIBLE_CAPABILITIES,
      expiresAt: '2026-08-26T00:00:00.000Z',
    });
    expect(query.mock.calls[0]?.[1]?.[2]).toEqual(new Uint8Array([1]));
    expect(query.mock.calls[0]?.[1]?.[3]).toEqual(null);
  });

  it('lists and maps complete and nullable registration metadata', async () => {
    const query = vi.fn(async () => ({
      rows: [
        registrationRow(),
        registrationRow({
          sid: '00000000-0000-4000-8000-000000000012',
          provider_label: '',
          device_label: null,
          client_label: null,
          user_agent_family: null,
          device_class: null,
          country: null,
          region: null,
          blast_radius: 'tenant',
          created_at: now,
          last_seen_at: null,
          expires_at: null,
        }),
      ],
    }));
    const { registry } = postgres(query);
    const rows = await registry.list(context, {});
    expect(rows[0]).toEqual(registration);
    expect(rows[1]).toMatchObject({
      metadata: {},
      sharedAnchor: false,
      lastSeenAt: null,
      expiresAt: null,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([tenantId, null]);
  });

  it('registers, updates, and maps all optional input fields', async () => {
    const query = vi.fn(async () => ({ rows: [registrationRow()] }));
    const { registry } = postgres(query);
    await expect(registry.register(registration)).resolves.toEqual(registration);
    await expect(
      registry.update({ ...registration, metadata: {}, sharedAnchor: false }),
    ).resolves.toEqual(registration);
    expect(query.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([null, 'tenant']));
  });

  it('loads valid operations, returns null for invalid or absent keys, and maps dates', async () => {
    const query = vi.fn(async () => ({ rows: [operationRow()] }));
    const { registry } = postgres(query);
    await expect(registry.operation(operation.key)).resolves.toMatchObject({
      key: operation.key,
      attempts: 2,
      nextAttemptAt: null,
      leaseUntil: '2026-08-25T12:01:00.000Z',
    });
    await expect(registry.operation('invalid')).resolves.toEqual(null);
    const absent = postgres(vi.fn(async () => ({ rows: [] })));
    await expect(absent.registry.operation(operation.key)).resolves.toEqual(null);
  });

  it('rejects invalid operation keys and stores pending and terminal attempts', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { registry } = postgres(query);
    await expect(registry.saveOperation({ ...operation, key: 'invalid' })).rejects.toThrow(
      'Invalid internal',
    );
    await registry.saveOperation({
      ...operation,
      result: { ...result, status: 'pending', errorCode: 'SESSION_OPERATION_PENDING' },
      nextAttemptAt: '2026-08-25T12:00:05.000Z',
    });
    await registry.saveOperation(operation);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[1]?.[1]?.at(-1)).toBe('SESSION_OPERATION_PENDING');
    expect(query.mock.calls[3]?.[1]?.at(-1)).toEqual(null);
  });

  it('claims pending work and maps operation keys', async () => {
    const query = vi.fn(async () => ({ rows: [operationRow()] }));
    await expect(
      postgres(query).registry.claimPending(now, '2026-08-25T12:01:00.000Z', 5),
    ).resolves.toEqual([expect.objectContaining({ key: operation.key })]);
  });

  it('purges terminal rows and erases subjects with present and absent row counts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const { registry } = postgres(query);
    await expect(registry.purgeTerminal(now)).resolves.toBe(2);
    await expect(registry.purgeTerminal(now)).resolves.toBe(0);
    const eraseQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const erase = postgres(eraseQuery).registry;
    await expect(erase.eraseSubject(tenantId, 'subject-a')).resolves.toBe(1);
    await expect(erase.eraseSubject(tenantId, 'subject-a')).resolves.toBe(0);
  });
});

describe('provider and controller entry behavior', () => {
  it('advertises configured capabilities and returns its default revocation result', async () => {
    const advertised = { ...COGNITO_COMPATIBLE_CAPABILITIES, revokeAll: false };
    const provider = new DeterministicSessionProviderFake([], advertised);
    await expect(provider.capabilities(context)).resolves.toBe(advertised);
    await expect(
      provider.revoke({ operationId, action: 'revoke-one', registration }),
    ).resolves.toMatchObject({ status: 'revoked', guarantee: { kind: 'provider_confirmed' } });
  });

  it('routes every controller operation, versions responses, and honors trusted resolver context', async () => {
    const service = {
      list: vi.fn(async () => []),
      execute: vi.fn(async () => result),
      getOperation: vi.fn(async () => result),
    };
    const controller = new SessionControlController(service as never, {
      provider: {} as never,
      contextResolver: () => context,
    });
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    await controller.list({ scope: 'identity' }, response as never);
    await controller.revoke(sid, {}, operationId, response as never);
    await controller.others({}, operationId, response as never);
    await controller.logout({}, undefined, response as never);
    await controller.all({}, operationId, response as never);
    await controller.operation(operationId, response as never);
    await controller.subject('subject-b', { scope: 'identity' }, operationId, response as never);
    await controller.revoke(sid, {}, undefined, response as never);
    await controller.others({}, undefined, response as never);
    await controller.all({}, undefined, response as never);
    await controller.subject('subject-b', {}, undefined, response as never);
    expect(service.execute).toHaveBeenCalledTimes(9);
    expect(service.list).toHaveBeenCalledWith(context, { scope: 'identity' });
    expect(response.setHeader).toHaveBeenCalledWith('Stynx-Session-Control-Version', '1');
  });

  it('returns 202 for pending results and maps governed and unknown failures', async () => {
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const governed = {
      execute: vi.fn(async () => {
        throw new SessionControlError('SESSION_FORBIDDEN', 403);
      }),
    };
    const controller = new SessionControlController(governed as never, {
      provider: {} as never,
      contextResolver: () => context,
    });
    await expect(controller.all({}, operationId, response as never)).rejects.toMatchObject({
      status: 403,
    });

    const unknown = new Error('unexpected');
    const unknownController = new SessionControlController(
      {
        list: vi.fn(async () => {
          throw unknown;
        }),
      } as never,
      {
        provider: {} as never,
        contextResolver: () => context,
      },
    );
    await expect(unknownController.list({}, response as never)).rejects.toBe(unknown);

    const pending = { ...result, status: 'pending' as const };
    const pendingController = new SessionControlController(
      { execute: vi.fn(async () => pending) } as never,
      {
        provider: {} as never,
        contextResolver: () => context,
      },
    );
    await pendingController.all({}, operationId, response as never);
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it('rejects caller identity overrides and absent request context', async () => {
    const response = { setHeader: vi.fn(), status: vi.fn() };
    const service = { list: vi.fn(async () => []) };
    const controller = new SessionControlController(service as never, { provider: {} as never });
    await expect(controller.list({ tenantId }, response as never)).rejects.toMatchObject({
      status: 400,
    });
    await expect(controller.list({}, response as never)).rejects.toMatchObject({ status: 401 });
  });

  it('derives trusted identity from an active RequestContext snapshot', async () => {
    const service = { list: vi.fn(async () => []) };
    const requestContext = {
      hasActiveContext: () => true,
      snapshot: () => ({ actorId: 'subject-a', tenantId, sessionId: sid, requestId: 'request-1' }),
    };
    const controller = new SessionControlController(
      service as never,
      { provider: {} as never },
      requestContext as never,
    );
    await controller.list({}, { setHeader: vi.fn(), status: vi.fn() } as never);
    expect(service.list).toHaveBeenCalledWith(context, { scope: 'tenant' });
  });
});

describe('SessionControlService remaining behavior', () => {
  async function serviceHarness(
    rows: SessionRegistration[],
    outcomes: Array<{
      status: 'revoked' | 'failed' | 'pending';
      guarantee: typeof none;
      errorCode?: string;
    }> = [],
    capabilities = COGNITO_COMPATIBLE_CAPABILITIES,
  ) {
    const registry = new InMemorySessionRegistry();
    for (const row of rows) await registry.register({ ...row, sharedAnchor: false, capabilities });
    const audit = { write: vi.fn() };
    const provider = new DeterministicSessionProviderFake(outcomes, capabilities);
    return {
      registry,
      audit,
      provider,
      service: new SessionControlService(registry, provider, audit, () => new Date(now)),
    };
  }

  it('audits privileged inventory and maps every optional display field and location shape', async () => {
    const countryOnly = {
      ...registration,
      sid: '00000000-0000-4000-8000-000000000012',
      sharedAnchor: false,
      metadata: { country: 'BR' },
    };
    const regionOnly = {
      ...registration,
      sid: '00000000-0000-4000-8000-000000000013',
      sharedAnchor: false,
      metadata: { region: 'SP' },
    };
    const { service, audit } = await serviceHarness([
      { ...registration, sharedAnchor: false },
      countryOnly,
      regionOnly,
    ]);
    const privileged = {
      ...context,
      authorities: new Set(['sessions:self', 'sessions:identity-manage'] as const),
    };
    const views = await service.list(privileged, { scope: 'identity' });
    expect(views[0]).toMatchObject({
      deviceLabel: 'Laptop',
      client: 'Browser',
      userAgent: 'Firefox',
      location: { country: 'BR', region: 'SP' },
    });
    expect(views[1]?.location).toEqual({ country: 'BR' });
    expect(views[2]?.location).toEqual({ region: 'SP' });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ type: 'privileged-list' }));

    const tenantAdmin = { ...context, authorities: new Set(['sessions:tenant-manage'] as const) };
    await service.list(tenantAdmin, { subjectId: 'other-subject' });
    expect(audit.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'privileged-list' }),
    );
  });

  it('returns a previously persisted identical operation and rejects empty targets', async () => {
    const { service, provider } = await serviceHarness([{ ...registration, sharedAnchor: false }]);
    const command = { action: 'revoke-one' as const, operationId, targetSessionId: sid };
    const first = await service.execute(context, command);
    await expect(service.execute(context, command)).resolves.toEqual(first);
    expect(provider.calls).toHaveLength(1);

    const empty = await serviceHarness([]);
    await expect(empty.service.execute(context, command)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('marks unsupported and failed provider outcomes truthfully', async () => {
    const unsupportedCaps = { ...COGNITO_COMPATIBLE_CAPABILITIES, revokeOne: false };
    const unsupported = await serviceHarness(
      [{ ...registration, sharedAnchor: false }],
      [],
      unsupportedCaps,
    );
    await expect(
      unsupported.service.execute(context, {
        action: 'revoke-one',
        operationId,
        targetSessionId: sid,
      }),
    ).resolves.toMatchObject({ status: 'unsupported', results: [{ status: 'unsupported' }] });

    const failed = await serviceHarness(
      [{ ...registration, sharedAnchor: false }],
      [
        {
          status: 'failed',
          guarantee: none,
          errorCode: 'PROVIDER_REJECTED',
        },
      ],
    );
    await expect(
      failed.service.execute(context, {
        action: 'revoke-one',
        operationId,
        targetSessionId: sid,
      }),
    ).resolves.toMatchObject({ status: 'failed', results: [{ status: 'failed' }] });
    expect(failed.audit.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'failure' }),
    );
  });

  it('rejects concurrent reuse of an in-flight operation with changed input', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registry = {
      operation: vi.fn(async () => null),
      list: vi.fn(async () => {
        await gate;
        return [{ ...registration, sharedAnchor: false }];
      }),
      update: vi.fn(async (value) => value),
      saveOperation: vi.fn(async () => undefined),
    };
    const service = new SessionControlService(
      registry as never,
      new DeterministicSessionProviderFake(),
    );
    const first = service.execute(context, {
      action: 'revoke-one',
      operationId,
      targetSessionId: sid,
    });
    await vi.waitFor(() =>
      expect(registry.list).toHaveBeenCalledWith(context, {
        scope: 'tenant',
        subjectId: context.subjectId,
      }),
    );
    await expect(
      service.execute(context, {
        action: 'revoke-one',
        operationId,
        targetSessionId: '00000000-0000-4000-8000-000000000012',
      }),
    ).rejects.toMatchObject({ code: 'SESSION_IDEMPOTENCY_CONFLICT' });
    release();
    await first;
  });

  it('validates authority, identifiers, target presence, and each bounded guarantee requirement', async () => {
    const { service } = await serviceHarness([{ ...registration, sharedAnchor: false }]);
    await expect(service.list({ ...context, actorId: '' })).rejects.toMatchObject({
      code: 'SESSION_UNAUTHENTICATED',
    });
    await expect(service.list({ ...context, authorities: new Set() })).rejects.toMatchObject({
      code: 'SESSION_FORBIDDEN',
    });
    await expect(
      service.execute(context, { action: 'revoke-one', operationId }),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(
      service.execute(context, { action: 'revoke-one', operationId, targetSessionId: 'bad' }),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(service.getOperation(context, 'bad')).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
    await expect(
      service.getOperation(context, '00000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });

    for (const guarantee of [
      {
        kind: 'bounded_local' as const,
        effectiveBy: now,
        propagationBoundSeconds: 1.5,
        accessTokenExpiresAt: null,
      },
      {
        kind: 'bounded_local' as const,
        effectiveBy: now,
        propagationBoundSeconds: 0,
        accessTokenExpiresAt: null,
      },
      {
        kind: 'bounded_local' as const,
        effectiveBy: null,
        propagationBoundSeconds: 1,
        accessTokenExpiresAt: null,
      },
    ]) {
      const bounded = await serviceHarness(
        [{ ...registration, sharedAnchor: false }],
        [{ status: 'revoked', guarantee }],
      );
      await expect(
        bounded.service.execute(context, {
          action: 'revoke-one',
          operationId,
          targetSessionId: sid,
        }),
      ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    }
  });

  it('reconciles terminal, unsupported, pending, absent, and exhausted registrations', async () => {
    const pendingResult = (itemSid = sid): SessionMutationResult => ({
      ...result,
      status: 'pending',
      results: [{ sid: itemSid, status: 'pending', guarantee: none, errorCode: 'OLD' }],
    });
    const run = async (
      rows: SessionRegistration[],
      operationOverrides: Partial<SessionOperationRecord>,
      outcomes: ConstructorParameters<typeof DeterministicSessionProviderFake>[0],
    ) => {
      const registry = new InMemorySessionRegistry();
      for (const row of rows) await registry.register({ ...row, sharedAnchor: false });
      await registry.saveOperation({
        ...operation,
        result: pendingResult(),
        attempts: 1,
        nextAttemptAt: now,
        ...operationOverrides,
      });
      const provider = new DeterministicSessionProviderFake(outcomes);
      const service = new SessionControlService(registry, provider, undefined, () => new Date(now));
      await service.reconcile(context, 7);
      return registry.operation(operation.key);
    };

    await expect(
      run([{ ...registration, sharedAnchor: false }], {}, [{ status: 'revoked', guarantee: none }]),
    ).resolves.toMatchObject({
      result: { status: 'revoked', results: [{ status: 'revoked' }] },
      nextAttemptAt: null,
    });
    await expect(
      run([{ ...registration, sharedAnchor: false }], {}, [
        {
          status: 'failed',
          guarantee: none,
          errorCode: 'PROVIDER_REJECTED',
        },
      ]),
    ).resolves.toMatchObject({
      result: { status: 'unsupported', results: [{ errorCode: 'PROVIDER_REJECTED' }] },
    });
    await expect(
      run([{ ...registration, sharedAnchor: false }], {}, [{ status: 'pending', guarantee: none }]),
    ).resolves.toMatchObject({
      result: { status: 'pending', results: [{ status: 'pending' }] },
      nextAttemptAt: expect.any(String),
    });
    await expect(run([], { attempts: 6 }, [])).resolves.toMatchObject({
      result: { status: 'failed', errorCode: 'SESSION_PROVIDER_FAILED' },
      nextAttemptAt: null,
    });
  });

  it('executes the default clock function on an unsupported path', async () => {
    const registry = new InMemorySessionRegistry();
    await registry.register({
      ...registration,
      sharedAnchor: false,
      capabilities: { ...COGNITO_COMPATIBLE_CAPABILITIES, revokeOne: false },
    });
    const service = new SessionControlService(registry, new DeterministicSessionProviderFake());
    await expect(
      service.execute(context, { action: 'revoke-one', operationId, targetSessionId: sid }),
    ).resolves.toMatchObject({ status: 'unsupported' });
  });

  it('does not claim an operation with a live lease', async () => {
    const registry = new InMemorySessionRegistry();
    await registry.saveOperation({
      ...operation,
      result: { ...result, status: 'pending' },
      nextAttemptAt: null,
      leaseUntil: '2026-08-25T12:10:00.000Z',
    });
    await expect(registry.claimPending(now, '2026-08-25T12:11:00.000Z', 1)).resolves.toEqual([]);
  });

  it('writes an infrastructure mirror row without an optional membership', async () => {
    const values = vi.fn(async () => undefined);
    const database = {
      tx: vi.fn(async (callback: (trx: unknown) => Promise<void>) =>
        callback({
          insert: vi.fn(() => ({ values })),
        }),
      ),
    };
    const mutator = {
      runWithRequestContext: vi.fn(async (_value: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const writer = new SessionMirrorWriter({
      get: vi.fn((token: { name?: string }) => (token.name === 'Database' ? database : mutator)),
    } as never);
    await writer.append({
      sid,
      tenantId,
      userId: 'subject-a',
      status: 'active',
      createdAt: now,
      expiresAt: '2026-08-26T12:00:00.000Z',
    });
    expect(values).toHaveBeenCalledWith(
      expect.not.objectContaining({ membershipId: expect.anything() }),
    );
  });
});
