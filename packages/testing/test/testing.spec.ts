import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RequestContext } from '@stynx/core';
import { documents, softDeletable } from '@stynx/data';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  createTestApp,
  createStynxFixtures,
  expectArchiveMirrorExists,
  expectArchiveMirrorInSync,
  expectInArchive,
  expectNotInLive,
  expectRLSIsolated,
  expectROCannotWrite,
  expectRestored,
  expectRestoreConflict,
  expectSoftDeleteBlocked,
  mintTestSession,
  runDoctorForApp,
  withActor,
  withTenant,
} from '../src';

const fixtureSchema = pgSchema('fixture');
const fixtureParents = softDeletable(fixtureSchema.table('parents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

const FIXTURE_MIGRATIONS = [
  `
    create schema if not exists fixture;
    grant usage, create on schema fixture to stynx_owner;
    grant usage on schema fixture to stynx_app;
    grant usage on schema fixture to stynx_reader;

    select data.create_soft_deletable_table($$
      CREATE TABLE fixture.parents (
        id uuid primary key,
        tenant_id uuid not null references tenancy.tenants(id) on delete cascade,
        name text not null,
        created_at timestamptz not null default clock_timestamp(),
        updated_at timestamptz not null default clock_timestamp()
      )
    $$);

    select data.create_soft_deletable_table($$
      CREATE TABLE fixture.children (
        id uuid primary key,
        tenant_id uuid not null references tenancy.tenants(id) on delete cascade,
        parent_id uuid not null references fixture.parents(id) on delete cascade,
        label text not null,
        created_at timestamptz not null default clock_timestamp(),
        updated_at timestamptz not null default clock_timestamp()
      )
    $$);

    select data.register_softdelete_fk('fixture', 'parents', 'fixture', 'children', 'children_parent_id_fkey', 'block');
  `,
];

describe('@stynx/testing', () => {

  it('creates an isolated app, seeds fixtures, and exercises archive-aware matchers', async () => {
    const testApp = await createTestApp({
      migrations: FIXTURE_MIGRATIONS,
    });

    try {
      const fixtures = createStynxFixtures(testApp.adminClient);
      const tenantA = await fixtures.createTenant({ slug: 'tenant-a', name: 'Tenant A' });
      const tenantB = await fixtures.createTenant({ slug: 'tenant-b', name: 'Tenant B' });
      const userA = await fixtures.createUser({ email: 'tenant-a@example.com' });
      const userB = await fixtures.createUser({ email: 'tenant-b@example.com' });
      await fixtures.createMembership({ tenantId: tenantA.id, userId: userA.id });
      await fixtures.createMembership({ tenantId: tenantB.id, userId: userB.id });
      const document = await fixtures.createDocument({ tenantId: tenantA.id, ownerUserId: userA.id });

      await expectArchiveMirrorExists(testApp.database, documents);
      await expectArchiveMirrorInSync(testApp.database, documents);

      await expectRLSIsolated(
        async (tenantId) =>
          withTenant(testApp.requestContextMutator, tenantId, async () =>
            testApp.database.tx(
              async (trx) => trx.query<{ id: string; tenant_id: string }>('select id, tenant_id from storage.documents order by id').then((result) => result.rows),
              { role: 'app', readonly: true, replica: false },
            ),
          ),
        { tenantA: tenantA.id, tenantB: tenantB.id },
      );

      await expectROCannotWrite(() =>
        withTenant(testApp.requestContextMutator, tenantA.id, async () =>
          testApp.database.tx(
            async (trx) => {
              await trx.query(`insert into tenancy.tenant_settings (tenant_id, updated_at) values ($1::uuid, clock_timestamp())`, [tenantA.id]);
            },
            { role: 'reader', readonly: true, replica: true },
          ),
        ),
      );

      await withTenant(testApp.requestContextMutator, tenantA.id, () =>
        withActor(testApp.requestContextMutator, userA.id, async () =>
          testApp.database.tx(async (trx) => {
            await trx.softDelete(documents, document.id);
          }),
          tenantA.id,
        ),
      );

      await expectInArchive(testApp.database, documents, document.id);
      await expectNotInLive(testApp.database, documents, document.id);

      await withTenant(testApp.requestContextMutator, tenantA.id, () =>
        withActor(testApp.requestContextMutator, userA.id, async () =>
          testApp.database.tx(async (trx) => {
            await trx.restoreFromArchive(documents, document.id);
          }),
          tenantA.id,
        ),
      );

      await expectRestored(testApp.database, documents, document.id);
    } finally {
      await testApp.teardown();
    }
  }, 120_000);

  it('exercises restore-conflict and soft-delete-blocked matchers against custom fixture tables', async () => {
    const testApp = await createTestApp({
      migrations: FIXTURE_MIGRATIONS,
    });

    try {
      const fixtures = createStynxFixtures(testApp.adminClient);
      const tenant = await fixtures.createTenant({ slug: 'tenant-conflict', name: 'Tenant Conflict' });
      const user = await fixtures.createUser({ email: 'conflict@example.com' });
      await fixtures.createMembership({ tenantId: tenant.id, userId: user.id });

      const parentId = randomUUID();
      const childId = randomUUID();
      const conflictId = randomUUID();
      const client = await testApp.adminClient();
      try {
        await client.query(
          `
            insert into fixture.parents (id, tenant_id, name, created_at, updated_at)
            values ($1::uuid, $2::uuid, 'parent', clock_timestamp(), clock_timestamp())
          `,
          [parentId, tenant.id],
        );
        await client.query(
          `
            insert into fixture.children (id, tenant_id, parent_id, label, created_at, updated_at)
            values ($1::uuid, $2::uuid, $3::uuid, 'child', clock_timestamp(), clock_timestamp())
          `,
          [childId, tenant.id, parentId],
        );
      } finally {
        await client.end();
      }

      await expectSoftDeleteBlocked(() =>
        withTenant(testApp.requestContextMutator, tenant.id, async () =>
          testApp.database.tx(async (trx) => {
            await trx.softDelete(fixtureParents, parentId);
          }),
        ),
      );

      await withTenant(testApp.requestContextMutator, tenant.id, async () =>
        testApp.database.tx(async (trx) => {
          await trx.query(`delete from fixture.children where id = $1::uuid`, [childId]);
          await trx.query(`delete from fixture.parents where id = $1::uuid`, [parentId]);
        }),
      );

      const admin = await testApp.adminClient();
      try {
        await admin.query(
          `
            insert into storage.documents (
              id, tenant_id, collection, s3_key, filename, mime_type, byte_size, checksum_sha256,
              scan_status, scan_detail, encryption, classification, owner_user_id, created_at, updated_at
            )
            values (
              $1::uuid, $2::uuid, 'invoices', $3, 'conflict.pdf', 'application/pdf', 1, repeat('a', 64),
              'completed', '{}'::jsonb, 'aws:kms', 'internal', $4::uuid, clock_timestamp(), clock_timestamp()
            )
          `,
          [conflictId, tenant.id, `testing/${conflictId}.pdf`, user.id],
        );
      } finally {
        await admin.end();
      }

      await withTenant(testApp.requestContextMutator, tenant.id, async () =>
        testApp.database.tx(async (trx) => {
          await trx.softDelete(documents, conflictId);
        }),
      );

      const restoreConflictClient = await testApp.adminClient();
      try {
        await restoreConflictClient.query(
          `
            insert into storage.documents (
              id, tenant_id, collection, s3_key, filename, mime_type, byte_size, checksum_sha256,
              scan_status, scan_detail, encryption, classification, owner_user_id, created_at, updated_at
            )
            values (
              $1::uuid, $2::uuid, 'invoices', $3, 'conflict.pdf', 'application/pdf', 1, repeat('a', 64),
              'completed', '{}'::jsonb, 'aws:kms', 'internal', $4::uuid, clock_timestamp(), clock_timestamp()
            )
          `,
          [conflictId, tenant.id, `testing/live-${conflictId}.pdf`, user.id],
        );
      } finally {
        await restoreConflictClient.end();
      }

      await expectRestoreConflict(() =>
        withTenant(testApp.requestContextMutator, tenant.id, async () =>
          testApp.database.tx(async (trx) => {
            await trx.restoreFromArchive(documents, conflictId);
          }),
        ),
      );
    } finally {
      await testApp.teardown();
    }
  }, 120_000);

  it('mints a test session only in NODE_ENV=test and runs doctor helper', async () => {
    const session = await mintTestSession({
      userId: randomUUID(),
      tenantId: randomUUID(),
      perms: ['document:read:*'],
    });

    expect(session.token.split('.')).toHaveLength(3);
    expect(session.sid).toEqual(expect.anything());
    expect(session.jwks.keys).toHaveLength(1);

    const doctorRoot = mkdtempSync(resolve(tmpdir(), 'stynx-doctor-fixture-'));
    mkdirSync(resolve(doctorRoot, 'scripts'), { recursive: true });
    writeFileSync(
      resolve(doctorRoot, 'scripts/stynx-doctor.mjs'),
      "console.log('[doctor][ok] fixture'); console.log('[doctor] 1 checks passed'); process.exit(0);\n",
      'utf8',
    );

    const doctor = await runDoctorForApp(doctorRoot);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain('[doctor]');
  });

  it('reads context helpers through the shared request context', async () => {
    const testApp = await createTestApp();
    try {
      await withTenant(testApp.requestContextMutator, '00000000-0000-0000-0000-000000000111', async () => {
        const requestContext = testApp.moduleRef.get(RequestContext);
        expect(requestContext.tenantId).toBe('00000000-0000-0000-0000-000000000111');
      });

      await withActor(testApp.requestContextMutator, '00000000-0000-0000-0000-000000000222', async () => {
        const requestContext = testApp.moduleRef.get(RequestContext);
        expect(requestContext.actorId).toBe('00000000-0000-0000-0000-000000000222');
      });
    } finally {
      await testApp.teardown();
    }
  }, 120_000);
});
