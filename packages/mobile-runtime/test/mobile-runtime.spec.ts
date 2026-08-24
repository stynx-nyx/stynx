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
import type { MobileEvidenceDraft, MobileEntityDraft, MobileSyncQueueItem } from '../src/types';

type TeatEntityType = 'ait' | 'crash-record';

const posture = {
  homologated: true,
  remoteWipeVersion: 2,
  secureHardwareBacked: true,
  printerStatus: 'paired',
  networkStatus: 'limited',
} as const;

function aitDraftInput(clock: FixedMobileClock, reservedNumber?: number) {
  return {
    entityType: 'ait' as const,
    ...(reservedNumber === undefined ? {} : { reservedNumber }),
    payload: {
      plate: 'QWE4A21',
      framing_code: '605-03',
      observation: 'ported offline unit acceptance',
      vehicle_snapshot: { source: 'offline-cache' },
    },
    observedAt: clock.now(),
    location: {
      latitude: -3.119,
      longitude: -60.0217,
      accuracyMeters: 8,
      capturedAt: clock.now(),
      source: 'gps' as const,
    },
  };
}

describe('Offline-first mobile runtime (promoted from TEAT)', () => {
  it('requires an encrypted local store', () => {
    const store = new InMemoryEncryptedMobileStore();
    Object.defineProperty(store, 'encrypted', { value: false });

    expect(
      () =>
        new OfflineFirstMobileRuntime(
          store,
          new SandboxMobileBackendClient(),
          new NodeMobileCryptoPort(),
          new FixedMobileClock(),
          new SequentialMobileIdPort(),
        ),
    ).toThrow(/encrypted local store/);
  });

  it('executes the offline journey with idempotency, evidence, receipt, conflict and wipe', async () => {
    const store = new InMemoryEncryptedMobileStore();
    const backend = new SandboxMobileBackendClient<TeatEntityType>(undefined, [1000]);
    const clock = new FixedMobileClock();
    const ids = new SequentialMobileIdPort();
    const runtime = new OfflineFirstMobileRuntime<TeatEntityType>(
      store,
      backend,
      new NodeMobileCryptoPort(),
      clock,
      ids,
      new SimulatedMobilePrinterPort(clock, ids),
      { requiredRoles: ['field-agent'] },
    );

    await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), posture);
    const packageSnapshot = await runtime.installPublishedNormativePackage();
    expect(packageSnapshot.manifestHash).toMatch(/^sha256:/);
    expect(
      (await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 })).nextNumber,
    ).toBe(1000);

    const draft = await runtime.createDraft(aitDraftInput(clock));
    expect(draft.entityType).toBe('ait');
    await expect(runtime.finalizeOffline(draft.localId)).rejects.toThrow(/at least one evidence/);

    const evidence: Omit<MobileEvidenceDraft, 'linkedLocalEntityId'> = {
      localEvidenceId: 'evidence-local-0001',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:demo-evidence-hash-0001',
      mediaType: 'image/jpeg',
      capturedAt: clock.now(),
      storageIntentId: 'intent-local-0001',
    };
    await runtime.attachEvidence(draft.localId, evidence);
    const finalized = await runtime.finalizeOffline(draft.localId);
    expect(finalized.idempotencyKey).toMatch(/^idem-/);
    expect(finalized.localContentHash).toMatch(/^sha256:/);
    await expect(runtime.finalizeOffline(draft.localId)).rejects.toThrow(/expected draft/);

    const queueItem = await runtime.enqueue(draft.localId);
    expect(queueItem.payloadJson['normative_package_id']).toBe(packageSnapshot.packageId);
    expect(queueItem.payloadJson['org_unit_id']).toBe(draft.orgUnitId);
    expect(JSON.stringify(store.rawCollection('sync-queue'))).not.toContain('QWE4A21');

    const receipt = await runtime.printReceipt(draft.localId);
    expect(receipt.status).toBe('simulated');
    expect(receipt.contentHash).toMatch(/^sha256:/);

    const submitted = await runtime.submitPendingQueue();
    expect(submitted.conflicts).toEqual([queueItem.queueItemId]);
    expect(
      (await store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId))?.status,
    ).toBe('conflict');

    const resolution = await runtime.resolveSimpleConflict(queueItem.queueItemId, 'device-wins');
    expect(resolution.status).toBe('resolved');
    expect((await store.get<MobileEntityDraft>('entity-draft', draft.localId))?.status).toBe(
      'synced',
    );

    const wipeReceipt = await runtime.applyRemoteWipe('supervisor-revoked-device');
    expect(wipeReceipt.deviceId).toBe('device-001');
    expect(await runtime.snapshot()).toMatchObject({
      queuedCount: 0,
      evidenceCount: 0,
      pendingWipe: true,
    });
    expect('activeSession' in (await runtime.snapshot())).toBe(false);
  });

  it('rejects operation without session, package or valid evidence hash', async () => {
    const clock = new FixedMobileClock();
    const runtime = new OfflineFirstMobileRuntime(
      new InMemoryEncryptedMobileStore(),
      new SandboxMobileBackendClient(),
      new NodeMobileCryptoPort(),
      clock,
      new SequentialMobileIdPort(),
    );

    await expect(runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 })).rejects.toThrow(
      /session/,
    );
    await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
      ...posture,
      remoteWipeVersion: 1,
      networkStatus: 'online',
    });
    await expect(runtime.createDraft(aitDraftInput(clock))).rejects.toThrow(/normative package/);
  });

  it('supports consumer-defined entity types and optional evidence policies', async () => {
    const store = new InMemoryEncryptedMobileStore();
    const clock = new FixedMobileClock();
    const ids = new SequentialMobileIdPort();
    const runtime = new OfflineFirstMobileRuntime<'crash-record'>(
      store,
      new SandboxMobileBackendClient<'crash-record'>(),
      new NodeMobileCryptoPort(),
      clock,
      ids,
      undefined,
      { requireEvidenceToFinalize: false, draftIdPrefix: 'crash-local' },
    );

    await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), posture);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({
      entityType: 'crash-record',
      requestedSize: 2,
      series: 'CRASH',
    });

    const draft = await runtime.createDraft({
      entityType: 'crash-record',
      payload: { severity: 'minor', vehicles: 2 },
      observedAt: clock.now(),
      location: {
        latitude: -3.1,
        longitude: -60.02,
        accuracyMeters: 4,
        capturedAt: clock.now(),
        source: 'gps',
      },
    });
    expect(draft.localId).toMatch(/^crash-local-/);
    expect(draft.entityType).toBe('crash-record');

    const finalized = await runtime.finalizeOffline(draft.localId);
    expect(finalized.status).toBe('finalized');
    const queueItem = await runtime.enqueue(draft.localId);
    expect(queueItem.entityType).toBe('crash-record');
    expect(queueItem.payloadJson['entity_type']).toBe('crash-record');
  });
});
