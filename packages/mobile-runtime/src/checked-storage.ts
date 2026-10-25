import type {
  MobileSessionContext,
  MobileDevicePosture,
  MobileNormativePackageSnapshot,
  MobileNumberingReservation,
  MobileLocationContext,
  MobileEvidenceDraft,
  MobileStoredEntityDraft,
  MobileSyncQueueItem,
} from './types.js';

type Collection =
  | 'session'
  | 'device'
  | 'normative-package'
  | 'numbering-reservation'
  | 'entity-draft'
  | 'sync-queue';
function invalid(collection: Collection): never {
  throw new TypeError(`Invalid stored mobile record: ${collection}`);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Capture getters once; only declared missing/nonenumerable fields consult the original again. */
function snapshot(value: unknown, collection: Collection) {
  if (!isRecord(value)) return invalid(collection);
  const values = { ...value };
  return {
    values,
    read(key: string, required = true): { present: boolean; value: unknown } {
      if (Object.hasOwn(values, key)) return { present: true, value: values[key] };
      if (!required && !(key in value)) return { present: false, value: undefined };
      const field: unknown = Reflect.get(value, key);
      Object.defineProperty(values, key, {
        value: field,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      return { present: true, value: field };
    },
  };
}
type Snapshot = ReturnType<typeof snapshot>;
function string(value: unknown, collection: Collection): string {
  if (typeof value !== 'string') return invalid(collection);
  return value;
}
function number(value: unknown, collection: Collection): number {
  if (typeof value !== 'number') return invalid(collection);
  return value;
}
function boolean(value: unknown, collection: Collection): boolean {
  if (typeof value !== 'boolean') return invalid(collection);
  return value;
}
function record(value: unknown, collection: Collection): Record<string, unknown> {
  if (!isRecord(value)) return invalid(collection);
  return value;
}
function optional<T>(view: Snapshot, key: string, parse: (value: unknown) => T): T | undefined {
  const field = view.read(key, false);
  return field.present ? parse(field.value) : undefined;
}
function oneOf<const T extends string>(
  value: unknown,
  collection: Collection,
  ...members: readonly T[]
): T {
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (member !== undefined && value === member) return member;
  }
  return invalid(collection);
}
function entity<T extends string>(
  value: unknown,
  members: readonly T[],
  collection: Collection,
): T {
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (member !== undefined && value === member) return member;
  }
  return invalid(collection);
}

/** Only typed structural arrays are copied; count-only raw collections do not enter here. */
function array<T>(value: unknown, parse: (item: unknown) => T, collection: Collection): T[] {
  if (!Array.isArray(value)) return invalid(collection);
  const source: unknown[] = value;
  const length = source.length;
  const result: T[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(source, index)) return invalid(collection);
    const item: unknown = source[index];
    result.push(parse(item));
  }
  return result;
}

export function checkedEntityTypes<T extends string>(
  source: readonly T[] | undefined,
): readonly T[] {
  if (source === undefined) throw new TypeError('Invalid mobile runtime entityTypes');
  const raw: unknown = source;
  if (!Array.isArray(raw)) throw new TypeError('Invalid mobile runtime entityTypes');
  const values: readonly T[] = source;
  const length = values.length;
  const captured: T[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(values, index)) throw new TypeError('Invalid mobile runtime entityTypes');
    const value = values[index];
    if (typeof value !== 'string') throw new TypeError('Invalid mobile runtime entityTypes');
    captured.push(value);
  }
  return captured;
}

