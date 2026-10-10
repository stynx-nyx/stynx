import { describe, expect, it } from 'vitest';
import { validateArchiveAck, verifyImportArchives } from '../../src/import-archive';
import { readOfflineImportLedger, type OfflineImportLedgerRow } from '../../src/import-receipt';
import {
  archivedFixture,
  duplicateArchivedFixture,
  recaptureArchive,
} from '../support/offline-archive-fixture';
import { fixtureDigest, IMPORT_AT, importManifest } from '../support/offline-import-fixtures';

const tenant = '11111111-1111-4111-8111-111111111111';
const row = (value: object) => value as Record<string, unknown>;
type Capture = ReturnType<typeof archivedFixture>;
function invalid(capture: Capture) {
  const changed = recaptureArchive(capture);
  expect(() => validateArchiveAck(changed.manifest, changed.manifest.archives[0]!)).toThrow(
    expect.objectContaining({ reason: 'archive-invalid' }),
  );
}

describe('independent archived ACK custody boundaries', () => {
  it.each(['context', 'outcome'] as const)(
    'refuses altered archived %s against the ORIGINAL fixed independent capture proof',
    async (change) => {
      const capture = duplicateArchivedFixture(tenant, false, true);
      const originalProof = structuredClone(capture.proof);
      if (change === 'context') {
        const context = { originalQueueItemId: 'queue', originalHostFact: 'forged host context' };
        row(capture.ack.items[0]!).context = context;
        row(capture.ack.receipt.items[0]!).context = context;
      } else {
        capture.ack.items[0]!.status = 'rejected';
        capture.ack.receipt.items[0]!.status = 'rejected';
        Object.assign(capture.manifest.records.find((r) => r.kind === 'attempts')!.row, {
          status: 'rejected',
        });
      }
      const changed = recaptureArchive(capture);
      await expect(
        verifyImportArchives(changed.manifest, { verify: async () => originalProof }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      expect(originalProof.responseBodySha256).not.toBe(changed.proof.responseBodySha256);
    },
  );
  it.each(['context', 'outcome'] as const)(
    'preserves independently verified historical ACK when current canonical %s has changed',
    async (change) => {
      let capture =
        change === 'context'
          ? duplicateArchivedFixture(tenant, false, true)
          : archivedFixture(tenant);
      if (change === 'outcome') {
        capture.ack.items[0]!.status = 'conflict';
        capture.ack.receipt.items[0]!.status = 'conflict';
        capture.ack.conflicts = ['queue'] as never;
        for (const record of capture.manifest.records)
          if (record.kind === 'queueItems' || record.kind === 'receipts')
            Object.assign(record.row, { status: 'conflict' });
        capture = recaptureArchive(capture);
      }
      const originalBytes = Buffer.from(capture.bytes),
        originalDigest = capture.proof.responseBodySha256;
      for (const record of capture.manifest.records) {
        if (change === 'context' && record.kind === 'receipts')
          Object.assign(record.row, {
            context_json: { newerHostFact: 'current mutable canonical projection' },
          });
        if (change === 'outcome' && (record.kind === 'queueItems' || record.kind === 'receipts'))
          Object.assign(record.row, { status: 'pending', error_code: null });
      }
      const changed = recaptureArchive(capture);
      expect(changed.bytes).toEqual(originalBytes);
      expect(changed.proof.responseBodySha256).toBe(originalDigest);
      expect(() =>
        validateArchiveAck(changed.manifest, changed.manifest.archives[0]!),
      ).not.toThrow();
      await expect(
        verifyImportArchives(changed.manifest, {
          verify: async () => ({ ...changed.proof, responseBodySha256: originalDigest }),
        }),
      ).resolves.toEqual([
        expect.objectContaining({ verdict: 'verified', responseBodySha256: originalDigest }),
        ...(change === 'context'
          ? [
              expect.objectContaining({
                verdict: 'unverified',
                responseBodySha256: null,
                evidenceId: null,
              }),
            ]
          : []),
      ]);
    },
  );
  it.each(['missing', 'wrong-key', 'wrong-hash', 'wrong-batch'] as const)(
    'requires matching canonical fallback receipt custody: %s',
    (difference) => {
      const capture = archivedFixture(tenant);
      if (difference === 'missing')
        capture.manifest.records = capture.manifest.records.filter((r) => r.kind !== 'receipts');
      else
        Object.assign(capture.manifest.records.find((r) => r.kind === 'receipts')!.row, {
          [difference === 'wrong-key'
            ? 'idempotency_key'
            : difference === 'wrong-hash'
              ? 'payload_hash'
              : 'device_batch_id']: 'mismatched-source-fact',
        });
      invalid(capture);
    },
  );
  it.each([
    [
      'bad response status',
      (c: Capture) => {
        c.manifest.archives[0]!.responseStatus = 200;
      },
    ],
    [
      'forbidden transport header',
      (c: Capture) => {
        c.headers['content-length' as keyof typeof c.headers] = '123';
      },
    ],
    [
      'case duplicate header',
      (c: Capture) => {
        c.headers['ETag' as keyof typeof c.headers] = 'different';
      },
    ],
    [
      'invalid header name',
      (c: Capture) => {
        c.headers['invalid name' as keyof typeof c.headers] = 'value';
      },
    ],
    [
      'wrong source batch state',
      (c: Capture) => {
        Object.assign(c.manifest.records.find((r) => r.kind === 'batches')!.row, {
          status: 'open',
        });
      },
    ],
    [
      'missing transport custody',
      (c: Capture) => {
        c.manifest.records = c.manifest.records.filter((r) => r.kind !== 'transportKeys');
      },
    ],
    [
      'wrong sequence',
      (c: Capture) => {
        c.ack.receipt.batchSequence = 99;
      },
    ],
    [
      'inner header mismatch',
      (c: Capture) => {
        c.ack.receipt.responseHeaders = { etag: 'different' };
      },
    ],
    [
      'foreign tenant item',
      (c: Capture) => {
        c.ack.items[0]!.tenantId = '22222222-2222-4222-8222-222222222222';
      },
    ],
    [
      'wrong org',
      (c: Capture) => {
        c.ack.items[0]!.orgUnitId = 'wrong';
      },
    ],
    [
      'invalid item instant',
      (c: Capture) => {
        c.ack.items[0]!.receivedAt = 'not-an-instant';
      },
    ],
    [
      'wrong optional key type',
      (c: Capture) => {
        row(c.ack.items[0]!).idempotencyKey = 42;
      },
    ],
    [
      'unsafe optional number',
      (c: Capture) => {
        c.ack.items[0]!.reservedNumber = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'invalid optional context',
      (c: Capture) => {
        row(c.ack.items[0]!).context = [];
      },
    ],
    [
      'missing matching inner item',
      (c: Capture) => {
        c.ack.receipt.items[0]!.queueItemId = 'unknown';
      },
    ],
    [
      'inner outcome mismatch',
      (c: Capture) => {
        c.ack.receipt.items[0]!.status = 'rejected';
      },
    ],
    [
      'wrong declared key',
      (c: Capture) => {
        Object.assign(c.manifest.records.find((r) => r.kind === 'batches')!.row, {
          declared_keys: ['different'],
        });
      },
    ],
    [
      'conflict population mismatch',
      (c: Capture) => {
        c.ack.conflicts = ['unrepresented-conflict'] as never;
      },
    ],
    [
      'duplicate conflict identity',
      (c: Capture) => {
        c.ack.conflicts = ['q', 'q'] as never;
      },
    ],
  ] as const)('refuses %s independently of matching outer proof digests', (_name, mutate) => {
    const capture = archivedFixture(tenant);
    mutate(capture);
    invalid(capture);
  });
  it.each(['not-json', '{"items":', '{"x":1,"x":2}', Buffer.from([0xff, 0xfe])])(
    'refuses invalid archived UTF-8 or JSON %j',
    (bytes) => {
      const capture = archivedFixture(tenant);
      capture.manifest.archives[0]!.responseBodyBase64 = Buffer.from(bytes).toString('base64');
      expect(() => validateArchiveAck(capture.manifest, capture.manifest.archives[0]!)).toThrow(
        expect.objectContaining({ reason: 'archive-invalid' }),
      );
    },
  );
  it.each([
    null,
    {},
    { verdict: 'verified' },
    { throws: true },
    { verdict: 'invalid' },
    { evidenceId: '' },
    { evidenceId: '\0secret' },
    { extra: 'unexpected' },
  ])('refuses malformed independent provider result %j', async (changes) => {
    const capture = archivedFixture(tenant);
    await expect(
      verifyImportArchives(capture.manifest, {
        verify: async () => {
          if (changes && 'throws' in changes) throw new Error('private provider detail');
          if (
            changes === null ||
            Object.keys(changes).length === 0 ||
            (Object.keys(changes).length === 1 && changes.verdict === 'verified')
          )
            return changes;
          return { ...capture.proof, ...changes };
        },
      } as never),
    ).rejects.toMatchObject({ reason: 'archive-invalid' });
  });
});

function ledger(archived = false): OfflineImportLedgerRow {
  const manifest = archived ? archivedFixture(tenant).manifest : importManifest([]);
  const receipt = {
    source: manifest.source,
    manifestSha256: manifest.manifestSha256,
    mappingSha256: fixtureDigest(manifest.mappings),
    importedBy: 'independent_owner',
    importedAt: IMPORT_AT,
    recordCounts: Object.fromEntries(
      [
        'ranges',
        'reservations',
        'queueItems',
        'conflicts',
        'batches',
        'transportKeys',
        'receipts',
        'attempts',
        'consumption',
        'conflictEvidence',
        'conflictActions',
      ].map((kind) => [kind, manifest.records.filter((r) => r.kind === kind).length]),
    ),
    archives: manifest.archives.map((a) => ({
      batch: a.batch,
      verdict: 'verified',
      responseBodySha256: a.responseBodySha256,
      responseHeadersSha256: a.responseHeadersSha256,
      evidenceId: 'verified-source-capture',
    })),
  };
  return {
    source_identity_sha256: fixtureDigest([manifest.source.system, manifest.source.snapshotId]),
    source_system: manifest.source.system,
    source_snapshot_id: manifest.source.snapshotId,
    source_sha256: manifest.source.sha256,
    manifest_sha256: manifest.manifestSha256,
    mapping_sha256: fixtureDigest(manifest.mappings),
    original_manifest: manifest,
    imported_by: receipt.importedBy,
    imported_us: String(BigInt(Date.UTC(2020, 1, 29, 3, 4, 56)) * 1000n + 123456n),
    receipt,
  };
}
describe('immutable offline import ledger independently validates stored custody', () => {
  it.each([false, true])(
    'accepts a complete independently captured ledger archived=%s',
    (archived) => {
      const value = ledger(archived);
      expect(readOfflineImportLedger(value)).toEqual(value.receipt);
    },
  );
  it.each([
    'source_identity_sha256',
    'source_system',
    'source_snapshot_id',
    'source_sha256',
    'manifest_sha256',
    'mapping_sha256',
    'imported_by',
    'imported_us',
  ] as const)('rejects changed durable %s', (field) => {
    const value = ledger();
    value[field] = 'different';
    expect(readOfflineImportLedger(value)).toBe(null);
  });
  it.each([
    'source',
    'manifestSha256',
    'mappingSha256',
    'importedBy',
    'importedAt',
    'recordCounts',
    'archives',
  ] as const)('rejects changed receipt %s', (field) => {
    const value = ledger();
    row(value.receipt as object)[field] = 'different';
    expect(readOfflineImportLedger(value)).toBe(null);
  });
  it.each([
    'shape',
    'batch-shape',
    'wrong-batch',
    'duplicate',
    'verdict',
    'body',
    'headers',
    'blank-evidence',
    'wrong-evidence-type',
    'missing-verified-evidence',
    'missing-archive',
  ] as const)('rejects corrupt archived ledger %s', (difference) => {
    const value = ledger(true),
      receipt = row(value.receipt as object),
      archives = receipt.archives as Record<string, unknown>[];
    const archive = archives[0]!;
    switch (difference) {
      case 'shape':
        archive.extra = true;
        break;
      case 'batch-shape':
        row(archive.batch as object).extra = true;
        break;
      case 'wrong-batch':
        row(archive.batch as object).device_id = 'another';
        break;
      case 'duplicate':
        archives.push(structuredClone(archive));
        break;
      case 'verdict':
        archive.verdict = 'unsupported';
        break;
      case 'body':
        archive.responseBodySha256 = 'wrong';
        break;
      case 'headers':
        archive.responseHeadersSha256 = 'wrong';
        break;
      case 'blank-evidence':
        archive.evidenceId = ' ';
        break;
      case 'wrong-evidence-type':
        archive.evidenceId = 1;
        break;
      case 'missing-verified-evidence':
        archive.evidenceId = null;
        break;
      case 'missing-archive':
        receipt.archives = [];
        break;
    }
    expect(readOfflineImportLedger(value)).toBe(null);
  });
});

it.each(['1e400', '"\\ud800"'])(
  'rejects JSON syntax that cannot preserve a legal archive value: %s',
  (raw) => {
    const capture = archivedFixture(tenant);
    capture.manifest.archives[0]!.responseBodyBase64 = Buffer.from(raw).toString('base64');
    expect(() => validateArchiveAck(capture.manifest, capture.manifest.archives[0]!)).toThrow(
      expect.objectContaining({ reason: 'archive-invalid' }),
    );
  },
);
it('preserves a legacy null batch sequence and matching captured header subset', () => {
  const capture = archivedFixture(tenant);
  Object.assign(capture.manifest.records.find((record) => record.kind === 'batches')!.row, {
    batch_sequence: null,
  });
  Object.assign(capture.ack.receipt, {
    batchSequence: null,
    responseHeaders: { etag: capture.headers.etag },
  });
  const changed = recaptureArchive(capture);
  expect(() => validateArchiveAck(changed.manifest, changed.manifest.archives[0]!)).not.toThrow();
});
it.each([true, false])(
  'binds optional platform attempt facts without inventing host context: matches=%s',
  (matches) => {
    const capture = archivedFixture(tenant);
    const queue = capture.manifest.records.find((record) => record.kind === 'queueItems')!.row;
    capture.manifest.records.push({
      kind: 'attempts',
      row: {
        tenant_id: queue.tenant_id,
        device_id: queue.device_id,
        device_batch_id: queue.device_batch_id,
        queue_item_id: 'queue',
        idempotency_key: 'item-key',
        payload_hash: capture.ack.items[0]!.payloadHash,
        status: 'applied',
        error_code: null,
        context_json: { stynx: { version: 1, attempts: 1 } },
        created_at: IMPORT_AT,
      },
    } as never);
    Object.assign(capture.ack.receipt.items[0]!, {
      stynx: { version: 1, attempts: matches ? 1 : 2 },
    });
    const changed = recaptureArchive(capture);
    if (matches)
      expect(() =>
        validateArchiveAck(changed.manifest, changed.manifest.archives[0]!),
      ).not.toThrow();
    else
      expect(() => validateArchiveAck(changed.manifest, changed.manifest.archives[0]!)).toThrow(
        expect.objectContaining({ reason: 'archive-invalid' }),
      );
  },
);

it.each(['ambiguous-attempt', 'self-marker'] as const)(
  'refuses unsupported direct archive source facts: %s',
  (difference) => {
    const capture = archivedFixture(tenant);
    const queue = capture.manifest.records.find((record) => record.kind === 'queueItems')!.row;
    const attempt = {
      kind: 'attempts',
      row: {
        tenant_id: queue.tenant_id,
        device_id: queue.device_id,
        device_batch_id: queue.device_batch_id,
        queue_item_id: 'queue',
        idempotency_key: 'item-key',
        payload_hash: capture.ack.items[0]!.payloadHash,
        status: 'applied',
        error_code: null,
        context_json: difference === 'self-marker' ? { originalQueueItemId: 'queue' } : null,
        created_at: IMPORT_AT,
      },
    };
    capture.manifest.records.push(attempt as never);
    if (difference === 'ambiguous-attempt')
      capture.manifest.records.push(structuredClone(attempt) as never);
    // The same queue and same batch do not constitute the historical cross-identity duplicate exception.
    invalid(capture);
  },
);
