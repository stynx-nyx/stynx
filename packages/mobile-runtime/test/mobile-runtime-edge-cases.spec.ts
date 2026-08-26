import { describe, expect, it } from 'vitest';
import { OfflineFirstMobileRuntime } from '../src/runtime';
import {
  FixedMobileClock,
  InMemoryEncryptedMobileStore,
  NodeMobileCryptoPort,
  SandboxMobileBackendClient,
  SandboxStynxMobileSessionPort,
  SequentialMobileIdPort,
  SimulatedMobilePrinterPort,
} from '../src/testing';
import type {
  CreateMobileDraftInput,
  MobileConflictResolution,
  MobileEntityDraft,
  MobileEvidenceDraft,
  MobileNormativePackageSnapshot,
  MobileNumberingReservation,
  MobilePrintReceipt,
  MobileSessionContext,
  MobileSyncQueueItem,
} from '../src/types';

interface Harness {
  readonly runtime: OfflineFirstMobileRuntime;
  readonly store: InMemoryEncryptedMobileStore;
  readonly backend: SandboxMobileBackendClient;
  readonly clock: FixedMobileClock;
  readonly ids: SequentialMobileIdPort;
}

const baseSession: MobileSessionContext = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  orgUnitId: '00000000-0000-4000-8000-0000000000aa',
  agentId: 'agent-001',
  deviceId: 'device-001',
  shiftId: 'shift-001',
  appVersion: '0.1.0-sandbox',
  roles: ['field-agent'],
};

const basePackage: MobileNormativePackageSnapshot = {
  packageId: 'pkg-2026-05',
  packageVersion: '2026.05',
  manifestHash: 'sha256:mobile-package-manifest',
  validUntil: '2026-06-30T23:59:59.000Z',
  status: 'published',
};

function createHarness(
  options: {
    readonly packageSnapshot?: MobileNormativePackageSnapshot;
    readonly conflictReservedNumbers?: readonly number[];
    readonly withPrinter?: boolean;
  } = {},
): Harness {
  const store = new InMemoryEncryptedMobileStore();
  const backend = new SandboxMobileBackendClient(
    options.packageSnapshot,
    options.conflictReservedNumbers ?? [],
  );
  const clock = new FixedMobileClock();
  const ids = new SequentialMobileIdPort();
  return {
    store,
    backend,
    clock,
    ids,
    runtime: new OfflineFirstMobileRuntime(
      store,
      backend,
      new NodeMobileCryptoPort(),
      clock,
      ids,
      options.withPrinter === false ? undefined : new SimulatedMobilePrinterPort(clock, ids),
      { requiredRoles: ['field-agent'] },
    ),
  };
}

async function bootstrap(
  runtime: OfflineFirstMobileRuntime,
  session: MobileSessionContext = baseSession,
): Promise<void> {
  await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(session), {
    homologated: true,
    remoteWipeVersion: 1,
    secureHardwareBacked: true,
    printerStatus: 'paired',
    networkStatus: 'limited',
  });
}

function draftInput(clock: FixedMobileClock, reservedNumber?: number): CreateMobileDraftInput {
  return {
    entityType: 'ait',
    ...(reservedNumber === undefined ? {} : { reservedNumber }),
    payload: { plate: 'QWE4A21', framing_code: '605-03' },
    observedAt: clock.now(),
    location: {
      latitude: -3.119,
      longitude: -60.0217,
      accuracyMeters: 8,
      capturedAt: clock.now(),
      source: 'gps',
    },
  };
}

