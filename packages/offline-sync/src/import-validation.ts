import { createHash } from 'node:crypto';
import { OfflineImportError } from './import-contract';
import { canonicalOfflineSyncPayload } from './payload-integrity';

/** Applies the payload canonical encoding to any legal JSON root. */
export function canonicalImportJson(value: unknown): string {
  return canonicalOfflineSyncPayload({ value }).slice(9, -1);
}

import { OFFLINE_IMPORT_SCHEMA } from './import-schema.generated';
import type {
  OfflineImportManifest,
  OfflineImportRecord,
  OfflineImportMapping,
  OfflineImportBatchesKey,
} from './import-schema.generated';

export const IMPORT_RELATIONS = {
  ranges: 'numbering_ranges',
  reservations: 'numbering_reservations',
  queueItems: 'sync_queue_items',
  conflicts: 'sync_conflicts',
  batches: 'sync_batches',
  transportKeys: 'sync_batch_transport_keys',
  receipts: 'sync_item_receipts',
  attempts: 'sync_item_attempts',
  consumption: 'numbering_consumption',
  conflictEvidence: 'sync_conflict_evidence',
  conflictActions: 'sync_conflict_actions',
} as const;
export const IMPORT_KEYS = {
  ranges: ['id'],
  reservations: ['id'],
  queueItems: ['tenant_id', 'id'],
  conflicts: ['id'],
  batches: ['tenant_id', 'device_id', 'device_batch_id'],
  transportKeys: ['tenant_id', 'transport_key'],
  receipts: ['tenant_id', 'idempotency_key'],
  attempts: ['tenant_id', 'device_id', 'device_batch_id', 'queue_item_id'],
  consumption: ['tenant_id', 'reservation_id', 'number'],
  conflictEvidence: ['tenant_id', 'conflict_id', 'queue_item_id'],
  conflictActions: ['tenant_id', 'id'],
} as const;
export function importDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalImportJson(value)).digest('hex')}`;
}
export function bytesDigest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
export function importRefuse(object: string): never {
  throw new OfflineImportError('invalid-manifest', object);
}
export function boundedImportText(
  value: string,
  object: string,
  maximum: number,
  minimum = 1,
): void {
  if (
    value.includes('\0') ||
    Buffer.byteLength(value, 'utf8') < minimum ||
    Buffer.byteLength(value, 'utf8') > maximum
  )
    importRefuse(object);
}
/** Lossless microsecond validation. Never constructs a Date from a source instant. */
export function importInstantMicroseconds(value: string): bigint {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) importRefuse('instant');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zoneHours = Number(match[10] ?? 0),
    zoneMinutes = Number(match[11] ?? 0);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHours > 15 ||
    zoneMinutes > 59
  )
    importRefuse('instant');
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    importRefuse('instant');
  const offset = (zoneHours * 60 + zoneMinutes) * 60_000 * (match[9] === '-' ? -1 : 1);
  return BigInt(calendar.getTime() - offset) * 1000n + BigInt((match[7] ?? '').padEnd(6, '0'));
}
interface Schema {
  $ref?: string;
  const?: unknown;
  enum?: readonly unknown[];
  type?: string | readonly string[];
  oneOf?: readonly Schema[];
  anyOf?: readonly Schema[];
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}
const schema = OFFLINE_IMPORT_SCHEMA as unknown as Schema & { $defs: Record<string, Schema> };
function conforms(value: unknown, rule: Schema): boolean {
  if (rule.$ref) return conforms(value, schema.$defs[rule.$ref.split('/').at(-1)!]!);
  if (rule.oneOf) return rule.oneOf.filter((item) => conforms(value, item)).length === 1;
  if (rule.anyOf) return rule.anyOf.some((item) => conforms(value, item));
  if ('const' in rule && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (Array.isArray(rule.type)) return rule.type.some((type) => conforms(value, { ...rule, type }));
  if (rule.type === 'null') return value === null;
  if (rule.type === 'boolean') return typeof value === 'boolean';
  if (rule.type === 'number' || rule.type === 'integer')
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (rule.type !== 'integer' || Number.isSafeInteger(value)) &&
      (rule.minimum === undefined || value >= rule.minimum) &&
      (rule.maximum === undefined || value <= rule.maximum)
    );
  if (rule.type === 'string') {
    if (
      typeof value !== 'string' ||
      (rule.minLength !== undefined && [...value].length < rule.minLength) ||
      (rule.maxLength !== undefined && [...value].length > rule.maxLength) ||
      (rule.pattern !== undefined && !new RegExp(rule.pattern, 'u').test(value))
    )
      return false;
    if (
      rule.format === 'uuid' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)
    )
      return false;
    if (rule.format === 'date-time') {
      try {
        importInstantMicroseconds(value);
      } catch {
        return false;
      }
    }
    return true;
  }
  if (rule.type === 'array')
    return Array.isArray(value) && value.every((item) => conforms(item, rule.items!));
  if (rule.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    if (rule.required?.some((key) => !Object.hasOwn(object, key))) return false;
    return Object.entries(object).every(([key, item]) =>
      rule.properties && Object.hasOwn(rule.properties, key)
        ? conforms(item, rule.properties[key]!)
        : rule.additionalProperties === false
          ? false
          : typeof rule.additionalProperties === 'object'
            ? conforms(item, rule.additionalProperties)
            : true,
    );
  }
  return true;
}
export function importRecordKey(record: OfflineImportRecord): Record<string, unknown> {
  const row = record.row as unknown as Record<string, unknown>;
  return Object.fromEntries(IMPORT_KEYS[record.kind].map((key) => [key, row[key]]));
}
export function importRecordIdentity(record: OfflineImportRecord): string {
  return `${record.kind}:${canonicalImportJson(importRecordKey(record))}`;
}
function mappingIdentity(mapping: OfflineImportMapping): string {
  return `${mapping.kind}:${canonicalImportJson(mapping.targetKey)}`;
}
function validateRow(record: OfflineImportRecord): void {
  const row = record.row as unknown as Record<string, unknown>;
  const scopeBounds: Record<string, readonly [number, number]> = {
    org_unit_id: [1, 255],
    entity_type: [1, 100],
    series: [1, 80],
    agent_id: [1, 255],
    device_id: [1, 255],
    device_batch_id: [1, 255],
    shift_id: [1, 255],
    local_entity_id: [1, 255],
    idempotency_key: [1, 255],
    queue_item_id: [1, 255],
    sync_queue_item_id: [1, 255],
    related_queue_item_id: [1, 255],
  };
  const perKind: Partial<
    Record<OfflineImportRecord['kind'], Record<string, readonly [number, number]>>
  > = {
    ranges: {
      created_by: [1, 255],
      creation_key: [1, 255],
      cancelled_by: [1, 255],
      cancellation_reason: [0, 500],
    },
    reservations: { cancelled_by: [0, 255], cancellation_reason: [0, 500] },
    queueItems: { id: [1, 255] },
    conflicts: { conflict_type: [1, 100], description: [1, 4000], resolved_by: [0, 255] },
    conflictActions: {
      action: [1, 100],
      reason: [0, 4000],
      user_ref: [0, 255],
      actor_id: [1, 255],
    },
  };
  const byteBounds = { ...scopeBounds, ...perKind[record.kind] };
  for (const [column, value] of Object.entries(row)) {
    if (typeof value === 'string') {
      // PostgreSQL text cannot preserve NUL, including unbounded historical context text.
      if (value.includes('\0')) importRefuse(`${record.kind}.${column}`);
      if (byteBounds[column] !== undefined)
        boundedImportText(
          value,
          `${record.kind}.${column}`,
          byteBounds[column]![1],
          byteBounds[column]![0],
        );
      const property = schema.$defs[`${record.kind}Row`]!.properties![column]!;
      if (
        property.$ref === '#/$defs/bigint' ||
        property.anyOf?.some((item) => item.$ref === '#/$defs/bigint')
      ) {
        const number = BigInt(value);
        if (number < -9223372036854775808n || number > 9223372036854775807n)
          importRefuse(`${record.kind}.${column}`);
        if (
          column !== 'lease_generation' &&
          (number < -9007199254740991n || number > 9007199254740991n)
        )
          importRefuse(`${record.kind}.${column}`);
      }
      if (
        column === 'response_body_base64' &&
        Buffer.from(value, 'base64').toString('base64') !== value
      )
        importRefuse('batches.response_body_base64');
    }
  }
  if (record.kind === 'queueItems') boundedImportText(record.row.id, 'queueItems.id', 255);
  if (record.kind === 'ranges') {
    const r = record.row;
    if (!validRangeCreationEvidence(r, importInstantMicroseconds(r.created_at)))
      importRefuse('ranges.creation-receipt');
    if (r.cancellation_reason !== null)
      boundedImportText(r.cancellation_reason, 'ranges.cancellation_reason', 500, 0);
    if (
      BigInt(r.start_number) > BigInt(r.end_number) ||
      BigInt(r.next_number) < BigInt(r.start_number) ||
      BigInt(r.next_number) > BigInt(r.end_number) + 1n ||
      BigInt(r.end_number) >= 9007199254740991n
    )
      importRefuse('ranges.counter');
    if (
      r.consumer_attributes !== null &&
      Buffer.byteLength(canonicalImportJson(r.consumer_attributes)) > 4096
    )
      importRefuse('ranges.consumer_attributes');
    if (
      (r.creation_key === null) !== (r.creation_fingerprint === null) ||
      (r.creation_key === null) !== (r.creation_receipt === null)
    )
      importRefuse('ranges.creation-evidence');
  }
  if (record.kind === 'reservations') {
    const r = record.row;
    if (
      BigInt(r.start_number) > BigInt(r.end_number) ||
      BigInt(r.next_number) < BigInt(r.start_number) ||
      BigInt(r.next_number) > BigInt(r.end_number) + 1n ||
      (r.reservation_origin === 'e6' && r.shift_id === null) ||
      (r.idempotency_key === null) !== (r.idempotency_fingerprint === null)
    )
      importRefuse('reservations.counter-scope-key');
    if (r.cancellation_reason !== null)
      boundedImportText(r.cancellation_reason, 'reservations.cancellation_reason', 500, 0);
  }
  if (
    record.kind === 'conflicts' &&
    ((record.row.status === 'open' &&
      (record.row.resolution !== null || record.row.resolved_at !== null)) ||
      (record.row.status === 'resolved' &&
        (record.row.resolution === null || record.row.resolved_at === null)))
  )
    importRefuse('conflicts.resolution');
  if (record.kind === 'batches') {
    const r = record.row;
    if (
      BigInt(r.lease_generation) < 0n ||
      (r.batch_sequence !== null && BigInt(r.batch_sequence) < 1n) ||
      (r.lease_token === null) !== (r.lease_expires_at === null)
    )
      importRefuse('batches.lifecycle');
    const declared = r.declared_keys.filter((key) => key !== null);
    if (new Set(declared).size !== declared.length) importRefuse('batches.declared_keys');
  }
}
/** Deep snapshot before callbacks or SQL; validates all static facts and digests. */
export function validateOfflineImportManifest(input: unknown): OfflineImportManifest {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(canonicalImportJson(input));
  } catch {
    importRefuse('legal-json');
  }
  if (!conforms(snapshot, schema)) importRefuse('envelope');
  const checkText = (value: unknown): void => {
    if (typeof value === 'string' && value.includes('\0')) importRefuse('postgres-text');
    if (value !== null && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (key.includes('\0')) importRefuse('postgres-json-key');
        checkText(child);
      }
  };
  checkText(snapshot);
  const manifest = snapshot as OfflineImportManifest;
  boundedImportText(manifest.source.system, 'source.system', 255);
  boundedImportText(manifest.source.snapshotId, 'source.snapshotId', 4096);
  const { manifestSha256, ...body } = manifest;
  if (importDigest(body) !== manifestSha256) importRefuse('manifest-digest');
  const records = new Map<string, OfflineImportRecord>();
  for (const record of manifest.records) {
    validateRow(record);
    const key = importRecordIdentity(record);
    if (records.has(key)) importRefuse('duplicate-record');
    records.set(key, record);
  }
  const mapped = new Set<string>(),
    sourceKeys = new Set<string>();
  for (const mapping of manifest.mappings) {
    boundedImportText(mapping.sourceKey, 'mapping.sourceKey', 4096);
    const identity = mappingIdentity(mapping),
      record = records.get(identity);
    const sourceKey = canonicalImportJson([mapping.kind, mapping.tenantId, mapping.sourceKey]);
    if (
      !record ||
      record.row.tenant_id !== mapping.tenantId ||
      mapped.has(identity) ||
      sourceKeys.has(sourceKey)
    )
      importRefuse('mapping-identity');
    mapped.add(identity);
    sourceKeys.add(sourceKey);
  }
  if (mapped.size !== records.size) importRefuse('missing-mapping');
  const archives = new Set<string>(),
    mappingSha256 = importDigest(manifest.mappings);
  for (const archive of manifest.archives) {
    const key = `batches:${canonicalImportJson(archive.batch)}`,
      record = records.get(key);
    if (
      archives.has(key) ||
      record?.kind !== 'batches' ||
      archive.sourceSha256 !== manifest.source.sha256 ||
      archive.mappingSha256 !== mappingSha256
    )
      importRefuse('archive-identity');
    if (
      Buffer.from(archive.responseBodyBase64, 'base64').toString('base64') !==
        archive.responseBodyBase64 ||
      bytesDigest(Buffer.from(archive.responseBodyBase64, 'base64')) !==
        archive.responseBodySha256 ||
      importDigest(archive.responseHeaders) !== archive.responseHeadersSha256
    )
      importRefuse('archive-digest');
    if (
      record.row.response_status !== archive.responseStatus ||
      record.row.response_body_base64 !== archive.responseBodyBase64 ||
      canonicalImportJson(record.row.response_headers) !==
        canonicalImportJson(archive.responseHeaders)
    )
      importRefuse('archive-source-facts');
    archives.add(key);
  }
  return manifest;
}

/** Strict JSON parser retains decoded-name uniqueness before object materialization. */
export function parseImportJson(text: string): unknown {
  if (typeof text !== 'string') importRefuse('json-text');
  let at = 0;
  const whitespace = (): void => {
    while (/[\x20\t\r\n]/u.test(text[at] ?? '') && at < text.length) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === '"') return JSON.parse(text.slice(start, at)) as string;
      if (char === '\\') at++;
    }
    return importRefuse('json-string');
  };
  const value = (): unknown => {
    whitespace();
    const char = text[at];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      const object = char === '{',
        close = object ? '}' : ']';
      at++;
      whitespace();
      const result: Record<string, unknown> | unknown[] = object
        ? (Object.create(null) as Record<string, unknown>)
        : [];
      const keys = new Set<string>();
      if (text[at] === close) {
        at++;
        return result;
      }
      for (;;) {
        whitespace();
        if (object) {
          if (text[at] !== '"') importRefuse('json-property');
          const key = string();
          if (keys.has(key)) importRefuse('duplicate-json-property');
          keys.add(key);
          whitespace();
          if (text[at++] !== ':') importRefuse('json-colon');
          (result as Record<string, unknown>)[key] = value();
        } else (result as unknown[]).push(value());
        whitespace();
        if (text[at] === close) {
          at++;
          return result;
        }
        if (text[at++] !== ',') importRefuse('json-separator');
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
      text.slice(at),
    )?.[0];
    if (!token) importRefuse('json-value');
    at += token.length;
    return JSON.parse(token) as unknown;
  };
  try {
    const parsed = value();
    whitespace();
    if (at !== text.length) importRefuse('json-trailing');
    return parsed;
  } catch (error) {
    if (error instanceof OfflineImportError) throw error;
    return importRefuse('json-syntax');
  }
}

export interface RangeCreationEvidence {
  id: string;
  tenant_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  start_number: string;
  end_number: string;
  consumer_attributes: unknown;
  created_by: string | null;
  creation_key: string | null;
  creation_fingerprint: string | null;
  creation_receipt: unknown;
}
/** Checks immutable initial facts without normalizing the original receipt's timestamp text. */
export function validRangeCreationEvidence(
  row: RangeCreationEvidence,
  createdMicroseconds: bigint,
): boolean {
  if (row.creation_key === null)
    return row.creation_fingerprint === null && row.creation_receipt === null;
  try {
    if (
      !row.created_by ||
      !row.creation_receipt ||
      typeof row.creation_receipt !== 'object' ||
      Array.isArray(row.creation_receipt)
    )
      return false;
    const receipt = row.creation_receipt as Record<string, unknown>;
    if (
      typeof receipt.createdAt !== 'string' ||
      importInstantMicroseconds(receipt.createdAt) !== createdMicroseconds
    )
      return false;
    const request = {
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      entityType: row.entity_type,
      series: row.series,
      startNumber: Number(row.start_number),
      endNumber: Number(row.end_number),
      ...(row.consumer_attributes === null ? {} : { consumerAttributes: row.consumer_attributes }),
    };
    const expected = {
      id: row.id,
      ...request,
      nextNumber: request.startNumber,
      status: 'active',
      createdAt: receipt.createdAt,
      createdBy: row.created_by,
    };
    return (
      importDigest(request) === row.creation_fingerprint &&
      canonicalImportJson(receipt) === canonicalImportJson(expected)
    );
  } catch {
    return false;
  }
}

export function freezeImportJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeImportJson(child);
    Object.freeze(value);
  }
  return value;
}

/** Public duplicate-aware manifest parser with the same validation as owner import. */
export function parseOfflineImportManifest(text: string): OfflineImportManifest {
  return validateOfflineImportManifest(parseImportJson(text));
}

export function importBatchIdentity(batch: OfflineImportBatchesKey): string {
  return canonicalImportJson(batch);
}
