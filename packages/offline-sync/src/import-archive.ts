import { validateHeaderValue } from 'node:http';
import { OfflineImportError } from './import-contract';
import type { OfflineArchiveVerificationPort, OfflineImportReceipt } from './import-contract';
import type {
  OfflineImportManifest,
  OfflineImportArchive,
  OfflineImportBatchesKey,
} from './import-schema.generated';
import {
  canonicalImportJson,
  importDigest,
  parseImportJson,
  freezeImportJson,
  importInstantMicroseconds,
} from './import-validation';
import { importBatchIdentity } from './import-validation';
import { splitStynxContext } from './stynx-context';

function refuse(): never {
  throw new OfflineImportError('archive-invalid', 'archived-response');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validHeaders(headers: Readonly<Record<string, string>>): void {
  const names = new Set<string>();
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) ||
      /[\r\n\0]/u.test(value) ||
      names.has(lower) ||
      /^(content-length|transfer-encoding|connection|date|x-request-id|x-correlation-id|x-powered-by|x-idempotency-replayed|(?:x-)?ratelimit(?:-|$)|x-rate-limit(?:-|$))/iu.test(
        name,
      )
    )
      refuse();
    try {
      validateHeaderValue(name, value);
    } catch {
      refuse();
    }
    names.add(lower);
  }
}
/** Validate supported ACK identity without rewriting or canonicalizing its wire representation. */
function inspectArchiveAck(manifest: OfflineImportManifest, archive: OfflineImportArchive): void {
  validHeaders(archive.responseHeaders);
  if (archive.responseStatus !== 201) refuse();
  let ack: unknown;
  try {
    ack = parseImportJson(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(archive.responseBodyBase64, 'base64'),
      ),
    );
  } catch {
    return refuse();
  }
  try {
    canonicalImportJson(ack);
  } catch {
    refuse();
  }
  const sourceBatch = manifest.records.find(
    (record) =>
      record.kind === 'batches' &&
      importBatchIdentity({
        tenant_id: record.row.tenant_id,
        device_id: record.row.device_id,
        device_batch_id: record.row.device_batch_id,
      }) === importBatchIdentity(archive.batch),
  );
  if (
    sourceBatch?.kind !== 'batches' ||
    sourceBatch.row.status === 'open' ||
    !/^[0-9a-f]{64}$/u.test(sourceBatch.row.context_hash) ||
    sourceBatch.row.transport_key === null ||
    !/^[0-9a-f]{64}$/u.test(sourceBatch.row.transport_key) ||
    sourceBatch.row.transport_fingerprint === null ||
    !/^[0-9a-f]{64}$/u.test(sourceBatch.row.transport_fingerprint)
  )
    refuse();
  if (
    !manifest.records.some(
      (record) =>
        record.kind === 'transportKeys' &&
        record.row.tenant_id === archive.batch.tenant_id &&
        record.row.device_id === archive.batch.device_id &&
        record.row.device_batch_id === archive.batch.device_batch_id &&
        record.row.transport_key === sourceBatch.row.transport_key &&
        record.row.transport_fingerprint === sourceBatch.row.transport_fingerprint,
    )
  )
    refuse();
  if (
    !object(ack) ||
    ack.batchId !== archive.batch.device_batch_id ||
    !Number.isSafeInteger(ack.acceptedItems) ||
    Number(ack.acceptedItems) < 0 ||
    !Number.isSafeInteger(ack.duplicateItems) ||
    Number(ack.duplicateItems) < 0 ||
    Number(ack.duplicateItems) > Number(ack.acceptedItems) ||
    !Array.isArray(ack.items) ||
    ack.items.length !== ack.acceptedItems ||
    !Array.isArray(ack.conflicts) ||
    !ack.conflicts.every((item) => typeof item === 'string') ||
    !object(ack.receipt) ||
    ack.receipt.deviceId !== archive.batch.device_id ||
    ack.receipt.deviceBatchId !== archive.batch.device_batch_id ||
    ack.receipt.status !== 'closed' ||
    ack.receipt.responseStatus !== archive.responseStatus ||
    ack.receipt.responseBodyBytes !== null ||
    !object(ack.receipt.responseHeaders) ||
    !Object.values(ack.receipt.responseHeaders).every((value) => typeof value === 'string') ||
    !Array.isArray(ack.receipt.items) ||
    ack.receipt.items.length !== ack.items.length
  )
    refuse();
  if (
    ack.receipt.batchSequence !==
    (sourceBatch.row.batch_sequence === null ? null : Number(sourceBatch.row.batch_sequence))
  )
    refuse();
  validHeaders(ack.receipt.responseHeaders as Record<string, string>);
  const replayHeaders = new Map(
    Object.entries(archive.responseHeaders).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const [name, value] of Object.entries(ack.receipt.responseHeaders))
    if (replayHeaders.get(name.toLowerCase()) !== value) refuse();
  const usedKeys = new Set<string>();
  const identities = new Set<string>(),
    conflicts = new Set<string>();
  for (const [itemIndex, item] of ack.items.entries()) {
    if (
      !object(item) ||
      typeof item.queueItemId !== 'string' ||
      identities.has(item.queueItemId) ||
      item.tenantId !== archive.batch.tenant_id ||
      !['received', 'applied', 'conflict', 'rejected', 'pending'].includes(item.status as string)
    )
      refuse();
    for (const name of [
      'entityType',
      'localEntityId',
      'createdLocallyAt',
      'agentId',
      'orgUnitId',
      'deviceId',
      'receivedAt',
    ])
      if (typeof item[name] !== 'string') refuse();
    if (
      item.deviceId !== archive.batch.device_id ||
      item.orgUnitId !== sourceBatch.row.org_unit_id ||
      item.agentId !== sourceBatch.row.agent_id ||
      !object(item.payloadJson)
    )
      refuse();
    importInstantMicroseconds(item.createdLocallyAt as string);
    importInstantMicroseconds(item.receivedAt as string);
    for (const name of ['reservationId', 'idempotencyKey', 'errorCode'])
      if (item[name] !== undefined && typeof item[name] !== 'string') refuse();
    if (item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber)) refuse();
    for (const name of ['context', 'stynx'])
      if (item[name] !== undefined && !object(item[name])) refuse();
    const entry = ack.receipt.items.find(
      (value) => object(value) && value.queueItemId === item.queueItemId,
    );
    if (
      !object(entry) ||
      entry.status !== item.status ||
      (entry.errorCode ?? null) !== (item.errorCode ?? null) ||
      canonicalImportJson(entry.context ?? null) !== canonicalImportJson(item.context ?? null)
    )
      refuse();
    const attempts = manifest.records.flatMap((record) =>
      record.kind === 'attempts' &&
      record.row.tenant_id === archive.batch.tenant_id &&
      record.row.device_id === archive.batch.device_id &&
      record.row.device_batch_id === archive.batch.device_batch_id &&
      record.row.queue_item_id === item.queueItemId
        ? [record.row]
        : [],
    );
    const queues = manifest.records.flatMap((record) =>
      record.kind === 'queueItems' &&
      record.row.tenant_id === archive.batch.tenant_id &&
      record.row.device_id === archive.batch.device_id &&
      record.row.device_batch_id === archive.batch.device_batch_id &&
      record.row.id === item.queueItemId
        ? [record.row]
        : [],
    );
    if (attempts.length) {
      if (attempts.length !== 1) refuse();
      const outcome = attempts[0]!,
        context = splitStynxContext(outcome.context_json);
      const original = context.context?.originalQueueItemId;
      const canonicalReceipt = manifest.records.find(
        (record) =>
          record.kind === 'receipts' &&
          record.row.tenant_id === archive.batch.tenant_id &&
          record.row.idempotency_key === outcome.idempotency_key &&
          record.row.payload_hash === outcome.payload_hash &&
          record.row.queue_item_id === original &&
          (record.row.device_id !== archive.batch.device_id ||
            record.row.device_batch_id !== archive.batch.device_batch_id ||
            original !== item.queueItemId),
      );
      const partialDuplicate =
        typeof original === 'string' &&
        Object.keys(outcome.context_json!).length === 1 &&
        canonicalReceipt?.kind === 'receipts';
      const emittedContext = entry.context ?? {};
      const contextMatches = partialDuplicate
        ? object(emittedContext) &&
          (original === item.queueItemId
            ? !Object.hasOwn(emittedContext, 'originalQueueItemId')
            : emittedContext.originalQueueItemId === original)
        : canonicalImportJson(entry.context ?? null) ===
          canonicalImportJson(context.context ?? null);
      if (
        outcome.status !== item.status ||
        (entry.errorCode ?? null) !== (outcome.error_code || null) ||
        !contextMatches ||
        (entry.stynx !== undefined &&
          canonicalImportJson(entry.stynx) !== canonicalImportJson(context.stynx ?? null))
      )
        refuse();
    } else {
      // An original submission may predate durable attempts. Its mutable outcome
      // is not an archive-time oracle, but both stable source identities must
      // still bind the historical ACK before independent capture verification.
      if (queues.length !== 1) refuse();
      const queue = queues[0]!;
      const receipts = manifest.records.filter(
        (record) =>
          record.kind === 'receipts' &&
          record.row.tenant_id === queue.tenant_id &&
          record.row.device_id === queue.device_id &&
          record.row.device_batch_id === queue.device_batch_id &&
          record.row.queue_item_id === queue.id &&
          record.row.idempotency_key === queue.idempotency_key &&
          record.row.payload_hash === queue.payload_hash,
      );
      if (receipts.length !== 1) refuse();
    }
    const facts = attempts.length ? attempts : queues;
    const keys = new Set(facts.map((row) => row.idempotency_key));
    const key = [...keys][0];
    if (
      keys.size !== 1 ||
      !key ||
      usedKeys.has(key) ||
      (sourceBatch.row.declared_keys[itemIndex] === null
        ? item.idempotencyKey !== undefined || !/^stynx:legacy:v1:[0-9a-f]{64}$/u.test(key)
        : item.idempotencyKey !== key || sourceBatch.row.declared_keys[itemIndex] !== key) ||
      !facts.some((row) => row.payload_hash === item.payloadHash)
    )
      refuse();
    usedKeys.add(key);
    if (item.status === 'conflict') conflicts.add(item.queueItemId);
    identities.add(item.queueItemId);
  }
  if (
    sourceBatch.row.declared_keys.length !== identities.size ||
    new Set(ack.conflicts).size !== ack.conflicts.length ||
    canonicalImportJson([...conflicts].sort()) !== canonicalImportJson([...ack.conflicts].sort())
  )
    refuse();
}

