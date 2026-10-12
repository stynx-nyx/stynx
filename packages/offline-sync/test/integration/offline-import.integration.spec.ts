import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import {
  archivedFixture,
  recaptureArchive,
  legacyArchivedFixture,
  duplicateArchivedFixture,
} from '../support/offline-archive-fixture';
import { importedRuntime } from '../support/offline-import-runtime';
import { importOfflineState } from '../../src/import-state';
import { OfflineImportError } from '../../src/import-contract';
import { OfflineSyncConfigurationError } from '../../src/errors';
import type { OfflineImportRecord } from '../../src/import-schema.generated';
import {
  importRecords,
  importManifest,
  fixtureBytesDigest,
  fixtureDigest,
  IMPORT_AT,
  rehashManifest,
} from '../support/offline-import-fixtures';
import {
  fixture,
  dispose,
  baseline,
  type OfflineStorageFixture,
} from '../support/offline-storage-fixture';

// A real auth.users principal for the signed HTTP replay compositions.
const httpActor = '0198d132-0000-7000-8000-000000000010';

const relations = [
  'numbering_ranges',
  'numbering_reservations',
  'sync_queue_items',
  'sync_conflicts',
  'sync_batches',
  'sync_batch_transport_keys',
  'sync_item_receipts',
  'sync_item_attempts',
  'numbering_consumption',
  'sync_conflict_evidence',
  'sync_conflict_actions',
  'numbering_reservation_scopes',
  'sync_import_receipts',
] as const;
function history(value: OfflineStorageFixture): OfflineImportRecord[] {
  return importRecords().map((record) => ({
    ...record,
    row: { ...record.row, tenant_id: value.tenants[0] },
  })) as OfflineImportRecord[];
}
async function writeBoundary(value: OfflineStorageFixture, isolation = 'read committed') {
  await value.admin.query(`begin isolation level ${isolation}`);
  await value.admin.query(
    `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
  );
}
async function snapshot(value: OfflineStorageFixture) {
  const rows: Record<string, unknown> = {};
  for (const relation of relations)
    rows[relation] = (
      await value.admin.query(
        `select to_jsonb(t)::text as row from offline.${relation} t order by to_jsonb(t)::text`,
      )
    ).rows;
  return rows;
}

// D6 owner-maintenance port: real SQL, all history kinds, caller-owned transaction and no domain ports.
describe('D6 independent offline import PostgreSQL protocol', () => {
  it('imports all eleven history kinds without inventing provenance, rounding instants or rewriting old hashes', async () => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      await writeBoundary(value);
      const receipt = await importOfflineState(value.admin, manifest, { storage: value.options });
      expect(receipt.source).toEqual(manifest.source);
      expect(receipt.importedBy).toBe(value.options.ownerRole);
      expect(Object.values(receipt.recordCounts)).toEqual(Array(11).fill(1));
      expect(receipt.archives).toEqual([
        expect.objectContaining({ verdict: 'unverified', evidenceId: null }),
      ]);
      expect((await value.admin.query('select 1 as transaction_live')).rows).toEqual([
        { transaction_live: 1 },
      ]);
      await value.admin.query('commit');
      const captured = await snapshot(value);
      for (const relation of relations.slice(0, 11)) expect(captured[relation]).toHaveLength(1);
      expect(captured.sync_import_receipts).toHaveLength(1);
      expect(captured.numbering_reservation_scopes).toHaveLength(1);
      const stored = (
        await value.admin.query(
          'select to_char(created_at at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as created_at,created_by,creation_key,creation_receipt from offline.numbering_ranges',
        )
      ).rows[0];
      expect(stored).toEqual({
        created_at: '2020-02-29T03:04:56.123456Z',
        created_by: null,
        creation_key: null,
        creation_receipt: null,
      });
      expect(
        (await value.admin.query('select payload_hash from offline.sync_item_attempts')).rows,
      ).toEqual([{ payload_hash: 'MALFORMED original received hash' }]);
      await baseline(value);
      expect(await snapshot(value)).toEqual(captured);
      await writeBoundary(value);
      expect(await importOfflineState(value.admin, manifest, { storage: value.options })).toEqual(
        receipt,
      );
      await value.admin.query('commit');
      expect(await snapshot(value)).toEqual(captured);
    } finally {
      await dispose(value);
    }
  });

  it('leaves no import prefix after caller rollback, then permits the identical manifest to commit once', async () => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      const empty = await snapshot(value);
      await writeBoundary(value);
      await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('rollback');
      expect(await snapshot(value)).toEqual(empty);
      await writeBoundary(value);
      await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('commit');
      await baseline(value);
      expect((await snapshot(value)).sync_import_receipts).toHaveLength(1);
    } finally {
      await dispose(value);
    }
  });

  it('refuses changed content under committed source identity and poisons the SQL-phase transaction against prefix COMMIT', async () => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      await writeBoundary(value);
      await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('commit');
      const original = await snapshot(value);
      const changed = rehashManifest({
        ...manifest,
        source: {
          ...manifest.source,
          sha256: fixtureBytesDigest(Buffer.from('different immutable source capture')),
        },
      });
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, changed, { storage: value.options }),
      ).rejects.toMatchObject({ name: 'OfflineImportError', reason: 'source-conflict' });
      await expect(value.admin.query('select 1')).rejects.toMatchObject({ code: '25P02' });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(original);
    } finally {
      await dispose(value);
    }
  });

  it('rejects wrong isolation and missing mapped tenants while preserving the empty target', async () => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      const empty = await snapshot(value);
      await writeBoundary(value, 'repeatable read');
      await expect(
        importOfflineState(value.admin, manifest, { storage: value.options }),
      ).rejects.toBeInstanceOf(OfflineImportError);
      await value.admin.query('rollback');
      expect(await snapshot(value)).toEqual(empty);
      const unknownTenant = randomUUID();
      const foreign = importManifest(
        history(value).map((record) => ({
          ...record,
          row: { ...record.row, tenant_id: unknownTenant },
        })) as OfflineImportRecord[],
      );
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, foreign, { storage: value.options }),
      ).rejects.toMatchObject({ reason: 'record-conflict' });
      await value.admin.query('rollback');
      expect(await snapshot(value)).toEqual(empty);
    } finally {
      await dispose(value);
    }
  });
});

it('refuses an existing row collision before inserting other history and leaves the transaction aborted', async () => {
  const value = await fixture();
  try {
    const records = history(value);
    const range = records.find((record) => record.kind === 'ranges')!.row;
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    await value.admin.query(
      "insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values($1,$2,'org','record','different-original-series',1,100,1,'active')",
      [range.id, range.tenant_id],
    );
    await value.admin.query('reset role');
    const before = await snapshot(value);
    await writeBoundary(value);
    await expect(
      importOfflineState(value.admin, importManifest(records), { storage: value.options }),
    ).rejects.toMatchObject({ reason: 'record-conflict' });
    await expect(value.admin.query('select 1')).rejects.toMatchObject({ code: '25P02' });
    expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
    expect(await snapshot(value)).toEqual(before);
  } finally {
    await dispose(value);
  }
});

it.each(['source', 'target'] as const)(
  'refuses a live %s batch lease without transferring authority or history',
  async (origin) => {
    const value = await fixture();
    try {
      const batch = {
        ...history(value).find((record) => record.kind === 'batches')!.row,
        status: 'open' as const,
        lease_token: randomUUID(),
        lease_expires_at: new Date(Date.now() + 3600000).toISOString(),
        transport_key: null,
        transport_fingerprint: null,
        declared_keys: [],
      };
      if (origin === 'target') {
        await value.admin.query(
          `set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
        );
        await value.admin.query(
          "insert into offline.sync_batches(tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status,lease_token,lease_generation,lease_expires_at) values($1,$2,$3,$4,$5,$6,'[]','open',$7,1,$8)",
          [
            batch.tenant_id,
            batch.device_id,
            batch.device_batch_id,
            batch.org_unit_id,
            batch.agent_id,
            batch.context_hash,
            batch.lease_token,
            batch.lease_expires_at,
          ],
        );
        await value.admin.query('reset role');
      }
      const before = await snapshot(value);
      await writeBoundary(value);
      await expect(
        importOfflineState(
          value.admin,
          importManifest(origin === 'source' ? [{ kind: 'batches', row: batch }] : []),
          { storage: value.options },
        ),
      ).rejects.toMatchObject({ reason: 'maintenance-required', object: `live-${origin}-lease` });
      await expect(value.admin.query('select 1')).rejects.toMatchObject({ code: '25P02' });
      await value.admin.query('rollback');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it.each(['missing', 'unverified', 'verified'] as const)(
  'admits archived replay only with independently bound proof: %s',
  async (mode) => {
    const value = await fixture();
    try {
      const capture = archivedFixture(value.tenants[0]);
      const verifier = vi.fn(async (archive, context) => {
        expect(archive).toEqual(capture.manifest.archives[0]);
        expect(Object.isFrozen(archive)).toBe(true);
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.transportKeys)).toBe(true);
        expect(context).toEqual({
          source: capture.manifest.source,
          manifestSha256: capture.proof.manifestSha256,
          mappingSha256: capture.proof.mappingSha256,
          batch: capture.proof.batch,
          transportKeys: capture.manifest.records
            .filter((record) => record.kind === 'transportKeys')
            .map((record) => record.row),
        });
        return {
          ...capture.proof,
          verdict: mode === 'verified' ? ('verified' as const) : ('unverified' as const),
        };
      });
      await writeBoundary(value);
      const receipt = await importOfflineState(value.admin, capture.manifest, {
        storage: value.options,
        ...(mode === 'missing' ? {} : { verifyArchive: { verify: verifier } }),
      });
      await value.admin.query('commit');
      expect(verifier).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);
      expect(receipt.archives[0]).toMatchObject({
        verdict: mode === 'verified' ? 'verified' : 'unverified',
        evidenceId: mode === 'missing' ? null : capture.proof.evidenceId,
      });
      const batch = (
        await value.admin.query(
          'select status,response_body_is_archived,response_body_bytes,response_headers from offline.sync_batches',
        )
      ).rows[0];
      expect(batch).toEqual({
        status: mode === 'verified' ? 'closed' : 'legacy_closed_unverified',
        response_body_is_archived: mode === 'verified',
        response_body_bytes: capture.bytes,
        response_headers: capture.headers,
      });
      const before = await snapshot(value);
      await baseline(value);
      await writeBoundary(value);
      expect(
        await importOfflineState(value.admin, capture.manifest, {
          storage: value.options,
          verifyArchive: {
            verify: async () => {
              throw new Error('Replay must not request fresh or replacement proof');
            },
          },
        }),
      ).toEqual(receipt);
      await value.admin.query('commit');
      expect(await snapshot(value)).toEqual(before);
      if (mode === 'verified') {
        await writeBoundary(value);
        for (const sql of [
          'update offline.sync_batches set response_body_is_archived=false',
          "update offline.sync_batches set response_body_bytes=convert_to('{}','UTF8')",
          "update offline.sync_batches set response_headers='{}'",
          "update offline.sync_batches set device_batch_id='changed'",
          'delete from offline.sync_batches',
        ]) {
          await value.admin.query('savepoint immutability');
          await expect(value.admin.query(sql)).rejects.toMatchObject({ code: 'STY51' });
          await value.admin.query('rollback to savepoint immutability');
        }
        await value.admin.query('rollback');
        expect(await snapshot(value)).toEqual(before);
      } else {
        const app = new Client({
          connectionString: value.postgres.appConnectionString(
            'archive-forgery',
            value.options.appRole,
          ),
        });
        await app.connect();
        try {
          await app.query(
            "select set_config('app.tenant_id',$1,false),set_config('app.actor_id','forger',false)",
            [value.tenants[0]],
          );
          await expect(
            app.query(
              "update offline.sync_batches set status='closed',response_body_is_archived=true",
            ),
          ).rejects.toMatchObject({ code: 'STY52' });
        } finally {
          await app.end();
        }
        expect(await snapshot(value)).toEqual(before);
      }
    } finally {
      await dispose(value);
    }
  },
);

