import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { generateRequestId, RequestContextMutator } from '@stynx/core';
import { Database, StynxDataModule } from '@stynx/data';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { StynxAuditService } from '../../src/audit.service';
import { StynxAuditModule } from '../../src/audit.module';
import { findAuditRows } from '../../src/test-helpers';

async function bootstrapSchema(client: Client): Promise<void> {
  await client.query('create schema demo');
  await client.query('grant usage on schema demo to stynx_app, stynx_reader');
  await client.query(`
    create table demo.items (
      id uuid primary key,
      tenant_id uuid not null references tenancy.tenants(id),
      label text not null
    )
  `);
  await client.query(`
    create table archive.demo_items (
      archive_id bigserial primary key,
      id uuid not null,
      tenant_id uuid not null references tenancy.tenants(id),
      label text not null,
      archived_at timestamptz not null default clock_timestamp(),
      deleted_at timestamptz not null,
      deleted_by uuid,
      last_erasure_at timestamptz
    )
  `);
  await client.query(`select audit.enable_for('demo.items'::regclass)`);
  await client.query(`select audit.enable_for('archive.demo_items'::regclass)`);
}

async function seedTenant(client: Client, tenantId: string): Promise<void> {
  await client.query(
    `
      insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
      values ($1::uuid, $2, $3, true, clock_timestamp(), clock_timestamp())
    `,
    [tenantId, `tenant-${tenantId.slice(0, 8)}`, `Tenant ${tenantId.slice(0, 8)}`],
  );
}

