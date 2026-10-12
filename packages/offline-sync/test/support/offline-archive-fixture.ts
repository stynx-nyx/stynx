import { createHash } from 'node:crypto';
import type { OfflineImportRecord } from '../../src/import-schema.generated';
import {
  importRecords,
  importManifest,
  IMPORT_AT,
  fixtureDigest,
  fixtureBytesDigest,
  rehashManifest,
} from './offline-import-fixtures';

// Independent historical transport capture encoder; deliberately separate from the new canonical payload codec.
function historicJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(historicJson).join(',')}]`;
  if (typeof value !== 'object') return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${historicJson(object[key])}`)
    .join(',')}}`;
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
export function archivedFixture(tenant: string, actor = 'authenticated-import-replay-actor') {
  const header = 'original-transport-header';
  const path = '/offline-sync/sync-batches';
  const payload = { proof: true };
  const hash = fixtureDigest(payload);
  const input = {
    orgUnitId: 'org',
    deviceId: 'device',
    deviceBatchId: 'batch',
    batchSequence: 1,
    items: [
      {
        queueItemId: 'queue',
        entityType: 'record',
        localEntityId: 'local',
        idempotencyKey: 'item-key',
        payloadHash: hash,
        payloadJson: payload,
        createdLocallyAt: IMPORT_AT,
        reservedNumber: 1,
      },
    ],
  };
  const transportKey = sha(
    JSON.stringify({
      tenantId: tenant,
      userId: actor,
      routeKey: `POST:${path}`,
      headerValue: header,
    }),
  );
  const fingerprint = sha(`POST:${path}:${historicJson(input)}`);
  const context = sha(
    historicJson({
      orgUnitId: 'org',
      agentId: 'business-agent',
      sequence: 1,
      items: [
        {
          id: 'queue',
          key: 'item-key',
          hash,
          payloadJsonHash: sha(historicJson(payload)),
          entityType: 'record',
          localEntityId: 'local',
          reservationId: null,
          reservedNumber: 1,
          createdLocallyAt: IMPORT_AT,
        },
      ],
    }),
  );
  const ack = {
    batchId: 'batch',
    acceptedItems: 1,
    duplicateItems: 0,
    items: [
      {
        queueItemId: 'queue',
        idempotencyKey: 'item-key',
        tenantId: tenant,
        status: 'applied',
        payloadHash: hash,
        entityType: 'record',
        localEntityId: 'local',
        createdLocallyAt: IMPORT_AT,
        agentId: 'business-agent',
        orgUnitId: 'org',
        deviceId: 'device',
        receivedAt: IMPORT_AT,
        payloadJson: payload,
        reservedNumber: 1,
      },
    ],
    conflicts: [],
    receipt: {
      deviceId: 'device',
      deviceBatchId: 'batch',
      batchSequence: 1,
      status: 'closed',
      responseStatus: 201,
      responseBodyBytes: null,
      responseHeaders: {},
      items: [{ queueItemId: 'queue', status: 'applied' }],
    },
  };
  // Whitespace and key ordering are source facts: a JSON parse/stringify transport would change these bytes.
  const bytes = Buffer.from(`\n ${JSON.stringify(ack, null, 3)}\n\n`);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    etag: '"original-source-response"',
  };
  const records = importRecords()
    .filter((record) =>
      ['queueItems', 'batches', 'transportKeys', 'receipts'].includes(record.kind),
    )
    .map((record) => {
      const row = { ...record.row, tenant_id: tenant } as Record<string, unknown>;
      if (record.kind === 'queueItems' || record.kind === 'receipts') row.payload_hash = hash;
      if (record.kind === 'batches')
        Object.assign(row, {
          context_hash: context,
          status: 'closed',
          transport_key: transportKey,
          transport_fingerprint: fingerprint,
          response_status: 201,
          response_body_base64: bytes.toString('base64'),
          response_headers: headers,
        });
      if (record.kind === 'transportKeys')
        Object.assign(row, { transport_key: transportKey, transport_fingerprint: fingerprint });
      return { ...record, row } as OfflineImportRecord;
    });
  const source = importManifest(records);
  const batch = { tenant_id: tenant, device_id: 'device', device_batch_id: 'batch' };
  source.archives = [
    {
      batch,
      sourceSha256: source.source.sha256,
      mappingSha256: fixtureDigest(source.mappings),
      responseStatus: 201,
      responseBodyBase64: bytes.toString('base64'),
      responseBodySha256: fixtureBytesDigest(bytes),
      responseHeaders: headers,
      responseHeadersSha256: fixtureDigest(headers),
      verificationEvidence: { captureId: 'independent-consumer-capture-17' },
    },
  ];
  const manifest = rehashManifest(source);
  const proof = {
    verdict: 'verified' as const,
    sourceSha256: manifest.source.sha256,
    manifestSha256: manifest.manifestSha256,
    mappingSha256: fixtureDigest(manifest.mappings),
    batch,
    responseBodySha256: fixtureBytesDigest(bytes),
    responseHeadersSha256: fixtureDigest(headers),
    evidenceId: 'independently-verified-capture-17',
  };
  return { manifest, input, actor, header, path, bytes, headers, ack, proof };
}

/** Rebind only independently captured source facts after a deliberate test corruption. */
export function recaptureArchive(capture: ReturnType<typeof archivedFixture>) {
  const records = structuredClone(capture.manifest.records);
  const batch = records.find((record) => record.kind === 'batches')!;
  const bytes = Buffer.from(`\n ${JSON.stringify(capture.ack, null, 3)}\n\n`);
  Object.assign(batch.row, {
    response_body_base64: bytes.toString('base64'),
    response_headers: capture.headers,
  });
  const manifest = importManifest(records);
  manifest.archives = [
    {
      ...capture.manifest.archives[0]!,
      mappingSha256: fixtureDigest(manifest.mappings),
      responseBodyBase64: bytes.toString('base64'),
      responseBodySha256: fixtureBytesDigest(bytes),
      responseHeaders: capture.headers,
      responseHeadersSha256: fixtureDigest(capture.headers),
    },
  ];
  const bound = rehashManifest(manifest);
  return {
    ...capture,
    bytes,
    manifest: bound,
    proof: {
      ...capture.proof,
      manifestSha256: bound.manifestSha256,
      mappingSha256: fixtureDigest(bound.mappings),
      responseBodySha256: fixtureBytesDigest(bytes),
      responseHeadersSha256: fixtureDigest(capture.headers),
    },
  };
}

export function legacyArchivedFixture(tenant: string, count: 1 | 2, actor?: string) {
  const capture = archivedFixture(tenant, actor);
  const prototype = capture.input.items[0]!;
  capture.input.items = Array.from({ length: count }, (_, index) => {
    const payloadJson = index === 0 ? prototype.payloadJson : { proof: true, ordinal: index + 1 };
    const item = {
      ...prototype,
      queueItemId: index === 0 ? 'queue' : `queue-${index + 1}`,
      localEntityId: index === 0 ? 'local' : `local-${index + 1}`,
      payloadJson,
      payloadHash: fixtureDigest(payloadJson),
      reservedNumber: index + 1,
    };
    delete (item as Record<string, unknown>).idempotencyKey;
    return item;
  });
  const records = capture.manifest.records;
  const queue = records.find((record) => record.kind === 'queueItems')!;
  const receipt = records.find((record) => record.kind === 'receipts')!;
  const batch = records.find((record) => record.kind === 'batches')!;
  const transport = records.find((record) => record.kind === 'transportKeys')!;
  const fingerprint = sha(`POST:${capture.path}:${historicJson(capture.input)}`);
  Object.assign(batch.row, {
    declared_keys: Array(count).fill(null),
    context_hash: sha(
      historicJson({
        orgUnitId: 'org',
        agentId: 'business-agent',
        sequence: 1,
        items: capture.input.items.map((item) => ({
          id: item.queueItemId,
          key: null,
          hash: item.payloadHash,
          payloadJsonHash: sha(historicJson(item.payloadJson)),
          entityType: item.entityType,
          localEntityId: item.localEntityId,
          reservationId: null,
          reservedNumber: item.reservedNumber,
          createdLocallyAt: item.createdLocallyAt,
        })),
      }),
    ),
    transport_fingerprint: fingerprint,
  });
  Object.assign(transport.row, { transport_fingerprint: fingerprint });
  const histories = capture.input.items.flatMap((item) => {
    const derived = `stynx:legacy:v1:${sha(`${tenant}\0device\0batch\0${item.queueItemId}`)}`;
    return [
      {
        kind: 'queueItems',
        row: {
          ...queue.row,
          id: item.queueItemId,
          local_entity_id: item.localEntityId,
          idempotency_key: derived,
          payload_hash: item.payloadHash,
          payload_json: item.payloadJson,
          reserved_number: String(item.reservedNumber),
        },
      },
      {
        kind: 'receipts',
        row: {
          ...receipt.row,
          queue_item_id: item.queueItemId,
          idempotency_key: derived,
          payload_hash: item.payloadHash,
        },
      },
    ] as OfflineImportRecord[];
  });
  capture.manifest.records = [batch, transport, ...histories];
  capture.ack.acceptedItems = count;
  capture.ack.items = capture.input.items.map((item) => ({
    ...item,
    tenantId: tenant,
    agentId: 'business-agent',
    orgUnitId: 'org',
    deviceId: 'device',
    status: 'applied',
    receivedAt: IMPORT_AT,
  }));
  capture.ack.receipt.items = capture.input.items.map((item) => ({
    queueItemId: item.queueItemId,
    status: 'applied',
  }));
  return recaptureArchive(capture);
}

export function duplicateArchivedFixture(
  tenant: string,
  sameQueueId: boolean,
  hostContext: boolean,
  actor?: string,
) {
  const capture = archivedFixture(tenant, actor);
  capture.input.batchSequence = 2;
  capture.ack.receipt.batchSequence = 2;
  const target = sameQueueId ? 'queue' : 'duplicate-queue';
  capture.input.items[0]!.queueItemId = target;
  const records = capture.manifest.records;
  const batch = records.find((record) => record.kind === 'batches')!;
  const transport = records.find((record) => record.kind === 'transportKeys')!;
  const queue = records.find((record) => record.kind === 'queueItems')!;
  const receipt = records.find((record) => record.kind === 'receipts')!;
  Object.assign(queue.row, { device_batch_id: 'canonical-first-batch' });
  Object.assign(receipt.row, {
    device_batch_id: 'canonical-first-batch',
    context_json: hostContext ? { originalHostFact: 'preserved canonical context' } : null,
  });
  const fingerprint = sha(`POST:${capture.path}:${historicJson(capture.input)}`);
  Object.assign(batch.row, {
    batch_sequence: '2',
    context_hash: sha(
      historicJson({
        orgUnitId: 'org',
        agentId: 'business-agent',
        sequence: 2,
        items: capture.input.items.map((item) => ({
          id: item.queueItemId,
          key: item.idempotencyKey,
          hash: item.payloadHash,
          payloadJsonHash: sha(historicJson(item.payloadJson)),
          entityType: item.entityType,
          localEntityId: item.localEntityId,
          reservationId: null,
          reservedNumber: item.reservedNumber,
          createdLocallyAt: item.createdLocallyAt,
        })),
      }),
    ),
    transport_fingerprint: fingerprint,
  });
  Object.assign(transport.row, { transport_fingerprint: fingerprint });
  const historical = {
    ...batch.row,
    batch_sequence: '1',
    device_batch_id: 'canonical-first-batch',
    status: 'legacy_closed_unverified',
    response_status: null,
    response_body_base64: null,
    response_headers: {},
    transport_key: null,
    transport_fingerprint: null,
  };
  const attempt = {
    ...importRecords().find((record) => record.kind === 'attempts')!.row,
    tenant_id: tenant,
    queue_item_id: target,
    idempotency_key: 'item-key',
    payload_hash: capture.input.items[0]!.payloadHash,
    status: 'applied',
    error_code: null,
    context_json: { originalQueueItemId: 'queue' },
  };
  capture.manifest.records.push(
    { kind: 'batches', row: historical } as OfflineImportRecord,
    { kind: 'attempts', row: attempt } as OfflineImportRecord,
  );
  capture.ack.duplicateItems = 1;
  capture.ack.items[0]!.queueItemId = target;
  capture.ack.receipt.items[0]!.queueItemId = target;
  const context = {
    ...(hostContext ? { originalHostFact: 'preserved canonical context' } : {}),
    ...(sameQueueId ? {} : { originalQueueItemId: 'queue' }),
  };
  if (Object.keys(context).length) {
    (capture.ack.items[0]! as Record<string, unknown>).context = context;
    (capture.ack.receipt.items[0]! as Record<string, unknown>).context = context;
  }
  return recaptureArchive(capture);
}