describe('Offline-first mobile runtime edge cases', () => {
  it('rejects sessions missing required roles and insecure device posture', async () => {
    const { runtime } = createHarness();

    await expect(
      bootstrap(runtime, { ...baseSession, roles: ['field-supervisor'] }),
    ).rejects.toThrow(/field-agent/);
    await expect(
      runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
        homologated: false,
        remoteWipeVersion: 1,
        secureHardwareBacked: true,
        printerStatus: 'paired',
        networkStatus: 'online',
      }),
    ).rejects.toThrow(/Device posture/);
    await expect(
      runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
        homologated: true,
        remoteWipeVersion: 1,
        secureHardwareBacked: false,
        printerStatus: 'paired',
        networkStatus: 'online',
      }),
    ).rejects.toThrow(/Device posture/);
  });

  it('rejects expired or retired normative packages before local installation', async () => {
    const expired = createHarness({
      packageSnapshot: {
        ...basePackage,
        packageId: 'pkg-expired',
        validUntil: '2026-05-20T11:59:59.000Z',
      },
    });
    await bootstrap(expired.runtime);
    await expect(expired.runtime.installPublishedNormativePackage()).rejects.toThrow(/expired/);

    const retired = createHarness({
      packageSnapshot: { ...basePackage, packageId: 'pkg-retired', status: 'retired' },
    });
    await bootstrap(retired.runtime);
    await expect(retired.runtime.installPublishedNormativePackage()).rejects.toThrow(
      /not published/,
    );
  });

  it('requires a usable numbering reservation and exact requested number', async () => {
    const { runtime, clock } = createHarness();

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await expect(runtime.createDraft(draftInput(clock))).rejects.toThrow(
      /No usable reserved numbering/,
    );

    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    await expect(runtime.createDraft(draftInput(clock, 1001))).rejects.toThrow(
      /No usable reserved numbering/,
    );
    await expect(runtime.createDraft(draftInput(clock, 1000))).resolves.toMatchObject({
      reservedNumber: 1000,
    });
    await expect(runtime.createDraft(draftInput(clock))).rejects.toThrow(
      /No usable reserved numbering/,
    );
  });

  it('rejects invalid evidence hashes, unknown acts and unsupported print states', async () => {
    const { runtime, clock } = createHarness({ withPrinter: false });

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await runtime.createDraft(draftInput(clock));

    await expect(
      runtime.attachEvidence(draft.localId, {
        localEvidenceId: 'evidence-invalid',
        hashAlgorithm: 'sha256',
        hashValue: 'md5:bad',
        mediaType: 'image/jpeg',
        capturedAt: clock.now(),
      }),
    ).rejects.toThrow(/sha256 hash/);
    await expect(
      runtime.attachEvidence('missing-act', {
        localEvidenceId: 'evidence-missing',
        hashAlgorithm: 'sha256',
        hashValue: 'sha256:valid',
        mediaType: 'image/jpeg',
        capturedAt: clock.now(),
      }),
    ).rejects.toThrow(/missing-act was not found/);
    await expect(runtime.printReceipt(draft.localId)).rejects.toThrow(/No mobile printer/);
  });

  it('handles empty sync queues and rejects invalid conflict resolution states', async () => {
    const { runtime, store, clock } = createHarness();

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    await expect(runtime.submitPendingQueue()).resolves.toEqual({
      batchId: 'empty',
      acceptedItems: 0,
      conflicts: [],
    });
    await expect(runtime.resolveSimpleConflict('missing-item', 'device-wins')).rejects.toThrow(
      /missing-item was not found/,
    );

    const draft = await runtime.createDraft(draftInput(clock));
    await runtime.attachEvidence(draft.localId, {
      localEvidenceId: 'evidence-valid',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:valid',
      mediaType: 'image/jpeg',
      capturedAt: clock.now(),
    });
    await runtime.finalizeOffline(draft.localId);
    const queueItem = await runtime.enqueue(draft.localId);
    await runtime.submitPendingQueue();

    await expect(
      runtime.resolveSimpleConflict(queueItem.queueItemId, 'manual-review'),
    ).rejects.toThrow(/expected conflict/);
    expect(
      (await store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId))?.status,
    ).toBe('received');
  });

  it('does not consume a reservation belonging to another entity type', async () => {
    const { runtime, clock } = createHarness();
    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });

    await expect(
      runtime.createDraft({ ...draftInput(clock), entityType: 'crash-record' }),
    ).rejects.toThrow(/No usable reserved numbering/);
  });

  it('returns sent items to pending when batch transport fails so the same draft can retry', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));
    await harness.runtime.attachEvidence(draft.localId, {
      localEvidenceId: 'evidence-retry',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:retry',
      mediaType: 'image/jpeg',
      capturedAt: harness.clock.now(),
    });
    await harness.runtime.finalizeOffline(draft.localId);
    const queueItem = await harness.runtime.enqueue(draft.localId);
    const originalSubmit = harness.backend.submitSyncBatch.bind(harness.backend);
    harness.backend.submitSyncBatch = async () => {
      throw new Error('offline');
    };

    await expect(harness.runtime.submitPendingQueue()).rejects.toThrow(/offline/);
    expect(
      (await harness.store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId))?.status,
    ).toBe('pending');

    harness.backend.submitSyncBatch = originalSubmit;
    await expect(harness.runtime.submitPendingQueue()).resolves.toMatchObject({ acceptedItems: 1 });
  });

  it('persists the exact session posture and applies the default draft identifier policy', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });

    expect(await harness.runtime.snapshot()).toMatchObject({
      activeSession: baseSession,
      devicePosture: {
        homologated: true,
        secureHardwareBacked: true,
        networkStatus: 'limited',
      },
    });
    await expect(harness.runtime.createDraft(draftInput(harness.clock))).resolves.toMatchObject({
      localId: 'entity-local-0001',
    });

    const store = new InMemoryEncryptedMobileStore();
    const runtime = new OfflineFirstMobileRuntime(
      store,
      new SandboxMobileBackendClient(),
      new NodeMobileCryptoPort(),
      new FixedMobileClock(),
      new SequentialMobileIdPort(),
      undefined,
      { requiredRoles: ['field-agent', 'field-supervisor'] },
    );
    await expect(bootstrap(runtime, { ...baseSession, roles: [] })).rejects.toThrow(
      'Official mobile runtime requires role(s) field-agent, field-supervisor for entity creation',
    );
  });

  it('treats a normative package expiring now as expired', async () => {
    const harness = createHarness({
      packageSnapshot: { ...basePackage, validUntil: '2026-05-20T12:00:00.000Z' },
    });
    await bootstrap(harness.runtime);
    await expect(harness.runtime.installPublishedNormativePackage()).rejects.toThrow(
      'Normative package pkg-2026-05 is expired',
    );
  });

  it('forwards an explicit numbering series and rejects a mismatched backend reservation', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    const originalReserve = harness.backend.reserveNumbering.bind(harness.backend);
    let observedSeries: string | undefined;
    harness.backend.reserveNumbering = async (input) => {
      observedSeries = input.series;
      return originalReserve(input);
    };

    await expect(
      harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 2, series: 'AIT-2026' }),
    ).resolves.toMatchObject({ series: 'AIT-2026' });
    expect(observedSeries).toBe('AIT-2026');

    harness.backend.reserveNumbering = async (input) => ({
      ...(await originalReserve(input)),
      entityType: 'crash-record',
    });
    await expect(
      harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 }),
    ).rejects.toThrow(
      'Numbering reservation reservation-device-001 is for crash-record; expected ait',
    );
  });

  it('constructs the draft payload and initial hash from the complete input', async () => {
    const harness = createHarness();
    const crypto = new NodeMobileCryptoPort();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const input = draftInput(harness.clock);
    const draft = await harness.runtime.createDraft(input);
    const payload = { ...input.payload, observed_at: input.observedAt };

    expect(draft).toMatchObject({
      payload,
      reservedNumber: 1000,
      reservationId: 'reservation-device-001',
      idempotencyKey: 'idem-0002',
      normativePackageId: basePackage.packageId,
      localContentHash: crypto.contentHash({ payload, input }),
    });
  });

  it('validates each evidence hash requirement and persists linked evidence', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));
    const evidence = {
      localEvidenceId: 'evidence-complete',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:complete',
      mediaType: 'image/jpeg',
      capturedAt: harness.clock.now(),
    } as const;

    await expect(
      harness.runtime.attachEvidence(draft.localId, {
        ...evidence,
        hashAlgorithm: '' as 'sha256',
      }),
    ).rejects.toThrow(/sha256 hash/);
    await expect(
      harness.runtime.attachEvidence(draft.localId, { ...evidence, hashValue: '' }),
    ).rejects.toThrow(/sha256 hash/);
    await expect(harness.runtime.attachEvidence(draft.localId, evidence)).resolves.toMatchObject({
      evidence: [{ ...evidence, linkedLocalEntityId: draft.localId }],
    });
    expect(
      await harness.store.get<MobileEvidenceDraft>('evidence', evidence.localEvidenceId),
    ).toEqual({ ...evidence, linkedLocalEntityId: draft.localId });
    expect((await harness.runtime.snapshot()).evidenceCount).toBe(1);
  });

  it('rejects enqueue and printing before finalization', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));

    await expect(harness.runtime.enqueue(draft.localId)).rejects.toThrow(
      `Entity draft ${draft.localId} is draft; expected finalized`,
    );
    await expect(harness.runtime.printReceipt(draft.localId)).rejects.toThrow(
      `Entity draft ${draft.localId} is draft; expected finalized, queued or synced for receipt`,
    );
  });

  it('submits only pending queue entries and persists the exact attempt transition', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 2 });

    const firstDraft = await harness.runtime.createDraft(draftInput(harness.clock));
    const secondDraft = await harness.runtime.createDraft(draftInput(harness.clock));
    for (const draft of [firstDraft, secondDraft]) {
      await harness.runtime.attachEvidence(draft.localId, {
        localEvidenceId: `evidence-${draft.localId}`,
        hashAlgorithm: 'sha256',
        hashValue: `sha256:${draft.localId}`,
        mediaType: 'image/jpeg',
        capturedAt: harness.clock.now(),
      });
      await harness.runtime.finalizeOffline(draft.localId);
    }
    const pending = await harness.runtime.enqueue(firstDraft.localId);
    const alreadyReceived = await harness.runtime.enqueue(secondDraft.localId);
    await harness.store.put('sync-queue', alreadyReceived.queueItemId, {
      ...alreadyReceived,
      status: 'received',
    });

    await expect(harness.runtime.submitPendingQueue()).resolves.toMatchObject({ acceptedItems: 1 });
    expect(harness.backend.submittedBatches).toHaveLength(1);
    expect(harness.backend.submittedBatches[0]).toMatchObject({
      tenantId: baseSession.tenantId,
      orgUnitId: baseSession.orgUnitId,
      agentId: baseSession.agentId,
      deviceId: baseSession.deviceId,
      deviceBatchId: 'device-batch-0007',
      items: [
        {
          queueItemId: pending.queueItemId,
          status: 'sent',
          attempts: 1,
          lastSubmittedAt: harness.clock.now(),
        },
      ],
    });
    expect(
      await harness.store.get<MobileSyncQueueItem>('sync-queue', pending.queueItemId),
    ).toMatchObject({ status: 'received', attempts: 1 });
    expect(
      await harness.store.get<MobileSyncQueueItem>('sync-queue', alreadyReceived.queueItemId),
    ).toMatchObject({ status: 'received', attempts: 0 });
  });

  it('persists conflict resolution, queue state, draft state and receipt records', async () => {
    const harness = createHarness({ conflictReservedNumbers: [1000] });
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));
    await harness.runtime.attachEvidence(draft.localId, {
      localEvidenceId: 'evidence-conflict',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:conflict',
      mediaType: 'image/jpeg',
      capturedAt: harness.clock.now(),
    });
    await harness.runtime.finalizeOffline(draft.localId);
    const queueItem = await harness.runtime.enqueue(draft.localId);
    const receipt = await harness.runtime.printReceipt(draft.localId);
    await harness.runtime.submitPendingQueue();
    const resolution = await harness.runtime.resolveSimpleConflict(
      queueItem.queueItemId,
      'server-wins',
    );

    expect(
      await harness.store.get<MobileConflictResolution>(
        'sync-conflict-resolution',
        resolution.conflictId,
      ),
    ).toEqual(resolution);
    expect(
      await harness.store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId),
    ).toMatchObject({ status: 'applied' });
    expect(await harness.store.get<MobileEntityDraft>('entity-draft', draft.localId)).toMatchObject(
      {
        status: 'synced',
      },
    );
    expect(await harness.store.get<MobilePrintReceipt>('print-receipt', receipt.receiptId)).toEqual(
      receipt,
    );
    expect(await harness.runtime.snapshot()).toMatchObject({
      queuedCount: 0,
      printReceiptCount: 1,
      conflictResolutionCount: 1,
    });
  });

  it('reports an exact empty and populated snapshot across lifecycle states', async () => {
    const harness = createHarness();
    expect(await harness.runtime.snapshot()).toEqual({
      draftCount: 0,
      queuedCount: 0,
      evidenceCount: 0,
      printReceiptCount: 0,
      conflictResolutionCount: 0,
      pendingWipe: false,
    });
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();

    const draft = {
      localId: 'snapshot-draft',
      entityType: 'ait',
      tenantId: baseSession.tenantId,
      orgUnitId: baseSession.orgUnitId,
      agentId: baseSession.agentId,
      deviceId: baseSession.deviceId,
      shiftId: baseSession.shiftId,
      status: 'draft',
      reservedNumber: 1000,
      reservationId: 'snapshot-reservation',
      idempotencyKey: 'snapshot-idempotency',
      normativePackageId: basePackage.packageId,
      normativePackageVersion: basePackage.packageVersion,
      localContentHash: 'sha256:snapshot',
      payload: {},
      location: draftInput(harness.clock).location,
      evidence: [],
      createdAt: harness.clock.now(),
      updatedAt: harness.clock.now(),
    } satisfies MobileEntityDraft;
    await harness.store.put('entity-draft', draft.localId, draft);
    for (const status of [
      'pending',
      'sent',
      'received',
      'conflict',
      'applied',
      'rejected',
    ] as const) {
      await harness.store.put('sync-queue', status, { status });
    }
    await harness.store.put('evidence', 'snapshot-evidence', {
      localEvidenceId: 'snapshot-evidence',
    });
    await harness.store.put('print-receipt', 'snapshot-print', { receiptId: 'snapshot-print' });
    await harness.store.put('sync-conflict-resolution', 'snapshot-conflict', {
      conflictId: 'snapshot-conflict',
    });

    expect(await harness.runtime.snapshot()).toMatchObject({
      activeSession: baseSession,
      activePackage: basePackage,
      draftCount: 1,
      queuedCount: 4,
      evidenceCount: 1,
      printReceiptCount: 1,
      conflictResolutionCount: 1,
      pendingWipe: false,
    });
  });

  it('persists exact wipe receipts both with and without an active session', async () => {
    const harness = createHarness();
    const withoutSession = await harness.runtime.applyRemoteWipe('pre-session-reset');
    expect(withoutSession).toEqual({
      wipeReceiptId: 'wipe-0001',
      deviceId: 'unknown-device',
      reason: 'pre-session-reset',
      wipedAt: harness.clock.now(),
    });
    expect(await harness.store.get('wipe-receipt', withoutSession.wipeReceiptId)).toEqual(
      withoutSession,
    );
    expect((await harness.runtime.snapshot()).pendingWipe).toBe(true);
  });

  it('skips unusable reservations and advances a valid interval deterministically', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    const baseReservation: MobileNumberingReservation = {
      reservationId: 'unusable',
      rangeId: 'range-unusable',
      entityType: 'ait',
      series: 'AIT',
      startNumber: 1000,
      endNumber: 1000,
      nextNumber: 1000,
      validUntil: '2026-05-21T12:00:00.000Z',
      status: 'reserved',
    };
    await harness.store.put('numbering-reservation', 'consumed', {
      ...baseReservation,
      reservationId: 'consumed',
      status: 'consumed',
    });
    await harness.store.put('numbering-reservation', 'expired-now', {
      ...baseReservation,
      reservationId: 'expired-now',
      validUntil: harness.clock.now(),
    });
    await harness.store.put('numbering-reservation', 'past-end', {
      ...baseReservation,
      reservationId: 'past-end',
      nextNumber: 1001,
    });
    await expect(harness.runtime.createDraft(draftInput(harness.clock))).rejects.toThrow(
      /No usable reserved numbering/,
    );

    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 2 });
    await harness.runtime.createDraft(draftInput(harness.clock, 1000));
    expect(
      await harness.store.get<MobileNumberingReservation>(
        'numbering-reservation',
        'reservation-device-001',
      ),
    ).toMatchObject({ nextNumber: 1001, status: 'reserved' });
    await harness.runtime.createDraft(draftInput(harness.clock, 1001));
    expect(
      await harness.store.get<MobileNumberingReservation>(
        'numbering-reservation',
        'reservation-device-001',
      ),
    ).toMatchObject({ nextNumber: 1002, status: 'consumed' });
  });

  it('rejects each missing offline identity or context field before finalization', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));
    const identityFields = ['idempotencyKey', 'reservationId', 'localContentHash'] as const;
    for (const field of identityFields) {
      await harness.store.put('entity-draft', draft.localId, { ...draft, [field]: '' });
      await expect(harness.runtime.finalizeOffline(draft.localId)).rejects.toThrow(
        'Offline entity draft lacks idempotency, reservation or content hash',
      );
    }
    const contextFields = ['deviceId', 'agentId', 'location', 'normativePackageId'] as const;
    for (const field of contextFields) {
      await harness.store.put('entity-draft', draft.localId, { ...draft, [field]: undefined });
      await expect(harness.runtime.finalizeOffline(draft.localId)).rejects.toThrow(
        'Offline entity draft lacks device, agent, location or normative package context',
      );
    }
  });
});