/** All unsupported ACK shapes have the same typed, non-sensitive refusal. */
export function validateArchiveAck(
  manifest: OfflineImportManifest,
  archive: OfflineImportArchive,
): void {
  try {
    inspectArchiveAck(manifest, archive);
  } catch {
    refuse();
  }
}

export async function verifyImportArchives(
  manifest: OfflineImportManifest,
  port?: OfflineArchiveVerificationPort,
): Promise<OfflineImportReceipt['archives']> {
  const results: OfflineImportReceipt['archives'][number][] = [];
  const mappingSha256 = importDigest(manifest.mappings);
  for (const record of manifest.records) {
    if (record.kind !== 'batches') continue;
    const batch: OfflineImportBatchesKey = {
      tenant_id: record.row.tenant_id,
      device_id: record.row.device_id,
      device_batch_id: record.row.device_batch_id,
    };
    const archive = manifest.archives.find(
      (value) => importBatchIdentity(value.batch) === importBatchIdentity(batch),
    );
    let verdict: 'verified' | 'unverified' = 'unverified',
      evidenceId: string | null = null;
    if (archive) {
      validateArchiveAck(manifest, archive);
      if (port) {
        const context = freezeImportJson({
          source: manifest.source,
          manifestSha256: manifest.manifestSha256,
          mappingSha256,
          batch,
          transportKeys: manifest.records.flatMap((value) =>
            value.kind === 'transportKeys' &&
            value.row.tenant_id === batch.tenant_id &&
            value.row.device_id === batch.device_id &&
            value.row.device_batch_id === batch.device_batch_id
              ? [value.row]
              : [],
          ),
        });
        let returned: unknown;
        try {
          returned = JSON.parse(canonicalImportJson(await port.verify(archive, context)));
        } catch {
          return refuse();
        }
        const expected = {
          sourceSha256: manifest.source.sha256,
          manifestSha256: manifest.manifestSha256,
          mappingSha256,
          batch,
          responseBodySha256: archive.responseBodySha256,
          responseHeadersSha256: archive.responseHeadersSha256,
        };
        if (
          !object(returned) ||
          Object.keys(returned).sort().join(',') !==
            [...Object.keys(expected), 'verdict', 'evidenceId'].sort().join(',') ||
          !['verified', 'unverified'].includes(returned.verdict as string) ||
          typeof returned.evidenceId !== 'string' ||
          !returned.evidenceId.trim() ||
          returned.evidenceId.includes('\0')
        )
          refuse();
        for (const [key, value] of Object.entries(expected))
          if (canonicalImportJson(returned[key]) !== canonicalImportJson(value)) refuse();
        verdict = returned.verdict as 'verified' | 'unverified';
        evidenceId = returned.evidenceId;
      }
    }
    results.push({
      batch,
      verdict,
      responseBodySha256: archive?.responseBodySha256 ?? null,
      responseHeadersSha256: archive?.responseHeadersSha256 ?? null,
      evidenceId,
    });
  }
  return results;
}