describe('StynxAuditModule integration', () => {
  let database: PostgresTestDatabase;
  let databaseRef: Database;
  let auditService: StynxAuditService;
  let requestContextMutator: RequestContextMutator;

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_audit');
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx/audit:owner') },
            app: { connectionString: database.connectionString('@stynx/audit:app') },
            reader: { connectionString: database.connectionString('@stynx/audit:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxAuditModule.forRoot({
          keyPrefix: 'audit',
        }),
      ],
    }).compile();
    await moduleRef.init();

    databaseRef = moduleRef.get(Database);
    auditService = moduleRef.get(StynxAuditService);
    requestContextMutator = moduleRef.get(RequestContextMutator);

    const admin = await database.connectAsAdmin();
    try {
      await bootstrapSchema(admin);
      await seedTenant(admin, '0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await database.dispose();
  });

  async function runWithRequestContext<T>(tenantId: string, actorId: string, fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        fn,
      ),
    );
  }

  it('writes one soft-delete row for the live delete and no archive insert row', async () => {
    const id = randomUUID();
    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', randomUUID(), () =>
      databaseRef.tx(async (trx) => {
        await trx.query(`select set_config('app.tenant_id', $1, true)`, ['0197481e-6f84-77e4-8d6d-41f0b6fca9c1']);
        await trx.query(`select set_config('app.actor_id', $1, true)`, [randomUUID()]);
        await trx.query(`insert into demo.items (id, tenant_id, label) values ($1::uuid, $2::uuid, $3)`, [
          id,
          '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
          'alpha',
        ]);
        await trx.query(`select set_config('app.archive_move', 'in_progress', true)`);
        await trx.query(`select set_config('app.archive_reason', 'soft_delete', true)`);
        await trx.query(
          `
            insert into archive.demo_items (id, tenant_id, label, deleted_at, deleted_by)
            select id, tenant_id, label, clock_timestamp(), current_setting('app.actor_id', true)::uuid
            from demo.items
            where id = $1::uuid
          `,
          [id],
        );
        await trx.query(`delete from demo.items where id = $1::uuid`, [id]);

        const rows = await findAuditRows(trx, {
          tableSchema: 'demo',
          tableName: 'items',
          rowId: id,
          operation: 'DELETE',
          tags: { soft_delete: true, archived: true },
        });
        expect(rows).toHaveLength(1);

        const archiveRows = await findAuditRows(trx, {
          tableSchema: 'archive',
          tableName: 'demo_items',
          rowId: id,
          operation: 'INSERT',
        });
        expect(archiveRows).toHaveLength(0);
      }),
    );
  });

  it('writes one restore row for the live insert and no archive delete row', async () => {
    const id = randomUUID();
    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', randomUUID(), () =>
      databaseRef.tx(async (trx) => {
        await trx.query(`select set_config('app.tenant_id', $1, true)`, ['0197481e-6f84-77e4-8d6d-41f0b6fca9c1']);
        await trx.query(`select set_config('app.actor_id', $1, true)`, [randomUUID()]);
        await trx.query(
          `
            insert into archive.demo_items (id, tenant_id, label, deleted_at)
            values ($1::uuid, $2::uuid, $3, clock_timestamp())
          `,
          [id, '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'beta'],
        );
        await trx.query(`select set_config('app.archive_move', 'in_progress', true)`);
        await trx.query(`select set_config('app.archive_reason', 'restore', true)`);
        await trx.query(
          `
            insert into demo.items (id, tenant_id, label)
            select id, tenant_id, label
            from archive.demo_items
            where id = $1::uuid
          `,
          [id],
        );
        await trx.query(`delete from archive.demo_items where id = $1::uuid`, [id]);

        const rows = await findAuditRows(trx, {
          tableSchema: 'demo',
          tableName: 'items',
          rowId: id,
          operation: 'INSERT',
          tags: { restore: true, from_archive: true },
        });
        expect(rows).toHaveLength(1);

        const archiveRows = await findAuditRows(trx, {
          tableSchema: 'archive',
          tableName: 'demo_items',
          rowId: id,
          operation: 'DELETE',
        });
        expect(archiveRows).toHaveLength(0);
      }),
    );
  });

  it('tags archive-side erasure updates as lgpd erasure', async () => {
    const id = randomUUID();
    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', randomUUID(), () =>
      databaseRef.tx(async (trx) => {
        await trx.query(
          `
            insert into archive.demo_items (id, tenant_id, label, deleted_at)
            values ($1::uuid, $2::uuid, $3, clock_timestamp())
          `,
          [id, '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'gamma'],
        );
        await trx.query(`select set_config('app.erasure_strategy', 'nullify', true)`);
        await trx.query(
          `
            update archive.demo_items
            set label = '[redacted]',
                last_erasure_at = clock_timestamp()
            where id = $1::uuid
          `,
          [id],
        );

        const rows = await findAuditRows(trx, {
          tableSchema: 'archive',
          tableName: 'demo_items',
          rowId: id,
          operation: 'UPDATE',
          tags: { lgpd_erasure: true, strategy: 'nullify' },
        });
        expect(rows).toHaveLength(1);
      }),
    );
  });

  it('retains lgpd partitions longer in detach dry-run', async () => {
    const admin = await database.connectAsAdmin();
    try {
      await admin.query(`
        create table if not exists audit.log_2022_01
        partition of audit.log
        for values from ('2022-01-01') to ('2022-02-01')
      `);
      await admin.query(`
        create table if not exists audit.log_2025_01
        partition of audit.log
        for values from ('2025-01-01') to ('2025-02-01')
      `);
      await admin.query('grant select on table audit.log_2022_01, audit.log_2025_01 to stynx_owner, stynx_app, stynx_reader');
      await admin.query(
        `
          insert into audit.log (
            occurred_at, table_schema, table_name, row_id, operation, tags, payload
          ) values
            ('2022-01-15T00:00:00.000Z', 'archive', 'demo_items', 'lgpd-1', 'UPDATE', '{"lgpd_erasure": true}', '{}'::jsonb),
            ('2025-01-15T00:00:00.000Z', 'demo', 'items', 'std-1', 'DELETE', '{"hard_delete": true}', '{}'::jsonb)
        `,
      );
    } finally {
      await admin.end();
    }

    const plans = await auditService.dryRunDetachEligible(new Date('2026-04-24T00:00:00.000Z'));
    expect(plans.map((plan) => plan.partitionName)).toContain('log_2025_01');
    expect(plans.map((plan) => plan.partitionName)).not.toContain('log_2022_01');
  });
});
