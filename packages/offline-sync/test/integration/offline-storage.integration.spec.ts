import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import { StynxDataModule } from '@stynx-nyx/data';
import { describe, expect, it } from 'vitest';
import {
  importRecords,
  importManifest,
  fixtureDigest,
  fixtureBytesDigest,
  rehashManifest,
} from '../support/offline-import-fixtures';
import { renderOfflineStorage, verifyOfflineStorage } from '../../src/storage';
import {
  createPostgresTestDatabase,
  withPostgresCredentials,
} from '../../../data/test/support/postgres';

import { fixture, dispose, verify, baseline } from '../support/offline-storage-fixture';
import { packedStorageCli } from '../support/packed-storage-cli';

describe('D6 independent closed offline storage PostgreSQL installation', () => {
  it.each([true, false])(
    'supports custom auth.tenants, restricted direct login and optional reader=%s',
    async (reader) => {
      const value = await fixture(reader);
      try {
        const report = await baseline(value);
        expect(report.binding).toEqual(value.options);
        const app = new Client({
          connectionString: value.postgres.appConnectionString(
            'offline-storage-app',
            value.options.appRole,
          ),
        });
        await app.connect();
        try {
          expect(
            (
              await app.query(
                'select current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user',
              )
            ).rows,
          ).toEqual([
            {
              current_user: value.options.appRole,
              session_user: value.options.appRole,
              rolsuper: false,
              rolbypassrls: false,
            },
          ]);
          await value.admin.query(
            `set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
          );
          const ids = [randomUUID(), randomUUID()];
          for (let index = 0; index < 2; index++)
            await value.admin.query(
              "insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values($1,$2,'org','record','A',1,10,1,'active')",
              [ids[index], value.tenants[index]],
            );
          await value.admin.query('reset role');
          await app.query('begin');
          await app.query(
            "select set_config('app.tenant_id',$1,true),set_config('app.actor_id','restricted-actor',true)",
            [value.tenants[0]],
          );
          expect((await app.query('select id from offline.numbering_ranges')).rows).toEqual([
            { id: ids[0] },
          ]);
          expect(
            (
              await app.query(
                'update offline.numbering_ranges set next_number=2 where id=$1 returning id',
                [ids[1]],
              )
            ).rows,
          ).toEqual([]);
          expect(
            (
              await app.query('delete from offline.numbering_ranges where id=$1 returning id', [
                ids[1],
              ])
            ).rows,
          ).toEqual([]);
          await app.query('rollback');
          await expect(
            app.query('select * from offline.sync_import_receipts'),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            app.query(
              "insert into offline.sync_import_receipts(source_identity_sha256) values('forged')",
            ),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            app.query("update offline.sync_import_receipts set imported_by='forged'"),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(app.query('delete from offline.sync_import_receipts')).rejects.toMatchObject(
            { code: '42501' },
          );
        } finally {
          await app.query('rollback').catch(() => undefined);
          await app.end();
        }
        await baseline(value);
      } finally {
        await dispose(value);
      }
    },
  );

  it('removes an obsolete PUBLIC tenant policy when binding the application without deleting unrelated role grants', async () => {
    const value = await fixture();
    try {
      const other = `ofs_other_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      value.roles.push(other);
      await value.admin.query(
        `create role ${value.admin.escapeIdentifier(other)} nosuperuser nobypassrls noinherit`,
      );
      await value.admin.query(
        `grant select on offline.numbering_ranges to ${value.admin.escapeIdentifier(other)}`,
      );
      const policies = (
        await value.admin.query(
          "select policyname from pg_policies where schemaname='offline' and tablename='numbering_ranges'",
        )
      ).rows;
      for (const row of policies)
        await value.admin.query(
          `drop policy ${value.admin.escapeIdentifier(row.policyname)} on offline.numbering_ranges`,
        );
      await value.admin.query(
        'create policy offline_tenant_isolation on offline.numbering_ranges using (true) with check (true)',
      );
      expect((await verify(value)).supported).toBe(false);
      await value.admin.query(renderOfflineStorage(value.options).roleBindingsSql);
      await baseline(value);
      expect(
        (
          await value.admin.query(
            "select roles from pg_policies where schemaname='offline' and tablename='numbering_ranges'",
          )
        ).rows.every((row) => !row.roles.includes('public')),
      ).toBe(true);
      expect(
        (
          await value.admin.query(
            "select has_table_privilege($1,'offline.numbering_ranges','SELECT') as allowed",
            [other],
          )
        ).rows,
      ).toEqual([{ allowed: true }]);
    } finally {
      await dispose(value);
    }
  });

  it('refuses a writable owner, app identity and a FORCE-RLS-filtered owner before trusting row scans', async () => {
    const value = await fixture();
    try {
      await baseline(value);
      expect((await verify(value, { readonly: false })).checks).toContainEqual(
        expect.objectContaining({ id: 'transaction-read-only', status: 'fail' }),
      );
      expect((await verify(value, { role: value.options.appRole! })).checks).toContainEqual(
        expect.objectContaining({ id: 'transaction-owner', status: 'fail' }),
      );
      await value.admin.query(
        `alter role ${value.admin.escapeIdentifier(value.options.ownerRole!)} nobypassrls`,
      );
      const report = await verify(value);
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ id: 'owner-full-row-visibility', status: 'fail' }),
      );
    } finally {
      await dispose(value);
    }
  });

  it.each([
    [
      'FORCE RLS',
      'alter table offline.numbering_ranges no force row level security',
      'catalog:relation:numbering_ranges',
    ],
    [
      'required column',
      'alter table offline.sync_item_attempts drop column context_json',
      'catalog:column:sync_item_attempts.context_json',
    ],
    [
      'history trigger',
      'alter table offline.sync_import_receipts disable trigger sync_import_receipts_append_only',
      'catalog:trigger:',
    ],
    [
      'unexpected function',
      'create function offline.consumer_extra() returns integer language sql as $$select 1$$',
      'catalog-unexpected:function:',
    ],
  ])('refuses %s drift with a named structural check', async (_name, sql, check) => {
    const value = await fixture();
    try {
      await baseline(value);
      await value.admin.query(sql);
      const report = await verify(value);
      expect(report.supported).toBe(false);
      expect(
        report.checks.some((item) => item.status === 'fail' && item.id.startsWith(check)),
      ).toBe(true);
    } finally {
      await dispose(value);
    }
  });

  it('refuses inherited column mutation and grant-option capabilities on the owner-only import ledger', async () => {
    const value = await fixture();
    try {
      await baseline(value);
      const parent = `ofs_parent_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      value.roles.push(parent);
      await value.admin.query(
        `create role ${value.admin.escapeIdentifier(parent)} nosuperuser nobypassrls noinherit`,
      );
      await value.admin.query(
        `grant ${value.admin.escapeIdentifier(parent)} to ${value.admin.escapeIdentifier(value.options.appRole!)}`,
      );
      await value.admin.query(
        `grant update(imported_by) on offline.sync_import_receipts to ${value.admin.escapeIdentifier(parent)}`,
      );
      let report = await verify(value);
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: `effective-grant:${value.options.appRole}:sync_import_receipts.imported_by:UPDATE`,
          status: 'fail',
        }),
      );
      await value.admin.query(
        `revoke update(imported_by) on offline.sync_import_receipts from ${value.admin.escapeIdentifier(parent)}`,
      );
      await value.admin.query(
        `grant select on offline.numbering_ranges to ${value.admin.escapeIdentifier(parent)} with grant option`,
      );
      report = await verify(value);
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: `effective-grant-option:${value.options.appRole}:numbering_ranges:SELECT`,
          status: 'fail',
        }),
      );
    } finally {
      await dispose(value);
    }
  });
});

it('verifies the independently migrated default catalog through0008 without modifying populated history', async () => {
  const postgres = await createPostgresTestDatabase('stynx_offline_storage_default', {
    useTemplate: false,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: postgres.connectionString('storage-default-owner') },
          app: { connectionString: postgres.appConnectionString('storage-default-app') },
          reader: { connectionString: postgres.connectionString('storage-default-reader') },
        },
        migrations: { enabled: true },
      }),
    ],
  }).compile();
  const admin = await postgres.connectAsAdmin();
  try {
    await moduleRef.init();
    await postgres.ensureRoleLogin('stynx_app');
    for (const name of [
      '0001_offline_sync.sql',
      '0002_durable_sync.sql',
      '0003_reservation_idempotency.sql',
      '0004_pending_state_and_conflict_actions.sql',
      '0005_initial_queue_status.sql',
      '0006_nullable_active_reservations.sql',
      '0007_range_administration.sql',
      '0008_import_receipts.sql',
    ]) {
      await admin.query('begin');
      await admin.query(await readFile(resolve(__dirname, '../../migrations', name), 'utf8'));
      await admin.query('commit');
    }
    // Forward installation plus the explicit ownership/policy binding projection,
    // independently from the fresh-rendered objectsSql path exercised above.
    await admin.query(renderOfflineStorage().roleBindingsSql);
    const tenant = randomUUID(),
      range = randomUUID();
    await admin.query(
      "insert into tenancy.tenants(id,slug,name) values($1,'offline-storage-default','Offline storage default')",
      [tenant],
    );
    await admin.query(
      "insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,created_at,updated_at) values($1,$2,'org','record','A',1,10,1,'active','2020-01-02T03:04:05.123456Z','2020-01-02T03:04:05.123456Z')",
      [range, tenant],
    );
    const snapshot = async () =>
      (
        await admin.query(
          'select to_jsonb(t)::text as row from offline.numbering_ranges t order by id',
        )
      ).rows;
    const before = await snapshot();
    await admin.query('begin read only;set local role stynx_owner');
    const commands: string[] = [];
    const report = await verifyOfflineStorage({
      query: async (text: string, parameters?: readonly unknown[]) => {
        commands.push(text);
        return admin.query(text, parameters === undefined ? undefined : [...parameters]);
      },
    });
    expect(
      report.supported,
      JSON.stringify(report.checks.filter((check) => check.status !== 'pass')),
    ).toBe(true);
    expect(commands.every((command) => /^\s*(?:select|with)\b/iu.test(command))).toBe(true);
    expect(
      (await admin.query("select current_setting('transaction_read_only') as readonly")).rows,
    ).toEqual([{ readonly: 'on' }]);
    await admin.query('rollback');
    expect(await snapshot()).toEqual(before);
  } finally {
    await admin.query('rollback').catch(() => undefined);
    await admin.end();
    await moduleRef.close();
    await postgres.dispose();
  }
});

it('names invalid counters in the second tenant instead of accepting a filtered or empty scan', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    await value.admin.query(
      "insert into offline.numbering_ranges(tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values($1,'org','record','unsafe',1,9007199254740991,1)",
      [value.tenants[1]],
    );
    await value.admin.query('reset role');
    const report = await verify(value);
    expect(report.supported).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'stored-row-invariants',
        status: 'fail',
        actual: expect.arrayContaining([
          expect.objectContaining({
            tenantId: value.tenants[1],
            finding: 'range-safe-counter',
            count: '1',
          }),
        ]),
      }),
    );
  } finally {
    await dispose(value);
  }
});

it('refuses owner-imported range creation evidence that is an object but not the actual initial snapshot', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    await value.admin.query(
      "insert into offline.numbering_ranges(tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,created_by,creation_key,creation_fingerprint,creation_receipt) values($1,'org','record','bad-receipt',1,10,1,'original-actor','original-key',$2,'{}')",
      [value.tenants[0], `sha256:${'1'.repeat(64)}`],
    );
    await value.admin.query('reset role');
    const report = await verify(value);
    expect(report.supported).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: 'stored-row-invariants', status: 'fail' }),
    );
  } finally {
    await dispose(value);
  }
});

it.each([
  { start: 1, supported: false },
  { start: 6, supported: true },
])(
  'protects cancelled reservation consumption while admitting unused tail start=$start',
  async ({ start, supported }) => {
    const value = await fixture();
    try {
      await baseline(value);
      const range = randomUUID(),
        oldReservation = randomUUID(),
        newReservation = randomUUID();
      await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
      await value.admin.query(
        "insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values($1,$2,'org','record','protected-history',1,100,11)",
        [range, value.tenants[0]],
      );
      const reservationSql =
        "insert into offline.numbering_reservations(id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,status,valid_until,reservation_origin) values($1,$2,$3,'org','record','protected-history','agent','device',null,$4,10,$5,$6,clock_timestamp()+interval '1 day','ctg9')";
      await value.admin.query(reservationSql, [
        oldReservation,
        value.tenants[0],
        range,
        1,
        6,
        'cancelled',
      ]);
      await value.admin.query(
        "insert into offline.numbering_consumption(tenant_id,reservation_id,number,status,server_entity_id,finalized_at) values($1,$2,5,'applied','original-server-id',clock_timestamp())",
        [value.tenants[0], oldReservation],
      );
      const before = (
        await value.admin.query(
          'select to_jsonb(t)::text as row from offline.numbering_consumption t',
        )
      ).rows;
      await value.admin.query(reservationSql, [
        newReservation,
        value.tenants[0],
        range,
        start,
        start,
        'reserved',
      ]);
      await value.admin.query('reset role');
      const report = await verify(value);
      expect(
        report.supported,
        JSON.stringify(report.checks.filter((check) => check.status !== 'pass')),
      ).toBe(supported);
      if (!supported)
        expect(report.checks).toContainEqual(
          expect.objectContaining({ id: 'stored-row-invariants', status: 'fail' }),
        );
      expect(
        (
          await value.admin.query(
            'select to_jsonb(t)::text as row from offline.numbering_consumption t',
          )
        ).rows,
      ).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);

it('preserves a tenant schema that is also a default role word', async () => {
  const value = await fixture(false, 'stynx_app');
  try {
    await baseline(value);
    expect(
      (
        await value.admin.query(
          "select n.nspname from pg_constraint k join pg_class r on r.oid=k.confrelid join pg_namespace n on n.oid=r.relnamespace where k.conrelid='offline.numbering_ranges'::regclass and k.contype='f'",
        )
      ).rows,
    ).toEqual([{ nspname: 'stynx_app' }]);
  } finally {
    await dispose(value);
  }
});

for (const corruption of [
  'ctg9-status-disagreement',
  'unsafe-reserved-number',
  'nonfinite-batch-created-at',
]) {
  it(`refuses persisted ${corruption} without relying on a current request to reveal it`, async () => {
    const value = await fixture();
    try {
      await baseline(value);
      const rows = importRecords();
      await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
      const insert = async (relation: string, row: object) => {
        const entries = Object.entries(row).map(([key, item]) =>
          key === 'response_body_base64'
            ? ([
                'response_body_bytes',
                item === null ? null : Buffer.from(item as string, 'base64'),
              ] as const)
            : ([
                key,
                item !== null && typeof item === 'object' ? JSON.stringify(item) : item,
              ] as const),
        );
        await value.admin.query(
          `insert into offline.${value.admin.escapeIdentifier(relation)}(${entries.map(([key]) => value.admin.escapeIdentifier(key)).join(',')}) values(${entries.map((_entry, index) => `$${index + 1}`).join(',')})`,
          entries.map(([, item]) => item),
        );
      };
      if (corruption === 'nonfinite-batch-created-at') {
        const row = {
          ...rows.find((record) => record.kind === 'batches')!.row,
          tenant_id: value.tenants[1],
          status: 'open',
          created_at: 'infinity',
          transport_key: null,
          transport_fingerprint: null,
          declared_keys: [],
        };
        await insert('sync_batches', row);
      } else {
        const queue = {
          ...rows.find((record) => record.kind === 'queueItems')!.row,
          tenant_id: value.tenants[1],
        };
        const receipt = {
          ...rows.find((record) => record.kind === 'receipts')!.row,
          tenant_id: value.tenants[1],
        };
        if (corruption === 'ctg9-status-disagreement') receipt.status = 'pending';
        else queue.reserved_number = '9007199254740993';
        await insert('sync_batches', {
          ...rows.find((record) => record.kind === 'batches')!.row,
          tenant_id: value.tenants[1],
          status: 'open',
          transport_key: null,
          transport_fingerprint: null,
        });
        await insert('sync_queue_items', queue);
        await insert('sync_item_receipts', receipt);
      }
      await value.admin.query('reset role');
      const report = await verify(value);
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ id: 'stored-row-invariants', status: 'fail' }),
      );
    } finally {
      await dispose(value);
    }
  });
}

it('refuses owner-only import custody that has object-shaped but invalid original manifest and receipt', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    await value.admin.query(
      "insert into offline.sync_import_receipts(source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,original_manifest,imported_by,imported_at,receipt) values($1,'system','snapshot',$2,$3,$4,'{}',$5,clock_timestamp(),'{}')",
      [
        fixtureDigest(['system', 'snapshot']),
        fixtureDigest('raw-source'),
        fixtureDigest({}),
        fixtureDigest([]),
        value.options.ownerRole,
      ],
    );
    await value.admin.query('reset role');
    const report = await verify(value);
    expect(report.supported).toBe(false);
    expect(report.checks.some((check) => check.status !== 'pass')).toBe(true);
  } finally {
    await dispose(value);
  }
});

it('accepts independently bound empty-import custody without mutating its receipt or microsecond instant', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    const manifest = importManifest([]);
    const at = '2020-02-29T03:04:56.123456Z';
    const receipt = {
      source: manifest.source,
      manifestSha256: manifest.manifestSha256,
      mappingSha256: fixtureDigest([]),
      importedBy: value.options.ownerRole,
      importedAt: at,
      recordCounts: {
        ranges: 0,
        reservations: 0,
        queueItems: 0,
        conflicts: 0,
        batches: 0,
        transportKeys: 0,
        receipts: 0,
        attempts: 0,
        consumption: 0,
        conflictEvidence: 0,
        conflictActions: 0,
      },
      archives: [],
    };
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    await value.admin.query(
      'insert into offline.sync_import_receipts(source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,original_manifest,imported_by,imported_at,receipt) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        fixtureDigest([manifest.source.system, manifest.source.snapshotId]),
        manifest.source.system,
        manifest.source.snapshotId,
        manifest.source.sha256,
        manifest.manifestSha256,
        receipt.mappingSha256,
        JSON.stringify(manifest),
        value.options.ownerRole,
        at,
        JSON.stringify(receipt),
      ],
    );
    await value.admin.query('reset role');
    const capture = async () =>
      (
        await value.admin.query(
          'select to_jsonb(t)::text as row,to_char(imported_at at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as imported_at from offline.sync_import_receipts t',
        )
      ).rows;
    const before = await capture();
    expect(before).toHaveLength(1);
    expect(before[0].imported_at).toBe(at);
    await baseline(value);
    expect(await capture()).toEqual(before);
  } finally {
    await dispose(value);
  }
});

it('retains persistent normalized scope fences after their reservation population is gone', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    for (const scope of ['[null]', '["real-shift"]'])
      await value.admin.query(
        'insert into offline.numbering_reservation_scopes(tenant_id,device_id,shift_scope,generation) values($1,$2,$3,$4)',
        [value.tenants[0], `old-device-${scope}`, scope, randomUUID()],
      );
    await value.admin.query('reset role');
    const before = (
      await value.admin.query(
        'select to_jsonb(t)::text as row from offline.numbering_reservation_scopes t order by device_id',
      )
    ).rows;
    await baseline(value);
    expect(
      (
        await value.admin.query(
          'select to_jsonb(t)::text as row from offline.numbering_reservation_scopes t order by device_id',
        )
      ).rows,
    ).toEqual(before);
  } finally {
    await dispose(value);
  }
});

it('refuses marked archive custody with matching digests but unsupported ACK bytes and transport identity', async () => {
  const value = await fixture();
  try {
    await baseline(value);
    const body = Buffer.from('{ "notAnAck" : true }\n');
    const batch = {
      ...importRecords().find((record) => record.kind === 'batches')!.row,
      tenant_id: value.tenants[0],
      declared_keys: [],
      transport_key: null,
      transport_fingerprint: null,
      response_status: 201,
      response_body_base64: body.toString('base64'),
      response_headers: { 'content-type': 'application/json' },
    };
    const manifest = importManifest([{ kind: 'batches', row: batch }]);
    const identity = {
      tenant_id: batch.tenant_id,
      device_id: batch.device_id,
      device_batch_id: batch.device_batch_id,
    };
    manifest.archives = [
      {
        batch: identity,
        sourceSha256: manifest.source.sha256,
        mappingSha256: fixtureDigest(manifest.mappings),
        responseStatus: 201,
        responseBodyBase64: batch.response_body_base64,
        responseBodySha256: fixtureBytesDigest(body),
        responseHeaders: batch.response_headers,
        responseHeadersSha256: fixtureDigest(batch.response_headers),
        verificationEvidence: { proof: 'owner-inserted-corrupt-custody' },
      },
    ];
    const boundManifest = rehashManifest(manifest);
    const at = '2020-02-29T03:04:56.123456Z';
    const receipt = {
      source: manifest.source,
      manifestSha256: boundManifest.manifestSha256,
      mappingSha256: fixtureDigest(manifest.mappings),
      importedBy: value.options.ownerRole,
      importedAt: at,
      recordCounts: Object.fromEntries(
        importRecords().map((record) => [record.kind, record.kind === 'batches' ? 1 : 0]),
      ),
      archives: [
        {
          batch: identity,
          verdict: 'verified',
          responseBodySha256: fixtureBytesDigest(body),
          responseHeadersSha256: fixtureDigest(batch.response_headers),
          evidenceId: 'owner-inserted-corrupt-custody',
        },
      ],
    };
    await value.admin.query(`set role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`);
    const entries: [string, unknown][] = Object.entries(batch).map(([key, item]) =>
      key === 'response_body_base64'
        ? ['response_body_bytes', body]
        : [key, item !== null && typeof item === 'object' ? JSON.stringify(item) : item],
    );
    entries.push(['response_body_is_archived', true]);
    entries.find(([key]) => key === 'status')![1] = 'closed';
    await value.admin.query(
      `insert into offline.sync_batches(${entries.map(([key]) => value.admin.escapeIdentifier(key)).join(',')}) values(${entries.map((_entry, index) => `$${index + 1}`).join(',')})`,
      entries.map(([, item]) => item),
    );
    await value.admin.query(
      'insert into offline.sync_import_receipts(source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,original_manifest,imported_by,imported_at,receipt) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        fixtureDigest([manifest.source.system, manifest.source.snapshotId]),
        manifest.source.system,
        manifest.source.snapshotId,
        manifest.source.sha256,
        boundManifest.manifestSha256,
        receipt.mappingSha256,
        JSON.stringify(boundManifest),
        value.options.ownerRole,
        at,
        JSON.stringify(receipt),
      ],
    );
    await value.admin.query('reset role');
    const report = await verify(value);
    expect(report.supported).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: 'stored-row-invariants', status: 'fail' }),
    );
  } finally {
    await dispose(value);
  }
});

it('the actual packed offline CLI renders offline and verifies readonly owner storage, returning nonzero for real drift without leaking secrets', async () => {
  const value = await fixture(false);
  let packed: ReturnType<typeof packedStorageCli> | undefined;
  try {
    packed = packedStorageCli();
    const secret = `private-offline-storage-${randomUUID()}`;
    await value.admin.query(
      `alter role ${value.admin.escapeIdentifier(value.options.ownerRole!)} login password ${value.admin.escapeLiteral(secret)}`,
    );
    const ownerUrl = withPostgresCredentials(
      value.postgres.connectionString('packed-offline-owner'),
      {
        user: value.options.ownerRole!,
        password: secret,
      },
    );
    const environment = { ...process.env, PRIVATE_OWNER_URL: ownerUrl };
    const imported = spawnSync(
      process.execPath,
      [
        '-e',
        'const m=require(process.argv[2]);process.stdout.write(JSON.stringify({idle:m.storageCommandExecution===undefined}));',
        'embedding-host',
        packed.entry,
      ],
      { cwd: packed.directory, env: environment, encoding: 'utf8', timeout: 30000 },
    );
    expect(imported.status, imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout)).toEqual({ idle: true });
    expect(imported.stderr).toBe('');
    const rendered = packed.run(['--render'], environment);
    expect(rendered.status, rendered.stderr).toBe(0);
    expect(JSON.parse(rendered.stdout).binding.appRole).toBe('stynx_app');
    const args = [
      '--owner-role',
      value.options.ownerRole!,
      '--app-role',
      value.options.appRole!,
      '--no-reader',
      '--tenant-schema',
      'auth',
      '--tenant-table',
      'tenants',
      '--tenant-column',
      'tenant_uuid',
      '--database-url-env',
      'PRIVATE_OWNER_URL',
    ];
    const capture = async () =>
      (
        await value.admin.query(
          'select to_jsonb(t)::text as row from offline.sync_import_receipts t',
        )
      ).rows;
    const before = await capture();
    const accepted = packed.run(args, environment);
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout).supported).toBe(true);
    await value.admin.query('alter table offline.sync_batches no force row level security');
    const refused = packed.run(args, environment);
    expect(refused.status, refused.stderr).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      supported: false,
      checks: expect.arrayContaining([expect.objectContaining({ status: 'fail' })]),
    });
    expect(await capture()).toEqual(before);
    const invalid = packed.run(['--render', '--tenant-schema', secret], environment);
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stderr)).toMatchObject({
      supported: false,
      error: 'Offline storage verification refused',
    });
    for (const result of [imported, rendered, accepted, refused, invalid]) {
      expect(result.stdout + result.stderr).not.toContain(secret);
      expect(result.stdout + result.stderr).not.toContain(encodeURIComponent(secret));
      expect(result.stdout + result.stderr).not.toContain(ownerUrl);
    }
  } finally {
    packed?.dispose();
    await dispose(value);
  }
}, 60000);

it.each(['invalid-json', 'wrong-normalization'] as const)(
  'refuses a persisted %s scope fence without deleting it',
  async (corruption) => {
    const value = await fixture();
    try {
      const scope = corruption === 'invalid-json' ? 'not-json' : '["stynx:no-shift"]';
      await value.admin.query(
        'insert into offline.numbering_reservation_scopes(tenant_id,device_id,shift_scope,generation) values($1,$2,$3,$4)',
        [value.tenants[0], 'device', scope, randomUUID()],
      );
      const before = (await value.admin.query('select * from offline.numbering_reservation_scopes'))
        .rows;
      const report = await verify(value);
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: 'stored-row-invariants',
          status: 'fail',
          actual: expect.arrayContaining([
            expect.objectContaining({ finding: 'invalid-scope-fence' }),
          ]),
        }),
      );
      expect(
        (await value.admin.query('select * from offline.numbering_reservation_scopes')).rows,
      ).toEqual(before);
    } finally {
      await dispose(value);
    }
  },
);
