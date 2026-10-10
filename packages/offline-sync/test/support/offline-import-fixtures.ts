import { createHash } from 'node:crypto';
import type {
  OfflineImportManifest,
  OfflineImportRecord,
  OfflineImportMapping,
} from '../../src/import-schema.generated';

export const IMPORT_TENANT = '11111111-1111-4111-8111-111111111111';
export const IMPORT_OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
export const IMPORT_ID = '33333333-3333-4333-8333-333333333333';
export const IMPORT_AT = '2020-02-29T06:34:56.123456+03:30';
// Independent fixture encoder: no production import/hash helper participates in expected digests.
export function fixtureCanonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(fixtureCanonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${fixtureCanonical(object[key])}`)
    .join(',')}}`;
}
export const fixtureDigest = (value: unknown) =>
  `sha256:${createHash('sha256').update(fixtureCanonical(value)).digest('hex')}`;
export const fixtureBytesDigest = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function rehashManifest<T extends object>(value: T): T & { manifestSha256: string } {
  const body = { ...value } as Record<string, unknown>;
  delete body.manifestSha256;
  return { ...value, manifestSha256: fixtureDigest(body) };
}
export function importRecords(): OfflineImportRecord[] {
  const tenant_id = IMPORT_TENANT,
    id = IMPORT_ID,
    created_at = IMPORT_AT;
  const payload_hash = fixtureBytesDigest(Buffer.from('immutable historic payload capture'));
  return [
    {
      kind: 'ranges',
      row: {
        id,
        tenant_id,
        org_unit_id: 'org',
        entity_type: 'record',
        series: 'A',
        start_number: '1',
        end_number: '100',
        next_number: '11',
        status: 'active',
        created_at,
        updated_at: null,
        consumer_attributes: null,
        created_by: null,
        creation_key: null,
        creation_fingerprint: null,
        creation_receipt: null,
        cancelled_by: null,
        cancellation_reason: null,
        cancelled_at: null,
      },
    },
    {
      kind: 'reservations',
      row: {
        id,
        tenant_id,
        range_id: id,
        org_unit_id: 'org',
        entity_type: 'record',
        series: 'A',
        agent_id: 'business-agent',
        device_id: 'device',
        shift_id: null,
        start_number: '1',
        end_number: '10',
        next_number: '2',
        reserved_at: created_at,
        valid_until: '2020-03-01T00:00:00Z',
        status: 'expired',
        cancellation_reason: null,
        cancelled_by: null,
        created_at,
        updated_at: null,
        audit_actor_id: null,
        settlement_action: null,
        settlement_reason: null,
        settlement_user_ref: null,
        settled_by: null,
        idempotency_key: null,
        idempotency_fingerprint: null,
        reservation_origin: 'ctg9',
      },
    },
    {
      kind: 'queueItems',
      row: {
        tenant_id,
        id: 'queue',
        device_batch_id: 'batch',
        org_unit_id: 'org',
        agent_id: 'business-agent',
        device_id: 'device',
        entity_type: 'record',
        local_entity_id: 'local',
        idempotency_key: 'item-key',
        payload_hash,
        payload_json: { proof: true },
        reserved_number: '1',
        status: 'applied',
        created_locally_at: created_at,
        received_at: created_at,
        created_at,
        updated_at: null,
        identity_mode: 'ctg9',
      },
    },
    {
      kind: 'conflicts',
      row: {
        id,
        tenant_id,
        sync_queue_item_id: 'queue',
        local_entity_id: 'local',
        payload_hash,
        conflict_type: 'consumer-conflict',
        description: 'Original conflict',
        status: 'open',
        resolution: null,
        resolved_by: null,
        resolved_at: null,
        created_at,
        updated_at: null,
        resolution_reason: null,
        resolution_user_ref: null,
      },
    },
    {
      kind: 'batches',
      row: {
        tenant_id,
        device_id: 'device',
        device_batch_id: 'batch',
        org_unit_id: 'org',
        agent_id: 'business-agent',
        batch_sequence: '1',
        context_hash: 'original-historic-context-fingerprint',
        declared_keys: ['item-key'],
        status: 'legacy_closed_unverified',
        lease_token: null,
        lease_generation: '1',
        lease_expires_at: null,
        transport_key: 'transport',
        transport_fingerprint: 'original-transport-fingerprint',
        response_status: null,
        response_body_base64: null,
        response_headers: {},
        created_at,
        updated_at: null,
        initial_queue_status: 'received',
      },
    },
    {
      kind: 'transportKeys',
      row: {
        tenant_id,
        transport_key: 'transport',
        device_id: 'device',
        device_batch_id: 'batch',
        transport_fingerprint: 'original-transport-fingerprint',
        created_at,
      },
    },
    {
      kind: 'receipts',
      row: {
        tenant_id,
        idempotency_key: 'item-key',
        queue_item_id: 'queue',
        device_id: 'device',
        device_batch_id: 'batch',
        payload_hash,
        status: 'applied',
        error_code: null,
        context_json: null,
        received_at: created_at,
        updated_at: null,
      },
    },
    {
      kind: 'attempts',
      row: {
        tenant_id,
        device_id: 'device',
        device_batch_id: 'batch',
        queue_item_id: 'rejected-queue',
        idempotency_key: 'rejected-key',
        payload_hash: 'MALFORMED original received hash',
        status: 'rejected',
        error_code: 'OFFLINE_SYNC_PAYLOAD_HASH_INVALID',
        context_json: null,
        created_at,
      },
    },
    {
      kind: 'consumption',
      row: {
        tenant_id,
        reservation_id: id,
        number: '1',
        status: 'applied',
        server_entity_id: 'real-server-id',
        finalized_at: created_at,
      },
    },
    {
      kind: 'conflictEvidence',
      row: {
        tenant_id,
        conflict_id: id,
        queue_item_id: 'queue',
        related_queue_item_id: null,
        allowed_actions: ['resolve'],
        evidence: { original: true },
        created_at,
      },
    },
    {
      kind: 'conflictActions',
      row: {
        id,
        tenant_id,
        conflict_id: id,
        action: 'comment',
        reason: null,
        user_ref: null,
        actor_id: 'original-actor',
        resulting_status: 'open',
        created_at,
      },
    },
  ];
}
const keys: Record<OfflineImportRecord['kind'], readonly string[]> = {
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
};
export function importManifest(
  records: OfflineImportRecord[] = importRecords(),
): OfflineImportManifest {
  const mappings = records.map((record) => ({
    kind: record.kind,
    tenantId: record.row.tenant_id,
    sourceKey: `opaque/source/${record.kind}/${fixtureCanonical(
      keys[record.kind].map((key) => (record.row as unknown as Record<string, unknown>)[key]),
    )}`,
    targetKey: Object.fromEntries(
      keys[record.kind].map((key) => [
        key,
        (record.row as unknown as Record<string, unknown>)[key],
      ]),
    ),
  })) as OfflineImportMapping[];
  return rehashManifest({
    formatVersion: 'stynx-offline-import/1' as const,
    source: {
      system: 'consumer-system',
      snapshotId: 'immutable-snapshot',
      sha256: fixtureBytesDigest(Buffer.from('consumer-owned immutable raw snapshot')),
    },
    mappings,
    records,
    archives: [],
  });
}