it.each([
  'sourceSha256',
  'manifestSha256',
  'mappingSha256',
  'responseBodySha256',
  'responseHeadersSha256',
  'batch',
  'evidenceId',
] as const)(
  'rejects independent archive proof with wrong %s without committing any prefix',
  async (field) => {
    const value = await fixture();
    try {
      const capture = archivedFixture(value.tenants[0]);
      const before = await snapshot(value);
      const proof = {
        ...capture.proof,
        [field]:
          field === 'batch'
            ? { ...capture.proof.batch, tenant_id: value.tenants[1] }
            : field === 'evidenceId'
              ? ''
              : fixtureBytesDigest(Buffer.from('different evidence')),
      };
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, capture.manifest, {
          storage: value.options,
          verifyArchive: { verify: async () => proof as typeof capture.proof },
        }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      await expect(value.admin.query('select 1')).rejects.toMatchObject({ code: '25P02' });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it('replays verified imported response bytes through the real Nest HTTP adapter without domain or hash effects', async () => {
  const value = await fixture();
  let runtime: Awaited<ReturnType<typeof importedRuntime>> | undefined;
  try {
    const capture = archivedFixture(value.tenants[0], httpActor);
    await writeBoundary(value);
    await importOfflineState(value.admin, capture.manifest, {
      storage: value.options,
      verifyArchive: { verify: async () => capture.proof },
    });
    await value.admin.query('commit');
    const before = await snapshot(value);
    runtime = await importedRuntime(value, capture.actor);
    await request(runtime.app.getHttpServer()).post(capture.path).send(capture.input).expect(401);
    await request(runtime.app.getHttpServer())
      .post(capture.path)
      .set('Authorization', 'Bearer ' + runtime.unprivilegedToken)
      .set('Idempotency-Key', capture.header)
      .send(capture.input)
      .expect(403);
    expect(runtime.apply).not.toHaveBeenCalled();
    expect(runtime.hash).not.toHaveBeenCalled();
    expect(runtime.append).not.toHaveBeenCalled();
    expect(await snapshot(value)).toEqual(before);
    const response = await request(runtime.app.getHttpServer())
      .post(capture.path)
      .set('Authorization', 'Bearer ' + runtime.accessToken)
      .set('Idempotency-Key', capture.header)
      .send(capture.input)
      .buffer(true)
      .parse((incoming, done) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        incoming.on('end', () => done(null, Buffer.concat(chunks)));
        incoming.on('error', done);
      });
    expect(
      response.status,
      Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.text,
    ).toBe(201);
    expect(response.body).toEqual(capture.bytes);
    expect(response.headers.etag).toBe(capture.headers.etag);
    expect(response.headers['content-type']).toBe(capture.headers['content-type']);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.headers['x-idempotency-key']).toBe(capture.header);
    expect(runtime.apply).not.toHaveBeenCalled();
    expect(runtime.hash).not.toHaveBeenCalled();
    expect(runtime.append).not.toHaveBeenCalled();
    expect(await snapshot(value)).toEqual(before);
    await expect(
      runtime.run(() =>
        runtime!.service.submitSyncBatch(capture.input, {
          transportIdempotencyKey: capture.header,
          method: 'POST',
          path: capture.path,
          transportUserId: capture.actor,
        }),
      ),
    ).rejects.toBeInstanceOf(OfflineSyncConfigurationError);
    expect(await snapshot(value)).toEqual(before);
  } finally {
    await runtime?.app.close();
    await dispose(value);
  }
});

it('replays an imported keyed range initial receipt with its exact fractional microseconds and original zone', async () => {
  const value = await fixture();
  let runtime: Awaited<ReturnType<typeof importedRuntime>> | undefined;
  try {
    const row = { ...history(value).find((record) => record.kind === 'ranges')!.row };
    const original = {
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      entityType: row.entity_type,
      series: row.series,
      startNumber: 1,
      endNumber: 100,
    };
    const initial = {
      id: row.id,
      ...original,
      nextNumber: 1,
      status: 'active',
      createdAt: IMPORT_AT,
      createdBy: 'original-imported-actor',
    };
    Object.assign(row, {
      creation_key: 'original-range-key',
      creation_fingerprint: fixtureDigest(original),
      creation_receipt: initial,
      created_by: initial.createdBy,
    });
    await writeBoundary(value);
    await importOfflineState(value.admin, importManifest([{ kind: 'ranges', row }]), {
      storage: value.options,
    });
    await value.admin.query('commit');
    const before = await snapshot(value);
    runtime = await importedRuntime(value, 'different-current-actor');
    const result = await runtime.run(() =>
      runtime!.service.createNumberingRange({
        orgUnitId: 'org',
        entityType: 'record',
        series: 'A',
        startNumber: 1,
        endNumber: 100,
        idempotencyKey: 'original-range-key',
      }),
    );
    expect(result).toEqual(initial);
    expect(result.createdAt).toBe('2020-02-29T06:34:56.123456+03:30');
    expect(await snapshot(value)).toEqual(before);
    await baseline(value);
  } finally {
    await runtime?.app.close();
    await dispose(value);
  }
});

it.each(['status', 'errorCode', 'context'] as const)(
  'rejects an archive whose %s lies about its stable per-batch attempt',
  async (difference) => {
    const value = await fixture();
    try {
      const capture = archivedFixture(value.tenants[0]);
      const attempt = {
        ...history(value).find((record) => record.kind === 'attempts')!.row,
        queue_item_id: 'queue',
        idempotency_key: 'item-key',
        payload_hash: capture.input.items[0]!.payloadHash,
        status: 'rejected' as const,
        error_code: 'ORIGINAL_REJECTION',
        context_json: { explanation: 'original rejection context' },
      };
      capture.manifest.records.push({ kind: 'attempts', row: attempt });
      const item = capture.ack.items[0]! as Record<string, unknown>;
      const receipt = capture.ack.receipt.items[0]! as Record<string, unknown>;
      if (difference !== 'status') {
        Object.assign(item, {
          status: 'rejected',
          errorCode: 'ORIGINAL_REJECTION',
          context: attempt.context_json,
        });
        Object.assign(receipt, {
          status: 'rejected',
          errorCode: 'ORIGINAL_REJECTION',
          context: attempt.context_json,
        });
        if (difference === 'errorCode') item.errorCode = receipt.errorCode = 'WRONG_REJECTION';
        else item.context = receipt.context = { explanation: 'invented rejection context' };
      }
      const changed = recaptureArchive(capture);
      const before = await snapshot(value);
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, changed.manifest, {
          storage: value.options,
          verifyArchive: { verify: async () => changed.proof },
        }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it.each(['required-item-fields', 'receipt-body', 'receipt-headers'] as const)(
  'refuses an abbreviated archived ACK missing %s even with self-consistent digests and proof',
  async (missing) => {
    const value = await fixture();
    try {
      const capture = archivedFixture(value.tenants[0]);
      if (missing === 'required-item-fields')
        delete (capture.ack.items[0]! as Record<string, unknown>).entityType;
      else
        delete (capture.ack.receipt as Record<string, unknown>)[
          missing === 'receipt-body' ? 'responseBodyBytes' : 'responseHeaders'
        ];
      const changed = recaptureArchive(capture);
      const before = await snapshot(value);
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, changed.manifest, {
          storage: value.options,
          verifyArchive: { verify: async () => changed.proof },
        }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      await value.admin.query('rollback');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it.each([
  ['control', '\u0001', false],
  ['outside-latin1', '\u0100', false],
  ['HTAB', '\tlegal-tab', true],
  ['obs-text', 'caf\u00e9', true],
] as const)(
  'enforces actual HTTP header admissibility for archived %s',
  async (_name, header, admitted) => {
    const value = await fixture();
    try {
      const capture = archivedFixture(value.tenants[0]);
      (capture.headers as Record<string, string>)['x-source-evidence'] = header;
      const changed = recaptureArchive(capture);
      const before = await snapshot(value);
      await writeBoundary(value);
      const result = importOfflineState(value.admin, changed.manifest, {
        storage: value.options,
        verifyArchive: { verify: async () => changed.proof },
      });
      if (admitted) {
        expect((await result).archives[0]!.verdict).toBe('verified');
        await value.admin.query('commit');
        expect(
          (await value.admin.query('select response_headers from offline.sync_batches')).rows[0]
            .response_headers['x-source-evidence'],
        ).toBe(header);
        await baseline(value);
      } else {
        await expect(result).rejects.toMatchObject({ reason: 'archive-invalid' });
        expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
        expect(await snapshot(value)).toEqual(before);
      }
    } finally {
      await dispose(value);
    }
  },
);

it.each([1, 2] as const)(
  'imports historical legacy CTG9 %s null declaration slots and replays their exact wire bytes without rewriting derived identities',
  async (count) => {
    const value = await fixture();
    let runtime: Awaited<ReturnType<typeof importedRuntime>> | undefined;
    try {
      const capture = legacyArchivedFixture(value.tenants[0], count, httpActor);
      await writeBoundary(value);
      await importOfflineState(value.admin, capture.manifest, {
        storage: value.options,
        verifyArchive: { verify: async () => capture.proof },
      });
      await value.admin.query('commit');
      expect(
        (await value.admin.query('select declared_keys from offline.sync_batches')).rows,
      ).toEqual([{ declared_keys: Array(count).fill(null) }]);
      const identities = (
        await value.admin.query(
          'select id,idempotency_key from offline.sync_queue_items order by id',
        )
      ).rows;
      expect(identities).toHaveLength(count);
      for (const row of identities)
        expect(row.idempotency_key).toMatch(/^stynx:legacy:v1:[0-9a-f]{64}$/);
      const before = await snapshot(value);
      runtime = await importedRuntime(value, capture.actor);
      const response = await request(runtime.app.getHttpServer())
        .post(capture.path)
        .set('Authorization', 'Bearer ' + runtime.accessToken)
        .set('Idempotency-Key', capture.header)
        .send(capture.input);
      expect(response.status, response.text).toBe(201);
      expect(Buffer.from(response.text)).toEqual(capture.bytes);
      for (const item of response.body.items) expect(item).not.toHaveProperty('idempotencyKey');
      expect(runtime.apply).not.toHaveBeenCalled();
      expect(runtime.hash).not.toHaveBeenCalled();
      expect(runtime.append).not.toHaveBeenCalled();
      expect(await snapshot(value)).toEqual(before);
      await baseline(value);
    } finally {
      await runtime?.app.close();
      await dispose(value);
    }
  },
);

it.each([
  [true, false],
  [true, true],
  [false, false],
  [false, true],
])(
  'preserves genuine historical duplicate context asymmetry: same queue=%s, host context=%s',
  async (sameQueue, host) => {
    const value = await fixture();
    let runtime: Awaited<ReturnType<typeof importedRuntime>> | undefined;
    try {
      const capture = duplicateArchivedFixture(value.tenants[0], sameQueue!, host!, httpActor);
      await writeBoundary(value);
      await importOfflineState(value.admin, capture.manifest, {
        storage: value.options,
        verifyArchive: { verify: async () => capture.proof },
      });
      await value.admin.query('commit');
      const before = await snapshot(value);
      expect(
        (await value.admin.query('select context_json from offline.sync_item_attempts')).rows,
      ).toEqual([{ context_json: { originalQueueItemId: 'queue' } }]);
      runtime = await importedRuntime(value, capture.actor);
      const response = await request(runtime.app.getHttpServer())
        .post(capture.path)
        .set('Authorization', 'Bearer ' + runtime.accessToken)
        .set('Idempotency-Key', capture.header)
        .send(capture.input);
      expect(response.status, response.text).toBe(201);
      expect(Buffer.from(response.text)).toEqual(capture.bytes);
      expect(response.body.duplicateItems).toBe(1);
      const expected = {
        ...(host ? { originalHostFact: 'preserved canonical context' } : {}),
        ...(sameQueue ? {} : { originalQueueItemId: 'queue' }),
      };
      if (Object.keys(expected).length) expect(response.body.items[0].context).toEqual(expected);
      else expect(response.body.items[0]).not.toHaveProperty('context');
      expect(runtime.apply).not.toHaveBeenCalled();
      expect(runtime.hash).not.toHaveBeenCalled();
      expect(runtime.append).not.toHaveBeenCalled();
      expect(await snapshot(value)).toEqual(before);
      await baseline(value);
    } finally {
      await runtime?.app.close();
      await dispose(value);
    }
  },
);

it.each(['marker', 'status'] as const)(
  'rejects historical duplicate proof with a wrong %s instead of treating context as an arbitrary subset',
  async (difference) => {
    const value = await fixture();
    try {
      const capture = duplicateArchivedFixture(value.tenants[0], false, true);
      const attempt = capture.manifest.records.find((record) => record.kind === 'attempts')!;
      if (difference === 'marker')
        Object.assign(attempt.row, {
          context_json: { originalQueueItemId: 'not-the-canonical-queue' },
        });
      else Object.assign(attempt.row, { status: 'rejected' });
      const changed = recaptureArchive(capture);
      const before = await snapshot(value);
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, changed.manifest, {
          storage: value.options,
          verifyArchive: { verify: async () => changed.proof },
        }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it.each(['canonical-hash', 'extra-raw-context'] as const)(
  'rejects duplicate archive evidence with %s instead of granting generic partial-context trust',
  async (difference) => {
    const value = await fixture();
    try {
      const capture = duplicateArchivedFixture(value.tenants[0], false, true);
      if (difference === 'canonical-hash') {
        const receipt = capture.manifest.records.find((record) => record.kind === 'receipts')!;
        Object.assign(receipt.row, { payload_hash: `sha256:${'f'.repeat(64)}` });
      } else {
        const attempt = capture.manifest.records.find((record) => record.kind === 'attempts')!;
        Object.assign(attempt.row, {
          context_json: { originalQueueItemId: 'queue', stynx: { unreviewed: true } },
        });
      }
      const changed = recaptureArchive(capture);
      const before = await snapshot(value);
      await writeBoundary(value);
      await expect(
        importOfflineState(value.admin, changed.manifest, {
          storage: value.options,
          verifyArchive: { verify: async () => changed.proof },
        }),
      ).rejects.toMatchObject({ reason: 'archive-invalid' });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it('refuses null declaration archive fallback to another batch without an actual per-batch attempt', async () => {
  const value = await fixture();
  try {
    const capture = legacyArchivedFixture(value.tenants[0], 1);
    const batch = capture.manifest.records.find((record) => record.kind === 'batches')!;
    const previous = {
      ...batch.row,
      device_batch_id: 'another-source-batch',
      batch_sequence: '2',
      status: 'legacy_closed_unverified',
      transport_key: null,
      transport_fingerprint: null,
      response_status: null,
      response_body_base64: null,
      response_headers: {},
    };
    capture.manifest.records.push({ kind: 'batches', row: previous } as OfflineImportRecord);
    for (const record of capture.manifest.records)
      if (record.kind === 'queueItems' || record.kind === 'receipts')
        Object.assign(record.row, { device_batch_id: 'another-source-batch' });
    const changed = recaptureArchive(capture);
    const before = await snapshot(value);
    await writeBoundary(value);
    await expect(
      importOfflineState(value.admin, changed.manifest, {
        storage: value.options,
        verifyArchive: { verify: async () => changed.proof },
      }),
    ).rejects.toMatchObject({ reason: 'archive-invalid' });
    expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
    expect(await snapshot(value)).toEqual(before);
  } finally {
    await dispose(value);
  }
});

it('accepts an archive verifier class with private state, own fields and a prototype method preserving its receiver', async () => {
  const value = await fixture();
  try {
    const capture = archivedFixture(value.tenants[0]);
    class StatefulArchiveVerifier {
      #expected = capture.manifest.archives[0];
      calls = 0;
      label = 'independent-provider-state';
      async verify(archive: unknown) {
        expect(archive).toEqual(this.#expected);
        expect(this.label).toBe('independent-provider-state');
        this.calls++;
        return capture.proof;
      }
    }
    const port = new StatefulArchiveVerifier();
    await writeBoundary(value);
    const receipt = await importOfflineState(value.admin, capture.manifest, {
      storage: value.options,
      verifyArchive: port,
    });
    await value.admin.query('commit');
    expect(port.calls).toBe(1);
    expect(receipt.archives[0]?.verdict).toBe('verified');
    await baseline(value);
  } finally {
    await dispose(value);
  }
});
it.each([{}, { verify: null }, { verify: 'not-callable' }])(
  'refuses a noncallable archive verifier without starting SQL: %j',
  async (port) => {
    const query = vi.fn();
    const capture = archivedFixture('11111111-1111-4111-8111-111111111111');
    await expect(
      importOfflineState({ query }, capture.manifest, {
        verifyArchive: port as never,
      }),
    ).rejects.toMatchObject({ reason: 'invalid-manifest' });
    expect(query).not.toHaveBeenCalled();
  },
);

it.each([
  ['42P01', 'storage-unsupported'],
  ['42703', 'storage-unsupported'],
  ['42883', 'storage-unsupported'],
  ['23505', 'record-conflict'],
  ['23503', 'invariant-violation'],
  ['23514', 'invariant-violation'],
  ['STY99', 'invariant-violation'],
  ['42501', 'maintenance-required'],
  ['XX000', null],
] as const)(
  'preserves atomic refusal on native SQL failure %s during insertion',
  async (code, reason) => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      const before = await snapshot(value);
      await writeBoundary(value);
      let injected = false;
      const transaction = {
        async query<T extends Record<string, unknown>>(sql: string, parameters?: unknown[]) {
          if (!injected && /^insert into offline\."numbering_ranges"/u.test(sql)) {
            injected = true;
            await value.admin.query(
              `do $$ begin raise exception using errcode='${code}',message='private database detail'; end $$`,
            );
          }
          return value.admin.query<T>(sql, parameters);
        },
      };
      if (reason)
        await expect(
          importOfflineState(transaction, manifest, { storage: value.options }),
        ).rejects.toMatchObject({ reason });
      else
        await expect(
          importOfflineState(transaction, manifest, { storage: value.options }),
        ).rejects.toMatchObject({ code });
      expect(injected).toBe(true);
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it('rejects a missing intended foreign-key parent before inserting any import history', async () => {
  const value = await fixture();
  try {
    const records = history(value).filter((record) => record.kind === 'ranges');
    // A missing tenant has a separate admission check; this orphan is within an admitted tenant.
    const reservation = history(value).find((record) => record.kind === 'reservations')!;
    Object.assign(reservation.row, { range_id: randomUUID() });
    records.push(reservation);
    const before = await snapshot(value);
    await writeBoundary(value);
    await expect(
      importOfflineState(value.admin, importManifest(records), { storage: value.options }),
    ).rejects.toMatchObject({
      reason: 'invariant-violation',
      object: expect.stringContaining('foreign-key:'),
    });
    expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
    expect(await snapshot(value)).toEqual(before);
  } finally {
    await dispose(value);
  }
});

it('admits equal preexisting history once under a new independently bound source snapshot', async () => {
  const value = await fixture();
  try {
    const original = importManifest(history(value));
    await writeBoundary(value);
    await importOfflineState(value.admin, original, { storage: value.options });
    await value.admin.query('commit');
    const second = rehashManifest({
      ...original,
      source: { ...original.source, snapshotId: 'second-independent-capture' },
    });
    const before = await snapshot(value);
    await writeBoundary(value);
    const receipt = await importOfflineState(value.admin, second, { storage: value.options });
    await value.admin.query('commit');
    const after = await snapshot(value);
    for (const relation of relations.filter((relation) => relation !== 'sync_import_receipts'))
      expect(after[relation]).toEqual(before[relation]);
    expect(after.sync_import_receipts).toHaveLength(2);
    expect(receipt.source.snapshotId).toBe('second-independent-capture');
  } finally {
    await dispose(value);
  }
});

it('returns the exact archived bytes with the documented default media type when source headers omit content-type', async () => {
  const value = await fixture();
  let runtime: Awaited<ReturnType<typeof importedRuntime>> | undefined;
  try {
    const capture = archivedFixture(value.tenants[0], httpActor);
    delete (capture.headers as Record<string, string>)['content-type'];
    const changed = recaptureArchive(capture);
    await writeBoundary(value);
    await importOfflineState(value.admin, changed.manifest, {
      storage: value.options,
      verifyArchive: { verify: async () => changed.proof },
    });
    await value.admin.query('commit');
    runtime = await importedRuntime(value, capture.actor);
    const response = await request(runtime.app.getHttpServer())
      .post(capture.path)
      .set('Authorization', 'Bearer ' + runtime.accessToken)
      .set('Idempotency-Key', capture.header)
      .send(capture.input);
    expect(response.status, response.text).toBe(201);
    expect(Buffer.from(response.text)).toEqual(changed.bytes);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(runtime.apply).not.toHaveBeenCalled();
    expect(runtime.hash).not.toHaveBeenCalled();
    expect(runtime.append).not.toHaveBeenCalled();
  } finally {
    await runtime?.app.close();
    await dispose(value);
  }
});
it.each([null, [], { unknown: true }, { storage: { arbitrarySql: 'select 1' } }])(
  'refuses illegal import options without taking a transaction: %j',
  async (options) => {
    const query = vi.fn();
    await expect(
      importOfflineState({ query }, importManifest([]), options as never),
    ).rejects.toMatchObject({ reason: 'invalid-manifest' });
    expect(query).not.toHaveBeenCalled();
  },
);

it('imports a genuinely open empty batch without manufacturing an archive or closed lifecycle', async () => {
  const value = await fixture();
  try {
    const batch = history(value).find((record) => record.kind === 'batches')!;
    Object.assign(batch.row, {
      status: 'open',
      declared_keys: [],
      response_status: null,
      response_body_base64: null,
      response_headers: {},
      transport_key: null,
      transport_fingerprint: null,
      lease_token: null,
      lease_expires_at: null,
    });
    await writeBoundary(value);
    const receipt = await importOfflineState(value.admin, importManifest([batch]), {
      storage: value.options,
    });
    await value.admin.query('commit');
    expect(receipt.archives).toEqual([
      expect.objectContaining({
        verdict: 'unverified',
        responseBodySha256: null,
        evidenceId: null,
      }),
    ]);
    expect(
      (
        await value.admin.query(
          'select status,response_status,response_body_bytes,response_body_is_archived from offline.sync_batches',
        )
      ).rows,
    ).toEqual([
      {
        status: 'open',
        response_status: null,
        response_body_bytes: null,
        response_body_is_archived: false,
      },
    ]);
    await baseline(value);
  } finally {
    await dispose(value);
  }
});
it.each(['read-only', 'wrong-owner', 'unsupported-storage'] as const)(
  'fails closed at the actual owner maintenance boundary: %s',
  async (failure) => {
    const value = await fixture();
    try {
      if (failure === 'unsupported-storage')
        await value.admin.query(
          'alter table offline.sync_conflict_actions no force row level security',
        );
      const before = await snapshot(value);
      await value.admin.query(`begin ${failure === 'read-only' ? 'read only' : 'read write'}`);
      await value.admin.query(
        `set local role ${value.admin.escapeIdentifier(failure === 'wrong-owner' ? value.options.appRole! : value.options.ownerRole!)}`,
      );
      await expect(
        importOfflineState(value.admin, importManifest(history(value)), { storage: value.options }),
      ).rejects.toMatchObject({
        reason: failure === 'unsupported-storage' ? 'storage-unsupported' : 'maintenance-required',
      });
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it.each(['owner-clock', 'prior-ledger', 'final-inspection'] as const)(
  'aborts without a prefix when the supplied transaction returns a faulty %s result',
  async (fault) => {
    const value = await fixture();
    try {
      const manifest = importManifest(history(value));
      if (fault === 'prior-ledger') {
        await writeBoundary(value);
        await importOfflineState(value.admin, manifest, { storage: value.options });
        await value.admin.query('commit');
      }
      const before = await snapshot(value);
      await writeBoundary(value);
      let insertedLedger = false,
        injected = false;
      const transaction = {
        async query<T extends Record<string, unknown>>(sql: string, parameters?: unknown[]) {
          const result = await value.admin.query<T>(sql, parameters);
          if (/^insert into offline\.sync_import_receipts/u.test(sql)) insertedLedger = true;
          if (
            fault === 'owner-clock' &&
            sql.includes('from (select clock_timestamp() as at) observation')
          ) {
            injected = true;
            return { ...result, rows: [] };
          }
          if (
            fault === 'prior-ledger' &&
            sql.includes('from offline.sync_import_receipts where source_identity_sha256=$1')
          ) {
            injected = true;
            return { ...result, rows: result.rows.map((item) => ({ ...item, receipt: {} }) as T) };
          }
          if (
            fault === 'final-inspection' &&
            insertedLedger &&
            sql.includes("current_setting('transaction_read_only')") &&
            !sql.includes('transaction_isolation')
          ) {
            injected = true;
            return { ...result, rows: [] };
          }
          return result;
        },
      };
      await expect(
        importOfflineState(transaction, manifest, { storage: value.options }),
      ).rejects.toMatchObject({
        reason: fault === 'owner-clock' ? 'maintenance-required' : 'invariant-violation',
        object:
          fault === 'owner-clock'
            ? 'owner-clock'
            : fault === 'prior-ledger'
              ? 'import-receipt'
              : 'imported-state',
      });
      expect(injected).toBe(true);
      expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it('rejects an intended cross-row scope violation before inserting valid individual records', async () => {
  const value = await fixture();
  try {
    const records = history(value);
    Object.assign(records.find((record) => record.kind === 'reservations')!.row, {
      org_unit_id: 'different-org',
    });
    const before = await snapshot(value);
    await writeBoundary(value);
    await expect(
      importOfflineState(value.admin, importManifest(records), { storage: value.options }),
    ).rejects.toMatchObject({ reason: 'invariant-violation', object: 'intended-state' });
    expect((await value.admin.query('commit')).command).toBe('ROLLBACK');
    expect(await snapshot(value)).toEqual(before);
  } finally {
    await dispose(value);
  }
});
