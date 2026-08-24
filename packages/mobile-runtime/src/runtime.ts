import type {
  MobileBackendClientPort,
  MobileClockPort,
  MobileCryptoPort,
  MobileEncryptedStorePort,
  MobileIdPort,
  MobilePrinterPort,
  MobileStynxSessionPort,
} from './ports';
import type {
  CreateMobileDraftInput,
  MobileConflictResolution,
  MobileDevicePosture,
  MobileEvidenceDraft,
  MobileEntityDraft,
  MobileNormativePackageSnapshot,
  MobileNumberingReservation,
  MobilePrintReceipt,
  MobileRemoteWipeReceipt,
  MobileRuntimeOptions,
  MobileRuntimeSnapshot,
  MobileSessionContext,
  MobileSyncBatchResult,
  MobileSyncQueueItem,
  ReserveMobileNumberingInput,
  SyncConflictResolutionStrategy,
  SyncQueueStatus,
} from './types';

/**
 * Offline-first mobile runtime for official entity drafting in the field.
 *
 * Promoted from TEAT (E6). The enforced sequence is: `bootstrapSession` →
 * `installPublishedNormativePackage` → `reserveNumbering` → `createDraft` →
 * `attachEvidence` → `finalizeOffline` → `enqueue` →
 * `submitPendingQueue` → `resolveSimpleConflict`.
 *
 * Every draft carries a device-generated idempotency key, a reserved number
 * consumed from a server-granted range, and a deterministic content hash, so
 * a retry after connectivity loss can never double-issue an entity.
 */
export class OfflineFirstMobileRuntime<TEntityType extends string = string> {
  private readonly requiredRoles: readonly string[];
  private readonly requireEvidenceToFinalize: boolean;
  private readonly draftIdPrefix: string;

  constructor(
    private readonly store: MobileEncryptedStorePort,
    private readonly backend: MobileBackendClientPort<TEntityType>,
    private readonly crypto: MobileCryptoPort,
    private readonly clock: MobileClockPort,
    private readonly ids: MobileIdPort,
    private readonly printer?: MobilePrinterPort,
    options: MobileRuntimeOptions = {},
  ) {
    if (!store.encrypted) {
      throw new Error('stynx mobile runtime requires an encrypted local store port');
    }
    this.requiredRoles = options.requiredRoles ?? [];
    this.requireEvidenceToFinalize = options.requireEvidenceToFinalize ?? true;
    this.draftIdPrefix = options.draftIdPrefix ?? 'entity-local';
  }

  async bootstrapFromStynxSession(
    sessionPort: MobileStynxSessionPort,
    posture: MobileDevicePosture,
  ): Promise<MobileSessionContext> {
    const context = await sessionPort.currentSession();
    await this.bootstrapSession(context, posture);
    return context;
  }

  async bootstrapSession(
    context: MobileSessionContext,
    posture: MobileDevicePosture,
  ): Promise<void> {
    const missingRoles = this.requiredRoles.filter((role) => !context.roles.includes(role));
    if (missingRoles.length > 0) {
      throw new Error(
        `Official mobile runtime requires role(s) ${missingRoles.join(', ')} for entity creation`,
      );
    }
    if (!posture.homologated || !posture.secureHardwareBacked) {
      throw new Error('Device posture does not allow official mobile operation');
    }
    await this.store.put('session', 'active', context);
    await this.store.put('device', context.deviceId, posture);
  }

  async installPublishedNormativePackage(): Promise<MobileNormativePackageSnapshot> {
    const published = await this.backend.fetchPublishedNormativePackage();
    if (published.status !== 'published') {
      throw new Error(`Normative package ${published.packageId} is not published`);
    }
    if (Date.parse(published.validUntil) <= Date.parse(this.clock.now())) {
      throw new Error(`Normative package ${published.packageId} is expired`);
    }
    await this.store.put('normative-package', 'active', published);
    return published;
  }

  async reserveNumbering(
    input: ReserveMobileNumberingInput<TEntityType>,
  ): Promise<MobileNumberingReservation> {
    const session = await this.requireSession();
    const reservation = await this.backend.reserveNumbering({
      tenantId: session.tenantId,
      orgUnitId: session.orgUnitId,
      agentId: session.agentId,
      deviceId: session.deviceId,
      shiftId: session.shiftId,
      entityType: input.entityType,
      requestedSize: input.requestedSize,
      ...(input.series === undefined ? {} : { series: input.series }),
    });
    if (reservation.entityType !== input.entityType) {
      throw new Error(
        `Numbering reservation ${reservation.reservationId} is for ${reservation.entityType}; expected ${input.entityType}`,
      );
    }
    await this.store.put('numbering-reservation', reservation.reservationId, reservation);
    return reservation;
  }

