import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, type Transaction } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import { importOfflineState } from '../../src/import-state.js';
import { OfflineImportError } from '../../src/import-contract.js';
import type { OfflineImportRecord } from '../../src/import-schema.generated.js';
import type { StynxOfflineSyncModuleOptions } from '../../src/types.js';
import { fixture, dispose } from '../support/offline-storage-fixture.js';
import { importManifest, rehashManifest } from '../support/offline-import-fixtures.js';
import { GAP_AT, GAP_TENANT_A, GAP_TENANT_B } from '../support/offline-sync-acceptance-gaps.js';
import {
  registerDomainOutcomeContracts,
  domainBatch,
  domainFailure,
  domainEvents,
} from '../support/offline-domain-outcomes.js';

// INV-OFFLINE-001; D1.1: real item/refusal transactions and direct restricted-role FORCE RLS.
describe('Domain-outcome contracts through real PostgreSQL', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let clock = Date.parse(GAP_AT);
  const run = <T>(tenantId: string, operation: () => Promise<T>) =>
    moduleRef.get(RequestContextMutator).runWithRequestContext(
      {
        requestId: 'domain-outcome-inspector',
        tenantId,
        actorId: 'authenticated-audit-actor',
        startedAt: new Date(clock),
      },
      operation,
    );
  const service = (options: Partial<StynxOfflineSyncModuleOptions> = {}, tenantId = GAP_TENANT_A) =>
    new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId, actorId: 'authenticated-audit-actor' }) },
      {
        now: () => new Date(clock).toISOString(),
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
        ...options,
      },
    );
  const query = (tenantId: string, text: string, values: unknown[] = []) =>
    run(tenantId, () => moduleRef.get(Database).tx((trx) => trx.query(text, values)));
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_161_domain', { useTemplate: false });
    await pg.ensureRoleLogin('stynx_app');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('domain-owner') },
            app: { connectionString: pg.appConnectionString('domain-app'), max: 10 },
            reader: { connectionString: pg.connectionString('domain-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      const directory = resolve(__dirname, '../../migrations');
      for (const name of (await readdir(directory))
        .filter((name) => /^\d{4}.*\.sql$/u.test(name))
        .sort())
        await admin.query(await readFile(resolve(directory, name), 'utf8'));
      await admin.query(
        `insert into tenancy.tenants(id,slug,name) values ($1,'domain-a','Domain A'),($2,'domain-b','Domain B')`,
        [GAP_TENANT_A, GAP_TENANT_B],
      );
      await admin.query(
        `create table public.inspector_domain_effects(tenant_id uuid not null, item_id text not null, primary key(tenant_id,item_id)); alter table public.inspector_domain_effects enable row level security; alter table public.inspector_domain_effects force row level security; create policy domain_effect_tenant on public.inspector_domain_effects to stynx_app using(tenant_id=current_setting('app.tenant_id')::uuid) with check(tenant_id=current_setting('app.tenant_id')::uuid); grant select,insert on public.inspector_domain_effects to stynx_app`,
      );
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);
  registerDomainOutcomeContracts(() => {
    clock = Date.parse(GAP_AT);
    return {
      fatalReceiptMaterialization: 'received' as const,
      service,
      run,
      tick: () => {
        clock += 1000;
      },
      readConflictCode: async (id) =>
        (
          await query(
            GAP_TENANT_A,
            "select evidence->>'errorCode' as code from offline.sync_conflict_evidence where conflict_id=$1::uuid",
            [id],
          )
        ).rows[0]!.code,
      readConflictActions: async (id) =>
        (
          await query(
            GAP_TENANT_A,
            'select allowed_actions from offline.sync_conflict_evidence where conflict_id=$1::uuid',
            [id],
          )
        ).rows[0]!.allowed_actions,
    };
  });

  it('D1.1 classifies only after actual effect rollback and atomically persists original refusal/conflict evidence', async () => {
    clock = Date.parse(GAP_AT);
    const input = domainBatch('sql-effect-rollback');
    const setup = await pg.connectAsAdmin();
    try {
      await setup.query(
        `insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values ('10000000-0000-4000-8000-0000000000e1',$1,'org-a','citation','D',1,100,1,'active')`,
        [GAP_TENANT_A],
      );
    } finally {
      await setup.end();
    }
    const consumer = {
      conflictId: 'consumer-value',
      allowedActions: ['consumer-value'],
      nested: { original: true },
    };
    let transaction!: Transaction;
    const apply = vi.fn(async (trx: Transaction) => {
      transaction = trx;
      await trx.query('insert into public.inspector_domain_effects values($1::uuid,$2)', [
        GAP_TENANT_A,
        input.items[0]!.queueItemId,
      ]);
      throw domainFailure(consumer);
    });
    const classify = vi.fn(() => {
      expect(transaction).toMatchObject({ active: false });
      return {
        status: 'conflict' as const,
        conflict: { type: 'domain' as const, description: 'closed business record' },
      };
    });
    const eventPort = domainEvents();
    const subject = service({
      itemApplier: { apply },
      eventPort,
      domainOutcomeClassifier: { classify },
    });
    const reservation = await run(GAP_TENANT_A, () =>
      subject.reserveDurableNumbering({
        orgUnitId: input.orgUnitId,
        deviceId: input.deviceId,
        shiftId: null,
        entityType: 'citation',
        requestedSize: 1,
      }),
    );
    const numbered = {
      ...input,
      items: [{ ...input.items[0]!, reservedNumber: reservation.startNumber }],
    };
    const result = await run(GAP_TENANT_A, () => subject.submitSyncBatch(numbered));
    expect(result.receipt.status).toBe('closed');
    expect(
      (await query(GAP_TENANT_A, 'select * from public.inspector_domain_effects')).rows,
    ).toEqual([]);
    expect(
      (
        await query(
          GAP_TENANT_A,
          'select status,server_entity_id from offline.numbering_consumption where reservation_id=$1::uuid',
          [reservation.reservationId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await run(GAP_TENANT_A, () => subject.getNumberingConsumption(reservation.reservationId)))
        .consumption,
    ).toEqual([
      {
        number: reservation.startNumber,
        status: 'available',
        serverEntityId: null,
        finalizedAt: null,
      },
    ]);
    const evidence = (
      await query(
        GAP_TENANT_A,
        'select c.id,c.tenant_id,c.sync_queue_item_id,e.allowed_actions,e.evidence from offline.sync_conflicts c join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id where c.sync_queue_item_id=$1',
        [input.items[0]!.queueItemId],
      )
    ).rows;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      tenant_id: GAP_TENANT_A,
      sync_queue_item_id: input.items[0]!.queueItemId,
      allowed_actions: ['reject', 'retry_after_correction'],
      evidence: {
        context: consumer,
        errorCode: 'BUSINESS_CLOSED',
        detectedAt: GAP_AT,
        stynx: { receiptId: 'key-sql-effect-rollback', retryable: true },
      },
    });
    expect(eventPort.appendInTransaction).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('D1.1 rolls back every refusal write when receipt persistence fails after conflict creation', async () => {
    const input = domainBatch('refusal-atomic');
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query(
        `create function public.inspector_refusal_fault() returns trigger language plpgsql as $$ begin if new.idempotency_key='key-refusal-atomic' and new.error_code='BUSINESS_CLOSED' then raise exception 'inspector refusal fault'; end if; return new; end $$; create trigger inspector_refusal_fault before update on offline.sync_item_receipts for each row execute function public.inspector_refusal_fault()`,
      );
      const subject = service({
        itemApplier: {
          apply: async () => {
            throw domainFailure();
          },
        },
        eventPort: domainEvents(),
        domainOutcomeClassifier: {
          classify: () => ({
            status: 'conflict',
            conflict: { type: 'concurrency', description: 'collision' },
          }),
        },
      });
      await expect(run(GAP_TENANT_A, () => subject.submitSyncBatch(input))).rejects.toThrow(
        'inspector refusal fault',
      );
      expect(
        (
          await query(
            GAP_TENANT_A,
            'select status,error_code from offline.sync_item_receipts where idempotency_key=$1',
            ['key-refusal-atomic'],
          )
        ).rows,
      ).toEqual([{ status: 'received', error_code: null }]);
      expect(
        (
          await query(
            GAP_TENANT_A,
            'select * from offline.sync_conflicts where sync_queue_item_id=$1',
            [input.items[0]!.queueItemId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await query(
            GAP_TENANT_A,
            'select * from offline.sync_conflict_evidence where queue_item_id=$1',
            [input.items[0]!.queueItemId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await query(
            GAP_TENANT_A,
            'select status,response_status from offline.sync_batches where device_batch_id=$1',
            [input.deviceBatchId],
          )
        ).rows,
      ).toEqual([{ status: 'open', response_status: null }]);
      await admin.query(
        'drop trigger inspector_refusal_fault on offline.sync_item_receipts; drop function public.inspector_refusal_fault()',
      );
      expect((await run(GAP_TENANT_A, () => subject.submitSyncBatch(input))).receipt.status).toBe(
        'closed',
      );
      expect(
        (
          await query(
            GAP_TENANT_A,
            'select * from offline.sync_conflicts where sync_queue_item_id=$1',
            [input.items[0]!.queueItemId],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await admin.query(
        'drop trigger if exists inspector_refusal_fault on offline.sync_item_receipts; drop function if exists public.inspector_refusal_fault()',
      );
      await admin.end();
    }
  });

  it('D1.1 restricts canonical domain outcome evidence by two tenants under FORCE RLS', async () => {
    const tables = [
      'sync_queue_items',
      'sync_item_receipts',
      'sync_item_attempts',
      'sync_conflicts',
      'sync_conflict_evidence',
    ];
    const flags = await query(
      GAP_TENANT_A,
      `select c.relname,c.relrowsecurity,c.relforcerowsecurity,current_user::text as role from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relname=any($1::text[]) order by c.relname`,
      [tables],
    );
    expect(flags.rows).toHaveLength(tables.length);
    for (const row of flags.rows)
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
        role: 'stynx_app',
      });
    for (const table of tables)
      expect((await query(GAP_TENANT_B, `select * from offline.${table}`)).rows).toEqual([]);
    const receipt = (
      await query(
        GAP_TENANT_A,
        'select to_jsonb(r) as row from offline.sync_item_receipts r limit 1',
      )
    ).rows[0]!.row;
    await expect(
      query(
        GAP_TENANT_B,
        'insert into offline.sync_item_receipts select (jsonb_populate_record(null::offline.sync_item_receipts,$1::jsonb)).*',
        [JSON.stringify(receipt)],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('D1.1 imports an actual source terminal received marker losslessly and refuses contradictory marker assertions', async () => {
    const input = domainBatch('actual-source-terminal-import');
    let terminal = false;
    const subject = service({
      initialQueueStatus: 'pending',
      itemApplier: {
        apply: async () => {
          throw domainFailure({ original: 'source-context' });
        },
      },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify: () => (terminal ? { status: 'received' } : undefined) },
    });
    expect((await run(GAP_TENANT_A, () => subject.submitSyncBatch(input))).receipt.status).toBe(
      'open',
    );
    terminal = true;
    const retryBase = domainBatch('actual-source-terminal-import-retry');
    const retry = {
      ...retryBase,
      deviceId: input.deviceId,
      items: [{ ...retryBase.items[0]!, idempotencyKey: input.items[0]!.idempotencyKey }],
    };
    const sourceBatchIds = [input.deviceBatchId, retry.deviceBatchId];
    const source = await run(GAP_TENANT_A, () => subject.submitSyncBatch(retry));
    expect(source.receipt.items[0]!.stynx).toMatchObject({
      terminalReceived: true,
      retryable: false,
    });
    const sourceAdmin = await pg.connectAsAdmin();
    const destination = await fixture();
    const target = destination.admin;
    try {
      const records: OfflineImportRecord[] = [];
      for (const [kind, relation] of [
        ['batches', 'sync_batches'],
        ['queueItems', 'sync_queue_items'],
        ['transportKeys', 'sync_batch_transport_keys'],
        ['receipts', 'sync_item_receipts'],
        ['attempts', 'sync_item_attempts'],
      ] as const) {
        const rows = (
          await sourceAdmin.query(
            `select to_jsonb(t) as row from offline.${relation} t where tenant_id=$1::uuid and device_batch_id=any($2::text[])`,
            [GAP_TENANT_A, sourceBatchIds],
          )
        ).rows;
        for (const { row } of rows) {
          if (kind === 'batches') {
            row.batch_sequence = row.batch_sequence === null ? null : String(row.batch_sequence);
            row.lease_generation = String(row.lease_generation);
            row.response_body_base64 = null;
            row.response_status = null;
            row.response_headers = {};
            delete row.response_body_bytes;
            delete row.response_body_is_archived;
          }
          if (kind === 'queueItems')
            row.reserved_number = row.reserved_number === null ? null : String(row.reserved_number);
          records.push({ kind, row } as OfflineImportRecord);
        }
      }
      expect(records.filter((record) => record.kind === 'receipts')[0]!.row).toMatchObject({
        status: 'received',
        context_json: {
          original: 'source-context',
          stynx: { terminalReceived: true, retryable: false },
        },
      });
      expect(records.find((record) => record.kind === 'attempts')!.row).toMatchObject({
        status: 'received',
        context_json: { stynx: { terminalReceived: true, retryable: false } },
      });
      await target.query('insert into auth.tenants values($1)', [GAP_TENANT_A]);
      const manifest = importManifest(records);
      for (const kind of ['receipts', 'attempts'] as const)
        for (const [status, retryable, marker] of [
          ['rejected', false, true],
          ['received', true, true],
          ['received', false, false],
        ] as const) {
          const contradictory = structuredClone(manifest);
          const row = contradictory.records.find((record) => record.kind === kind)!
            .row as unknown as Record<string, unknown>;
          row.status = status;
          row.context_json = {
            original: 'source-context',
            stynx: { version: 1, terminalReceived: marker, retryable },
          };
          await target.query(
            `begin; set local role ${target.escapeIdentifier(destination.options.ownerRole!)}`,
          );
          await expect(
            importOfflineState(target, rehashManifest(contradictory), {
              storage: destination.options,
            }),
          ).rejects.toBeInstanceOf(OfflineImportError);
          await target.query('rollback');
          expect(
            (await target.query('select count(*)::text as count from offline.sync_item_receipts'))
              .rows,
          ).toEqual([{ count: '0' }]);
        }
      await target.query(
        `begin; set local role ${target.escapeIdentifier(destination.options.ownerRole!)}`,
      );
      const historical = structuredClone(manifest);
      for (const record of historical.records)
        if (record.kind === 'receipts' || record.kind === 'attempts') {
          delete (
            (record.row.context_json as Record<string, unknown>).stynx as Record<string, unknown>
          ).terminalReceived;
        }
      await importOfflineState(target, rehashManifest(historical), {
        storage: destination.options,
      });
      for (const relation of ['sync_item_receipts', 'sync_item_attempts']) {
        const old = (await target.query(`select context_json from offline.${relation}`)).rows;
        expect(old).toHaveLength(1);
        expect(old[0]!.context_json.stynx).not.toHaveProperty('terminalReceived');
      }
      await target.query('rollback');
      await target.query(
        `begin; set local role ${target.escapeIdentifier(destination.options.ownerRole!)}`,
      );
      await importOfflineState(target, manifest, { storage: destination.options });
      await target.query('commit');
      const imported = (
        await target.query('select to_jsonb(r) as row from offline.sync_item_receipts r')
      ).rows;
      const original = (
        await sourceAdmin.query(
          'select to_jsonb(r) as row from offline.sync_item_receipts r where idempotency_key=$1',
          ['key-actual-source-terminal-import'],
        )
      ).rows;
      expect(imported).toEqual(original);
      expect(
        (await target.query('select to_jsonb(a) as row from offline.sync_item_attempts a')).rows,
      ).toEqual(
        (
          await sourceAdmin.query(
            'select to_jsonb(a) as row from offline.sync_item_attempts a where device_batch_id=any($1::text[])',
            [sourceBatchIds],
          )
        ).rows,
      );
      expect(imported[0]!.row.context_json.stynx).toMatchObject({
        terminalReceived: true,
        retryable: false,
      });
      await target.query(
        `begin; set local role ${target.escapeIdentifier(destination.options.ownerRole!)}`,
      );
      await importOfflineState(target, manifest, { storage: destination.options });
      await target.query('commit');
      expect(
        (await target.query('select to_jsonb(r) as row from offline.sync_item_receipts r')).rows,
      ).toEqual(imported);
    } finally {
      await target.query('rollback');
      await sourceAdmin.end();
      await dispose(destination);
    }
  }, 60_000);
});
