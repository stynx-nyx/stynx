import { Test, type TestingModule } from '@nestjs/testing';
import { RequestContextMutator } from '@stynx/core';
import type { Provider } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Client } from 'pg';
import { Database } from '../../src/database';
import {
  CascadeTooDeepError,
  CascadeTooLargeError,
  RestoreCascadeParentsArchivedError,
  RestoreConflictError,
  SoftDeleteBlockedError,
} from '../../src/errors';
import { StynxDataModule } from '../../src/data.module';
import { makeLiveOnly, softDeletable } from '../../src/table-markers';
import type { StynxDataMetricsSink } from '../../src/tokens';
import { createPostgresTestDatabase } from '../support/postgres';

const demoSchema = pgSchema('demo');

const customer = softDeletable(
  demoSchema.table('customer', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const customerAddress = softDeletable(
  demoSchema.table('customer_address', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    line1: text('line1').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const customerNote = softDeletable(
  demoSchema.table('customer_note', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const invoice = softDeletable(
  demoSchema.table('invoice', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    number: text('number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const invoiceLineItem = softDeletable(
  demoSchema.table('invoice_line_item', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const invoicePayment = softDeletable(
  demoSchema.table('invoice_payment', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    reference: text('reference').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const liveNote = makeLiveOnly(
  demoSchema.table('live_note', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

async function createMigratedModule(
  connectionString: string,
  providers: Provider[] = [],
  metrics?: StynxDataMetricsSink,
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString },
          app: { connectionString },
          reader: { connectionString },
        },
        migrations: {
          enabled: true,
        },
        ...(metrics ? { metrics } : {}),
      }),
    ],
    providers,
  }).compile();

  await moduleRef.init();
  return moduleRef;
}

async function bootstrapDemoSchema(client: Client): Promise<void> {
  await client.query('set role stynx_owner');
  await client.query('create schema demo authorization stynx_owner');
  await client.query('grant usage on schema demo to stynx_app, stynx_reader');
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.customer (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (tenant_id, email)
      )
    $ddl$)
  `);
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.customer_address (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        customer_id uuid NOT NULL REFERENCES demo.customer(id) ON DELETE RESTRICT,
        line1 text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    $ddl$)
  `);
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.customer_note (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        customer_id uuid NULL REFERENCES demo.customer(id) ON DELETE SET NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    $ddl$)
  `);
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.invoice (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        customer_id uuid NOT NULL REFERENCES demo.customer(id) ON DELETE RESTRICT,
        number text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (tenant_id, number)
      )
    $ddl$)
  `);
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.invoice_line_item (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        invoice_id uuid NOT NULL REFERENCES demo.invoice(id) ON DELETE RESTRICT,
        description text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    $ddl$)
  `);
  await client.query(`
    select data.create_soft_deletable_table($ddl$
      CREATE TABLE demo.invoice_payment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
        invoice_id uuid NOT NULL REFERENCES demo.invoice(id) ON DELETE RESTRICT,
        reference text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    $ddl$)
  `);
  await client.query(`
    create table demo.live_note (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenancy.tenants(id),
      body text not null,
      created_at timestamptz not null default clock_timestamp()
    )
  `);
  await client.query(`
    select data.register_softdelete_fk(
      'demo',
      'customer',
      'demo',
      'customer_address',
      'customer_address_customer_id_fkey',
      'cascade'
    )
  `);
  await client.query(`
    select data.register_softdelete_fk(
      'demo',
      'customer',
      'demo',
      'customer_note',
      'customer_note_customer_id_fkey',
      'hide'
    )
  `);
  await client.query(`
    select data.register_softdelete_fk(
      'demo',
      'customer',
      'demo',
      'invoice',
      'invoice_customer_id_fkey',
      'cascade'
    )
  `);
  await client.query(`
    select data.register_softdelete_fk(
      'demo',
      'invoice',
      'demo',
      'invoice_line_item',
      'invoice_line_item_invoice_id_fkey',
      'cascade'
    )
  `);
  await client.query(`
    select data.register_softdelete_fk(
      'demo',
      'invoice',
      'demo',
      'invoice_payment',
      'invoice_payment_invoice_id_fkey',
      'block'
    )
  `);
  await client.query('reset role');
}

async function createTenant(client: Client, tenantId: string, slug: string): Promise<void> {
  await client.query('set role stynx_app');
  await client.query('begin');
  await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
  await client.query(`insert into tenancy.tenants (id, slug, name) values ($1, $2, $3)`, [
    tenantId,
    slug,
    slug,
  ]);
  await client.query('commit');
  await client.query('reset role');
}

async function runAsActor<T>(
  requestContextMutator: RequestContextMutator,
  database: Database,
  tenantId: string,
  actorId: string,
  requestId: string,
  fn: (database: Database) => Promise<T>,
): Promise<T> {
  return requestContextMutator.runWithRequestContext(
    {
      requestId,
      tenantId,
      actorId,
      startedAt: new Date(),
    },
    () => fn(database),
  );
}

async function seedCustomerGraph(
  requestContextMutator: RequestContextMutator,
  database: Database,
  params: {
    tenantId: string;
    actorId: string;
    requestId: string;
    customerId: string;
    email: string;
    addressId?: string;
    noteId?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    lineItemId?: string;
    paymentId?: string;
    liveNoteId?: string;
  },
): Promise<void> {
  await runAsActor(
    requestContextMutator,
    database,
    params.tenantId,
    params.actorId,
    params.requestId,
    async (db) =>
      db.tx(async (trx) => {
        await trx.query(
          `
            insert into demo.customer (id, tenant_id, email, created_at)
            values ($1, $2, $3, clock_timestamp())
          `,
          [params.customerId, params.tenantId, params.email],
        );

        if (params.addressId) {
          await trx.query(
            `
              insert into demo.customer_address (id, tenant_id, customer_id, line1, created_at)
              values ($1, $2, $3, 'Main St', clock_timestamp())
            `,
            [params.addressId, params.tenantId, params.customerId],
          );
        }

        if (params.noteId) {
          await trx.query(
            `
              insert into demo.customer_note (id, tenant_id, customer_id, body, created_at)
              values ($1, $2, $3, 'remember me', clock_timestamp())
            `,
            [params.noteId, params.tenantId, params.customerId],
          );
        }

        if (params.invoiceId) {
          await trx.query(
            `
              insert into demo.invoice (id, tenant_id, customer_id, number, created_at)
              values ($1, $2, $3, $4, clock_timestamp())
            `,
            [params.invoiceId, params.tenantId, params.customerId, params.invoiceNumber ?? 'INV-1'],
          );
        }

        if (params.lineItemId && params.invoiceId) {
          await trx.query(
            `
              insert into demo.invoice_line_item (id, tenant_id, invoice_id, description, created_at)
              values ($1, $2, $3, 'item', clock_timestamp())
            `,
            [params.lineItemId, params.tenantId, params.invoiceId],
          );
        }

        if (params.paymentId && params.invoiceId) {
          await trx.query(
            `
              insert into demo.invoice_payment (id, tenant_id, invoice_id, reference, created_at)
              values ($1, $2, $3, 'pay-1', clock_timestamp())
            `,
            [params.paymentId, params.tenantId, params.invoiceId],
          );
        }

        if (params.liveNoteId) {
          await trx.query(
            `
              insert into demo.live_note (id, tenant_id, body, created_at)
              values ($1, $2, 'live note', clock_timestamp())
            `,
            [params.liveNoteId, params.tenantId],
          );
        }
      }),
  );
}

describe('Transaction soft delete operations', () => {
  jest.setTimeout(120_000);

  it('dry-run and cascade limits do not mutate state', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_soft_delete_limits');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-soft-delete-limits'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const actorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const customerId = '11111111-1111-1111-1111-111111111111';
      const addressId = '22222222-2222-2222-2222-222222222222';
      const noteId = '33333333-3333-3333-3333-333333333333';
      const invoiceId = '44444444-4444-4444-4444-444444444444';
      const lineItemId = '55555555-5555-5555-5555-555555555555';

      await createTenant(adminClient, tenantId, 'tenant-soft-delete-limits');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-limits',
        customerId,
        email: 'limits@example.com',
        addressId,
        noteId,
        invoiceId,
        invoiceNumber: 'INV-LIMITS',
        lineItemId,
      });

      const before = await adminClient.query<{
        live_customers: string;
        live_addresses: string;
        live_notes: string;
        live_invoices: string;
        live_line_items: string;
        archived_customers: string;
      }>(`
        select
          (select count(*)::text from demo.customer) as live_customers,
          (select count(*)::text from demo.customer_address) as live_addresses,
          (select count(*)::text from demo.customer_note) as live_notes,
          (select count(*)::text from demo.invoice) as live_invoices,
          (select count(*)::text from demo.invoice_line_item) as live_line_items,
          (select count(*)::text from archive.demo_customer) as archived_customers
      `);

      const plan = await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-dry-run',
        (db) => db.tx((trx) => trx.softDelete(customer, customerId, { dryRun: true })),
      );

      expect(plan.totalRows).toBe(4);
      expect(plan.withinLimits).toBe(true);

      await expect(
        runAsActor(
          requestContextMutator,
          database,
          tenantId,
          actorId,
          'req-too-large',
          (db) => db.tx((trx) => trx.softDelete(customer, customerId, { maxCascadeRows: 3 })),
        ),
      ).rejects.toBeInstanceOf(CascadeTooLargeError);

      await expect(
        runAsActor(
          requestContextMutator,
          database,
          tenantId,
          actorId,
          'req-too-deep',
          (db) => db.tx((trx) => trx.softDelete(customer, customerId, { maxCascadeDepth: 1 })),
        ),
      ).rejects.toBeInstanceOf(CascadeTooDeepError);

      const after = await adminClient.query<{
        live_customers: string;
        live_addresses: string;
        live_notes: string;
        live_invoices: string;
        live_line_items: string;
        archived_customers: string;
      }>(`
        select
          (select count(*)::text from demo.customer) as live_customers,
          (select count(*)::text from demo.customer_address) as live_addresses,
          (select count(*)::text from demo.customer_note) as live_notes,
          (select count(*)::text from demo.invoice) as live_invoices,
          (select count(*)::text from demo.invoice_line_item) as live_line_items,
          (select count(*)::text from archive.demo_customer) as archived_customers
      `);

      expect(after.rows[0]).toEqual(before.rows[0]);
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('archives cascade families, preserves deleted_at, and applies hide semantics', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_soft_delete_cascade');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-soft-delete-cascade'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
      const actorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba';
      const customerId = '11111111-1111-1111-1111-111111111112';
      const addressId = '22222222-2222-2222-2222-222222222223';
      const noteId = '33333333-3333-3333-3333-333333333334';
      const invoiceId = '44444444-4444-4444-4444-444444444445';
      const lineItemId = '55555555-5555-5555-5555-555555555556';

      await createTenant(adminClient, tenantId, 'tenant-soft-delete-cascade');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-cascade',
        customerId,
        email: 'cascade@example.com',
        addressId,
        noteId,
        invoiceId,
        invoiceNumber: 'INV-CASCADE',
        lineItemId,
      });

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-soft-delete',
        (db) => db.tx((trx) => trx.softDelete(customer, customerId)),
      );

      const deletedRows = await adminClient.query<{
        customer_deleted_at: string;
        address_deleted_at: string;
        invoice_deleted_at: string;
        line_item_deleted_at: string;
        note_customer_id: string | null;
      }>(`
        select
          (select deleted_at::text from archive.demo_customer where id = '${customerId}') as customer_deleted_at,
          (select deleted_at::text from archive.demo_customer_address where id = '${addressId}') as address_deleted_at,
          (select deleted_at::text from archive.demo_invoice where id = '${invoiceId}') as invoice_deleted_at,
          (select deleted_at::text from archive.demo_invoice_line_item where id = '${lineItemId}') as line_item_deleted_at,
          (select customer_id::text from demo.customer_note where id = '${noteId}') as note_customer_id
      `);

      expect(deletedRows.rows[0]?.customer_deleted_at).toBeTruthy();
      expect(deletedRows.rows[0]?.address_deleted_at).toBe(deletedRows.rows[0]?.customer_deleted_at);
      expect(deletedRows.rows[0]?.invoice_deleted_at).toBe(deletedRows.rows[0]?.customer_deleted_at);
      expect(deletedRows.rows[0]?.line_item_deleted_at).toBe(deletedRows.rows[0]?.customer_deleted_at);
      expect(deletedRows.rows[0]?.note_customer_id).toBeNull();
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('keeps live queries default-only, exposes explicit archive helpers, and respects tenant RLS', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_query_helpers');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-data-query-helpers'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaba';
      const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const actorId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const deletedCustomerA = '11111111-1111-1111-1111-111111111211';
      const liveCustomerA = '22222222-2222-2222-2222-222222222322';
      const deletedCustomerB = '33333333-3333-3333-3333-333333333433';

      await createTenant(adminClient, tenantA, 'tenant-query-a');
      await createTenant(adminClient, tenantB, 'tenant-query-b');

      await seedCustomerGraph(requestContextMutator, database, {
        tenantId: tenantA,
        actorId,
        requestId: 'req-query-a-deleted',
        customerId: deletedCustomerA,
        email: 'deleted-a@example.com',
      });
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId: tenantA,
        actorId,
        requestId: 'req-query-a-live',
        customerId: liveCustomerA,
        email: 'live-a@example.com',
      });
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId: tenantB,
        actorId,
        requestId: 'req-query-b-deleted',
        customerId: deletedCustomerB,
        email: 'deleted-b@example.com',
      });

      await adminClient.query(`update demo.customer set created_at = '2024-01-01T00:00:00Z' where id = $1`, [
        deletedCustomerA,
      ]);
      await adminClient.query(`update demo.customer set created_at = '2024-01-02T00:00:00Z' where id = $1`, [
        liveCustomerA,
      ]);
      await adminClient.query(`update demo.customer set created_at = '2024-01-03T00:00:00Z' where id = $1`, [
        deletedCustomerB,
      ]);

      await runAsActor(requestContextMutator, database, tenantA, actorId, 'req-query-soft-delete-a', (db) =>
        db.tx((trx) => trx.softDelete(customer, deletedCustomerA)),
      );
      await runAsActor(requestContextMutator, database, tenantB, actorId, 'req-query-soft-delete-b', (db) =>
        db.tx((trx) => trx.softDelete(customer, deletedCustomerB)),
      );

      const liveRows = await runAsActor(requestContextMutator, database, tenantA, actorId, 'req-query-live', (db) =>
        db.tx((trx) => trx.select().from(customer).orderBy(desc(customer.createdAt))),
      );
      expect(liveRows.map((row) => row.id)).toEqual([liveCustomerA]);

      const withDeletedRows = await runAsActor(
        requestContextMutator,
        database,
        tenantA,
        actorId,
        'req-query-with-deleted',
        (db) => db.tx((trx) => trx.select().from(customer).withDeleted().orderBy(desc(customer.createdAt))),
      );

      expect(withDeletedRows.map((row) => row.id)).toEqual([liveCustomerA, deletedCustomerA]);
      expect(withDeletedRows[0]?.deletedAt).toBeNull();
      expect(withDeletedRows[1]?.archiveId).toBeGreaterThan(0n);
      expect(withDeletedRows[1]?.deletedAt).toBeInstanceOf(Date);

      const onlyDeletedRows = await runAsActor(
        requestContextMutator,
        database,
        tenantA,
        actorId,
        'req-query-only-deleted',
        (db) => db.tx((trx) => trx.select().from(customer).onlyDeleted()),
      );

      expect(onlyDeletedRows).toHaveLength(1);
      expect(onlyDeletedRows[0]?.id).toBe(deletedCustomerA);
      expect(onlyDeletedRows[0]?.deletedBy).toBe(actorId);
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('orders onlyDeleted by deleted_at desc by default', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_only_deleted');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-data-only-deleted'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaabc';
      const actorId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
      const firstCustomer = '44444444-4444-4444-4444-444444444544';
      const secondCustomer = '55555555-5555-5555-5555-555555555655';

      await createTenant(adminClient, tenantId, 'tenant-only-deleted');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-only-deleted-1',
        customerId: firstCustomer,
        email: 'first@example.com',
      });
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-only-deleted-2',
        customerId: secondCustomer,
        email: 'second@example.com',
      });

      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-only-deleted-soft-1', (db) =>
        db.tx((trx) => trx.softDelete(customer, firstCustomer)),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-only-deleted-soft-2', (db) =>
        db.tx((trx) => trx.softDelete(customer, secondCustomer)),
      );

      const trash = await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-only-deleted-read',
        (db) => db.tx((trx) => trx.select().from(customer).onlyDeleted()),
      );

      expect(trash.map((row) => row.id)).toEqual([secondCustomer, firstCustomer]);
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('restores archived parents when cascade is requested and detects restore conflicts', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_soft_delete_restore');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-soft-delete-restore'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });

      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';
      const actorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc';
      const customerId = '11111111-1111-1111-1111-111111111113';
      const addressId = '22222222-2222-2222-2222-222222222224';
      const invoiceId = '44444444-4444-4444-4444-444444444446';
      const lineItemId = '55555555-5555-5555-5555-555555555557';

      await createTenant(adminClient, tenantId, 'tenant-soft-delete-restore');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-restore',
        customerId,
        email: 'restore@example.com',
        addressId,
        invoiceId,
        invoiceNumber: 'INV-RESTORE',
        lineItemId,
      });

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-soft-delete-restore-parent',
        (db) => db.tx((trx) => trx.softDelete(customer, customerId)),
      );

      await expect(
        runAsActor(
          requestContextMutator,
          database,
          tenantId,
          actorId,
          'req-restore-without-cascade',
          (db) => db.tx((trx) => trx.restoreFromArchive(invoiceLineItem, lineItemId)),
        ),
      ).rejects.toBeInstanceOf(RestoreCascadeParentsArchivedError);

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-restore-with-cascade',
        (db) => db.tx((trx) => trx.restoreFromArchive(invoiceLineItem, lineItemId, { cascade: true })),
      );

      const restoredCounts = await adminClient.query<{
        live_customers: string;
        live_invoices: string;
        live_line_items: string;
      }>(`
        select
          (select count(*)::text from demo.customer where id = '${customerId}') as live_customers,
          (select count(*)::text from demo.invoice where id = '${invoiceId}') as live_invoices,
          (select count(*)::text from demo.invoice_line_item where id = '${lineItemId}') as live_line_items
      `);

      expect(restoredCounts.rows[0]).toEqual({
        live_customers: '1',
        live_invoices: '1',
        live_line_items: '1',
      });

      const conflictCustomerId = '11111111-1111-1111-1111-111111111114';
      const replacementCustomerId = '11111111-1111-1111-1111-111111111115';
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-conflict',
        customerId: conflictCustomerId,
        email: 'conflict@example.com',
      });

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-soft-delete-conflict',
        (db) => db.tx((trx) => trx.softDelete(customer, conflictCustomerId)),
      );

      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-replacement',
        customerId: replacementCustomerId,
        email: 'conflict@example.com',
      });

      await expect(
        runAsActor(
          requestContextMutator,
          database,
          tenantId,
          actorId,
          'req-restore-conflict',
          (db) => db.tx((trx) => trx.restoreFromArchive(customer, conflictCustomerId)),
        ),
      ).rejects.toBeInstanceOf(RestoreConflictError);
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('raises a structured blocked error and supports hard delete on live and archive rows', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_soft_delete_block');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-soft-delete-block'));
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad';
      const actorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd';
      const customerId = '11111111-1111-1111-1111-111111111116';
      const invoiceId = '44444444-4444-4444-4444-444444444447';
      const paymentId = '66666666-6666-6666-6666-666666666668';
      const liveNoteId = '77777777-7777-7777-7777-777777777779';

      await createTenant(adminClient, tenantId, 'tenant-soft-delete-block');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-block',
        customerId,
        email: 'block@example.com',
        invoiceId,
        invoiceNumber: 'INV-BLOCK',
        paymentId,
        liveNoteId,
      });

      await expect(
        runAsActor(
          requestContextMutator,
          database,
          tenantId,
          actorId,
          'req-soft-delete-block',
          (db) => db.tx((trx) => trx.softDelete(invoice, invoiceId)),
        ),
      ).rejects.toMatchObject<SoftDeleteBlockedError>({
        context: expect.objectContaining({
          parent: { schema: 'demo', table: 'invoice', id: invoiceId },
          blockingChildren: expect.arrayContaining([
            expect.objectContaining({
              schema: 'demo',
              table: 'invoice_payment',
              count: 1,
              sampleIds: [paymentId],
            }),
          ]),
        }),
      });

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-hard-delete-live',
        (db) =>
          db.tx((trx) =>
            trx.hardDelete(liveNote, liveNoteId, {
              confirm: 'I understand this is irrecoverable',
            })),
      );

      const liveNoteCount = await adminClient.query<{ count: string }>(
        `select count(*)::text as count from demo.live_note where id = '${liveNoteId}'`,
      );
      expect(liveNoteCount.rows[0]?.count).toBe('0');

      const archiveCustomerId = '11111111-1111-1111-1111-111111111117';
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-seed-archive-hard-delete',
        customerId: archiveCustomerId,
        email: 'archive-hard-delete@example.com',
      });

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-soft-delete-archive-target',
        (db) => db.tx((trx) => trx.softDelete(customer, archiveCustomerId)),
      );

      const archiveRow = await adminClient.query<{ archive_id: string }>(
        `select archive_id::text as archive_id from archive.demo_customer where id = '${archiveCustomerId}'`,
      );

      await runAsActor(
        requestContextMutator,
        database,
        tenantId,
        actorId,
        'req-hard-delete-archive',
        (db) =>
          db.tx((trx) =>
            trx.hardDeleteFromArchive(BigInt(archiveRow.rows[0]?.archive_id ?? '0'), {
              archiveTable: 'archive.demo_customer',
              confirm: 'I understand this is irrecoverable',
            })),
      );

      const archiveCount = await adminClient.query<{ count: string }>(
        `select count(*)::text as count from archive.demo_customer where id = '${archiveCustomerId}'`,
      );
      expect(archiveCount.rows[0]?.count).toBe('0');
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('emits Prompt 10 metrics hooks for soft delete, restore, hard delete, and archive size', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_metrics');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    const metricsEvents: {
      softDelete: string[];
      restore: string[];
      hardDelete: string[];
      archiveSize: Array<{ table: string; bytes: number }>;
    } = {
      softDelete: [],
      restore: [],
      hardDelete: [],
      archiveSize: [],
    };

    const metricsSink: StynxDataMetricsSink = {
      incrementSoftDelete(table: string): void {
        metricsEvents.softDelete.push(table);
      },
      incrementHardDelete(table: string): void {
        metricsEvents.hardDelete.push(table);
      },
      incrementRestore(table: string): void {
        metricsEvents.restore.push(table);
      },
      setArchiveSizeBytes(table: string, bytes: number): void {
        metricsEvents.archiveSize.push({ table, bytes });
      },
    };

    try {
      moduleRef = await createMigratedModule(
        testDatabase.connectionString('stynx-data-metrics'),
        [],
        metricsSink,
      );
      adminClient = await testDatabase.connectAsAdmin();
      await bootstrapDemoSchema(adminClient);

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });
      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaabd';
      const actorId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      const customerId = '66666666-6666-6666-6666-666666666766';
      const liveNoteId = '77777777-7777-7777-7777-777777777877';

      await createTenant(adminClient, tenantId, 'tenant-metrics');
      await seedCustomerGraph(requestContextMutator, database, {
        tenantId,
        actorId,
        requestId: 'req-metrics-seed',
        customerId,
        email: 'metrics@example.com',
        liveNoteId,
      });

      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-metrics-soft-1', (db) =>
        db.tx((trx) => trx.softDelete(customer, customerId)),
      );
      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-metrics-restore', (db) =>
        db.tx((trx) => trx.restoreFromArchive(customer, customerId)),
      );
      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-metrics-soft-2', (db) =>
        db.tx((trx) => trx.softDelete(customer, customerId)),
      );

      const archiveRow = await adminClient.query<{ archive_id: string }>(
        `select archive_id::text as archive_id from archive.demo_customer where id = $1`,
        [customerId],
      );

      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-metrics-hard-archive', (db) =>
        db.tx((trx) =>
          trx.hardDeleteFromArchive(BigInt(archiveRow.rows[0]?.archive_id ?? '0'), {
            confirm: 'I understand this is irrecoverable',
            archiveTable: 'archive.demo_customer',
          })),
      );
      await runAsActor(requestContextMutator, database, tenantId, actorId, 'req-metrics-hard-live', (db) =>
        db.tx((trx) =>
          trx.hardDelete(liveNote, liveNoteId, {
            confirm: 'I understand this is irrecoverable',
          })),
      );

      expect(metricsEvents.softDelete).toEqual(['demo.customer', 'demo.customer']);
      expect(metricsEvents.restore).toEqual(['demo.customer']);
      expect(metricsEvents.hardDelete).toEqual(expect.arrayContaining(['archive.demo_customer', 'demo.live_note']));
      expect(metricsEvents.archiveSize.filter((item) => item.table === 'demo.customer')).toHaveLength(4);
      expect(metricsEvents.archiveSize.every((item) => Number.isFinite(item.bytes))).toBe(true);
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });
});