/** Count-only snapshot filters preserve their original single property read. */
export function storedStatus(value: unknown): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading 'status')`);
  }
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    return Reflect.get(target, 'status', value);
  }
  throw new TypeError('Invalid mobile status property target');
}

function readSession(value: unknown): MobileSessionContext {
  const collection = 'session';
  const view = snapshot(value, collection);
  const tenantId = string(view.read('tenantId').value, collection);
  const orgUnitId = string(view.read('orgUnitId').value, collection);
  const agentId = string(view.read('agentId').value, collection);
  const deviceId = string(view.read('deviceId').value, collection);
  const shiftId = string(view.read('shiftId').value, collection);
  const appVersion = string(view.read('appVersion').value, collection);
  const roles = array(view.read('roles').value, (item) => string(item, collection), collection);
  return {
    ...view.values,
    tenantId,
    orgUnitId,
    agentId,
    deviceId,
    shiftId,
    appVersion,
    roles,
  };
}

function readDevice(value: unknown): MobileDevicePosture {
  const collection = 'device';
  const view = snapshot(value, collection);
  const homologated = boolean(view.read('homologated').value, collection);
  const remoteWipeVersion = number(view.read('remoteWipeVersion').value, collection);
  const secureHardwareBacked = boolean(view.read('secureHardwareBacked').value, collection);
  const printerStatus = oneOf(
    view.read('printerStatus').value,
    collection,
    'paired',
    'missing',
    'error',
  );
  const networkStatus = oneOf(
    view.read('networkStatus').value,
    collection,
    'online',
    'offline',
    'limited',
  );
  return {
    ...view.values,
    homologated,
    remoteWipeVersion,
    secureHardwareBacked,
    printerStatus,
    networkStatus,
  };
}

function readPackage(value: unknown): MobileNormativePackageSnapshot {
  const collection = 'normative-package';
  const view = snapshot(value, collection);
  const packageId = string(view.read('packageId').value, collection);
  const packageVersion = string(view.read('packageVersion').value, collection);
  const manifestHash = string(view.read('manifestHash').value, collection);
  const validUntil = string(view.read('validUntil').value, collection);
  const status = oneOf(view.read('status').value, collection, 'published', 'expired', 'retired');
  return {
    ...view.values,
    packageId,
    packageVersion,
    manifestHash,
    validUntil,
    status,
  };
}

function readReservation(value: unknown): MobileNumberingReservation {
  const collection = 'numbering-reservation';
  const view = snapshot(value, collection);
  const reservationId = string(view.read('reservationId').value, collection);
  const rangeId = string(view.read('rangeId').value, collection);
  const entityType = string(view.read('entityType').value, collection);
  const series = string(view.read('series').value, collection);
  const startNumber = number(view.read('startNumber').value, collection);
  const endNumber = number(view.read('endNumber').value, collection);
  const nextNumber = number(view.read('nextNumber').value, collection);
  const validUntil = string(view.read('validUntil').value, collection);
  const status = oneOf(
    view.read('status').value,
    collection,
    'reserved',
    'consumed',
    'expired',
    'cancelled',
  );
  return {
    ...view.values,
    reservationId,
    rangeId,
    entityType,
    series,
    startNumber,
    endNumber,
    nextNumber,
    validUntil,
    status,
  };
}

function readLocation(value: unknown, collection: Collection): MobileLocationContext {
  const view = snapshot(value, collection);
  const latitude = number(view.read('latitude').value, collection);
  const longitude = number(view.read('longitude').value, collection);
  const accuracyMeters = number(view.read('accuracyMeters').value, collection);
  const capturedAt = string(view.read('capturedAt').value, collection);
  const source = oneOf(view.read('source').value, collection, 'gps', 'network', 'manual');
  const manualJustification = optional(view, 'manualJustification', (field) =>
    string(field, collection),
  );
  return {
    ...view.values,
    latitude,
    longitude,
    accuracyMeters,
    capturedAt,
    source,
    ...(manualJustification === undefined ? {} : { manualJustification }),
  };
}

function readEvidence(value: unknown, collection: Collection): MobileEvidenceDraft {
  const view = snapshot(value, collection);
  const localEvidenceId = string(view.read('localEvidenceId').value, collection);
  const hashAlgorithm = oneOf(view.read('hashAlgorithm').value, collection, 'sha256');
  const hashValue = string(view.read('hashValue').value, collection);
  const mediaType = oneOf(
    view.read('mediaType').value,
    collection,
    'image/jpeg',
    'video/mp4',
    'application/pdf',
    'signature/json',
  );
  const capturedAt = string(view.read('capturedAt').value, collection);
  const storageIntentId = optional(view, 'storageIntentId', (field) => string(field, collection));
  const linkedLocalEntityId = optional(view, 'linkedLocalEntityId', (field) =>
    string(field, collection),
  );
  return {
    ...view.values,
    localEvidenceId,
    hashAlgorithm,
    hashValue,
    mediaType,
    capturedAt,
    ...(storageIntentId === undefined ? {} : { storageIntentId }),
    ...(linkedLocalEntityId === undefined ? {} : { linkedLocalEntityId }),
  };
}

function readDraft<T extends string>(
  value: unknown,
  entityTypes: readonly T[],
): MobileStoredEntityDraft<T> {
  const collection = 'entity-draft';
  const view = snapshot(value, collection);
  const localId = string(view.read('localId').value, collection);
  const entityType = entity(view.read('entityType').value, entityTypes, collection);
  const tenantId = string(view.read('tenantId').value, collection);
  const orgUnitId = string(view.read('orgUnitId').value, collection);
  const agentId = string(view.read('agentId').value, collection);
  const deviceId = string(view.read('deviceId').value, collection);
  const shiftId = string(view.read('shiftId').value, collection);
  const status = oneOf(
    view.read('status').value,
    collection,
    'draft',
    'finalized',
    'queued',
    'synced',
    'conflict',
    'wiped',
  );
  const reservedNumber = number(view.read('reservedNumber').value, collection);
  const reservationId = string(view.read('reservationId').value, collection);
  const idempotencyKey = string(view.read('idempotencyKey').value, collection);
  const normativePackageId = string(view.read('normativePackageId').value, collection);
  const normativePackageVersion = string(view.read('normativePackageVersion').value, collection);
  const localContentHash = string(view.read('localContentHash').value, collection);
  const payload = view.read('payload').value;
  const location = readLocation(view.read('location').value, collection);
  const evidence = array(
    view.read('evidence').value,
    (item) => readEvidence(item, collection),
    collection,
  );
  const createdAt = string(view.read('createdAt').value, collection);
  const updatedAt = string(view.read('updatedAt').value, collection);
  const finalizedAt = optional(view, 'finalizedAt', (field) => string(field, collection));
  return {
    ...view.values,
    localId,
    entityType,
    tenantId,
    orgUnitId,
    agentId,
    deviceId,
    shiftId,
    status,
    reservedNumber,
    reservationId,
    idempotencyKey,
    normativePackageId,
    normativePackageVersion,
    localContentHash,
    payload,
    location,
    evidence,
    createdAt,
    updatedAt,
    ...(finalizedAt === undefined ? {} : { finalizedAt }),
  };
}

function readQueue<T extends string>(
  value: unknown,
  entityTypes: readonly T[],
): MobileSyncQueueItem<T> {
  const collection = 'sync-queue';
  const view = snapshot(value, collection);
  const queueItemId = string(view.read('queueItemId').value, collection);
  const entityType = entity(view.read('entityType').value, entityTypes, collection);
  const localEntityId = string(view.read('localEntityId').value, collection);
  const status = oneOf(
    view.read('status').value,
    collection,
    'pending',
    'sent',
    'received',
    'applied',
    'conflict',
    'rejected',
  );
  const attempts = number(view.read('attempts').value, collection);
  const idempotencyKey = string(view.read('idempotencyKey').value, collection);
  const payloadHash = string(view.read('payloadHash').value, collection);
  const payloadJson = record(view.read('payloadJson').value, collection);
  const deviceId = string(view.read('deviceId').value, collection);
  const agentId = string(view.read('agentId').value, collection);
  const tenantId = string(view.read('tenantId').value, collection);
  const orgUnitId = string(view.read('orgUnitId').value, collection);
  const normativePackageId = string(view.read('normativePackageId').value, collection);
  const reservedNumber = optional(view, 'reservedNumber', (field) => number(field, collection));
  const location = optional(view, 'location', (field) => readLocation(field, collection));
  const createdLocallyAt = string(view.read('createdLocallyAt').value, collection);
  const lastSubmittedAt = optional(view, 'lastSubmittedAt', (field) => string(field, collection));
  return {
    ...view.values,
    queueItemId,
    entityType,
    localEntityId,
    status,
    attempts,
    idempotencyKey,
    payloadHash,
    payloadJson,
    deviceId,
    agentId,
    tenantId,
    orgUnitId,
    normativePackageId,
    ...(reservedNumber === undefined ? {} : { reservedNumber }),
    ...(location === undefined ? {} : { location }),
    createdLocallyAt,
    ...(lastSubmittedAt === undefined ? {} : { lastSubmittedAt }),
  };
}

export function checkedSession(value: unknown): MobileSessionContext | undefined {
  return value === undefined ? undefined : readSession(value);
}

export function checkedDevice(value: unknown): MobileDevicePosture | undefined {
  return value === undefined ? undefined : readDevice(value);
}

export function checkedPackage(value: unknown): MobileNormativePackageSnapshot | undefined {
  return value === undefined ? undefined : readPackage(value);
}

export function checkedDraft<T extends string>(
  value: unknown,
  entityTypes: readonly T[],
): MobileStoredEntityDraft<T> | undefined {
  return value === undefined ? undefined : readDraft(value, entityTypes);
}

export function checkedQueue<T extends string>(
  value: unknown,
  entityTypes: readonly T[],
): MobileSyncQueueItem<T> | undefined {
  return value === undefined ? undefined : readQueue(value, entityTypes);
}

export function checkedReservations(values: unknown[]): MobileNumberingReservation[] {
  return array(values, readReservation, 'numbering-reservation');
}
export function checkedQueueList<T extends string>(
  values: unknown[],
  entityTypes: readonly T[],
): MobileSyncQueueItem<T>[] {
  return array(values, (value) => readQueue(value, entityTypes), 'sync-queue');
}