  async createDraft(
    input: CreateMobileDraftInput<TEntityType>,
  ): Promise<MobileEntityDraft<TEntityType>> {
    const session = await this.requireSession();
    const normativePackage = await this.requireNormativePackage();
    const reservation = await this.consumeReservationNumber(input.entityType, input.reservedNumber);
    const now = this.clock.now();
    const localId = this.ids.uuid(this.draftIdPrefix);
    const payload = {
      ...input.payload,
      observed_at: input.observedAt,
    };
    const draft: MobileEntityDraft<TEntityType> = {
      localId,
      entityType: input.entityType,
      tenantId: session.tenantId,
      orgUnitId: session.orgUnitId,
      agentId: session.agentId,
      deviceId: session.deviceId,
      shiftId: session.shiftId,
      status: 'draft',
      reservedNumber: reservation.nextNumber,
      reservationId: reservation.reservationId,
      idempotencyKey: this.ids.uuid('idem'),
      normativePackageId: normativePackage.packageId,
      normativePackageVersion: normativePackage.packageVersion,
      localContentHash: this.crypto.contentHash({ payload, input }),
      payload,
      location: input.location,
      evidence: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.put('entity-draft', localId, draft);
    return draft;
  }

  async attachEvidence(
    localEntityId: string,
    evidence: Omit<MobileEvidenceDraft, 'linkedLocalEntityId'>,
  ): Promise<MobileEntityDraft<TEntityType>> {
    if (
      evidence.hashAlgorithm !== 'sha256' ||
      !evidence.hashValue ||
      !evidence.hashValue.startsWith('sha256:')
    ) {
      throw new Error('Evidence must carry a sha256 hash before it can be stored locally');
    }
    const draft = await this.requireDraft(localEntityId);
    const linkedEvidence: MobileEvidenceDraft = { ...evidence, linkedLocalEntityId: localEntityId };
    await this.store.put('evidence', linkedEvidence.localEvidenceId, linkedEvidence);
    const updated = this.updateDraft(draft, {
      evidence: [...draft.evidence, linkedEvidence],
    });
    await this.store.put('entity-draft', localEntityId, updated);
    return updated;
  }

  async finalizeOffline(localEntityId: string): Promise<MobileEntityDraft<TEntityType>> {
    const draft = await this.requireDraft(localEntityId);
    if (draft.status !== 'draft') {
      throw new Error(`Entity draft ${localEntityId} is ${draft.status}; expected draft`);
    }
    this.assertOfflineInvariant(draft);
    const finalizedAt = this.clock.now();
    const finalized = this.updateDraft(draft, {
      status: 'finalized',
      finalizedAt,
      localContentHash: this.crypto.contentHash({ ...draft, finalizedAt, status: 'finalized' }),
    });
    await this.store.put('entity-draft', localEntityId, finalized);
    return finalized;
  }

  async enqueue(localEntityId: string): Promise<MobileSyncQueueItem<TEntityType>> {
    const draft = await this.requireDraft(localEntityId);
    if (draft.status !== 'finalized') {
      throw new Error(`Entity draft ${localEntityId} is ${draft.status}; expected finalized`);
    }
    const queueItem: MobileSyncQueueItem<TEntityType> = {
      queueItemId: this.ids.uuid('sync-item'),
      entityType: draft.entityType,
      localEntityId: draft.localId,
      status: 'pending',
      attempts: 0,
      idempotencyKey: draft.idempotencyKey,
      payloadHash: draft.localContentHash,
      payloadJson: this.toSyncPayload(draft),
      deviceId: draft.deviceId,
      agentId: draft.agentId,
      tenantId: draft.tenantId,
      orgUnitId: draft.orgUnitId,
      normativePackageId: draft.normativePackageId,
      reservedNumber: draft.reservedNumber,
      location: draft.location,
      createdLocallyAt: draft.createdAt,
    };
    await this.store.put('sync-queue', queueItem.queueItemId, queueItem);
    await this.store.put(
      'entity-draft',
      localEntityId,
      this.updateDraft(draft, { status: 'queued' }),
    );
    return queueItem;
  }

  async submitPendingQueue(): Promise<MobileSyncBatchResult> {
    const session = await this.requireSession();
    const pending = (await this.store.list<MobileSyncQueueItem<TEntityType>>('sync-queue')).filter(
      (item) => item.status === 'pending',
    );
    if (!pending.length) {
      return { batchId: 'empty', acceptedItems: 0, conflicts: [] };
    }
    const submittedAt = this.clock.now();
    const marked = pending.map(
      (item): MobileSyncQueueItem<TEntityType> => ({
        ...item,
        status: 'sent',
        attempts: item.attempts + 1,
        lastSubmittedAt: submittedAt,
      }),
    );
    for (const item of marked) {
      await this.store.put('sync-queue', item.queueItemId, item);
    }
    let result: MobileSyncBatchResult;
    try {
      result = await this.backend.submitSyncBatch({
        tenantId: session.tenantId,
        orgUnitId: session.orgUnitId,
        agentId: session.agentId,
        deviceId: session.deviceId,
        deviceBatchId: this.ids.uuid('device-batch'),
        items: marked,
      });
    } catch (error) {
      for (const item of marked) {
        await this.store.put('sync-queue', item.queueItemId, { ...item, status: 'pending' });
      }
      throw error;
    }
    for (const item of marked) {
      const status: SyncQueueStatus = result.conflicts.includes(item.queueItemId)
        ? 'conflict'
        : 'received';
      await this.store.put('sync-queue', item.queueItemId, { ...item, status });
    }
    return result;
  }

  async resolveSimpleConflict(
    queueItemId: string,
    resolution: SyncConflictResolutionStrategy,
  ): Promise<MobileConflictResolution> {
    const session = await this.requireSession();
    const item = await this.store.get<MobileSyncQueueItem<TEntityType>>('sync-queue', queueItemId);
    if (!item) {
      throw new Error(`Sync queue item ${queueItemId} was not found`);
    }
    if (item.status !== 'conflict') {
      throw new Error(`Sync queue item ${queueItemId} is ${item.status}; expected conflict`);
    }
    const resolved = await this.backend.resolveSyncConflict({
      tenantId: session.tenantId,
      orgUnitId: session.orgUnitId,
      agentId: session.agentId,
      deviceId: session.deviceId,
      queueItemId: item.queueItemId,
      localEntityId: item.localEntityId,
      resolution,
      payloadHash: item.payloadHash,
    });
    await this.store.put('sync-conflict-resolution', resolved.conflictId, resolved);
    await this.store.put('sync-queue', item.queueItemId, { ...item, status: 'applied' });
    const draft = await this.store.get<MobileEntityDraft<TEntityType>>(
      'entity-draft',
      item.localEntityId,
    );
    if (draft) {
      await this.store.put(
        'entity-draft',
        draft.localId,
        this.updateDraft(draft, { status: 'synced' }),
      );
    }
    return resolved;
  }

  async printReceipt(localEntityId: string): Promise<MobilePrintReceipt> {
    if (!this.printer) {
      throw new Error('No mobile printer port is configured');
    }
    const session = await this.requireSession();
    const draft = await this.requireDraft(localEntityId);
    if (!['finalized', 'queued', 'synced'].includes(draft.status)) {
      throw new Error(
        `Entity draft ${localEntityId} is ${draft.status}; expected finalized, queued or synced for receipt`,
      );
    }
    const receipt = await this.printer.printReceipt({
      session,
      draft,
      contentHash: this.crypto.contentHash({
        localEntityId: draft.localId,
        reservedNumber: draft.reservedNumber,
        payloadHash: draft.localContentHash,
        evidence: draft.evidence.map((item) => item.hashValue),
      }),
    });
    await this.store.put('print-receipt', receipt.receiptId, receipt);
    return receipt;
  }

  async applyRemoteWipe(reason: string): Promise<MobileRemoteWipeReceipt> {
    const session = await this.store.get<MobileSessionContext>('session', 'active');
    const receipt: MobileRemoteWipeReceipt = {
      wipeReceiptId: this.ids.uuid('wipe'),
      deviceId: session?.deviceId ?? 'unknown-device',
      reason,
      wipedAt: this.clock.now(),
    };
    await this.store.clear();
    await this.store.put('wipe-receipt', receipt.wipeReceiptId, receipt);
    return receipt;
  }

  async snapshot(): Promise<MobileRuntimeSnapshot> {
    const session = await this.store.get<MobileSessionContext>('session', 'active');
    const activePackage = await this.store.get<MobileNormativePackageSnapshot>(
      'normative-package',
      'active',
    );
    const devicePosture = session
      ? await this.store.get<MobileDevicePosture>('device', session.deviceId)
      : undefined;
    const drafts = await this.store.list<MobileEntityDraft<TEntityType>>('entity-draft');
    const queue = await this.store.list<MobileSyncQueueItem<TEntityType>>('sync-queue');
    const evidence = await this.store.list<MobileEvidenceDraft>('evidence');
    const printReceipts = await this.store.list<MobilePrintReceipt>('print-receipt');
    const conflictResolutions = await this.store.list<MobileConflictResolution>(
      'sync-conflict-resolution',
    );
    const wipeReceipts = await this.store.list<Record<string, unknown>>('wipe-receipt');
    return {
      ...(session === undefined ? {} : { activeSession: session }),
      ...(activePackage === undefined ? {} : { activePackage }),
      ...(devicePosture === undefined ? {} : { devicePosture }),
      draftCount: drafts.filter((draft) => draft.status === 'draft').length,
      queuedCount: queue.filter((item) =>
        ['pending', 'sent', 'received', 'conflict'].includes(item.status),
      ).length,
      evidenceCount: evidence.length,
      printReceiptCount: printReceipts.length,
      conflictResolutionCount: conflictResolutions.length,
      pendingWipe: wipeReceipts.length > 0,
    };
  }

  private async consumeReservationNumber(
    entityType: TEntityType,
    requestedNumber?: number,
  ): Promise<MobileNumberingReservation> {
    const reservations = await this.store.list<MobileNumberingReservation>('numbering-reservation');
    const reservation = reservations.find(
      (candidate) =>
        candidate.status === 'reserved' &&
        candidate.entityType === entityType &&
        Date.parse(candidate.validUntil) > Date.parse(this.clock.now()) &&
        candidate.nextNumber <= candidate.endNumber &&
        (!requestedNumber || candidate.nextNumber === requestedNumber),
    );
    if (!reservation) {
      throw new Error('No usable reserved numbering interval is available for offline drafting');
    }
    const consumed: MobileNumberingReservation = {
      ...reservation,
      nextNumber: reservation.nextNumber + 1,
      status: reservation.nextNumber >= reservation.endNumber ? 'consumed' : 'reserved',
    };
    await this.store.put('numbering-reservation', reservation.reservationId, consumed);
    return reservation;
  }

  private assertOfflineInvariant(draft: MobileEntityDraft<TEntityType>): void {
    if (!draft.idempotencyKey || !draft.reservationId || !draft.localContentHash) {
      throw new Error('Offline entity draft lacks idempotency, reservation or content hash');
    }
    if (!draft.deviceId || !draft.agentId || !draft.location || !draft.normativePackageId) {
      throw new Error(
        'Offline entity draft lacks device, agent, location or normative package context',
      );
    }
    if (this.requireEvidenceToFinalize && !draft.evidence.length) {
      throw new Error(
        'Offline entity draft must link at least one evidence metadata record before finalization',
      );
    }
  }

  private async requireSession(): Promise<MobileSessionContext> {
    const session = await this.store.get<MobileSessionContext>('session', 'active');
    if (!session) {
      throw new Error('Mobile session has not been bootstrapped');
    }
    return session;
  }

  private async requireNormativePackage(): Promise<MobileNormativePackageSnapshot> {
    const normativePackage = await this.store.get<MobileNormativePackageSnapshot>(
      'normative-package',
      'active',
    );
    if (!normativePackage) {
      throw new Error('No active mobile normative package is installed');
    }
    return normativePackage;
  }

  private async requireDraft(localId: string): Promise<MobileEntityDraft<TEntityType>> {
    const draft = await this.store.get<MobileEntityDraft<TEntityType>>('entity-draft', localId);
    if (!draft) {
      throw new Error(`Local entity draft ${localId} was not found`);
    }
    return draft;
  }

  private updateDraft(
    draft: MobileEntityDraft<TEntityType>,
    patch: Partial<Omit<MobileEntityDraft<TEntityType>, 'localId' | 'entityType' | 'createdAt'>>,
  ): MobileEntityDraft<TEntityType> {
    return {
      ...draft,
      ...patch,
      updatedAt: this.clock.now(),
    };
  }

  private toSyncPayload(draft: MobileEntityDraft<TEntityType>): Record<string, unknown> {
    return {
      tenant_id: draft.tenantId,
      org_unit_id: draft.orgUnitId,
      agent_id: draft.agentId,
      device_id: draft.deviceId,
      shift_id: draft.shiftId,
      entity_type: draft.entityType,
      local_entity_id: draft.localId,
      reserved_number: draft.reservedNumber,
      idempotency_key: draft.idempotencyKey,
      payload_hash: draft.localContentHash,
      normative_package_id: draft.normativePackageId,
      normative_package_version: draft.normativePackageVersion,
      location: draft.location,
      evidence: draft.evidence,
      payload: draft.payload,
      finalized_at: draft.finalizedAt,
    };
  }
}
