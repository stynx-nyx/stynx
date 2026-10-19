import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  Database,
  StynxDataModule,
  StynxPoolRegistry,
  type StorageVerificationReport,
} from '@stynx-nyx/data';
import { Client } from 'pg';
import { renderOutboxStorage, verifyOutboxStorage } from '../../src/index.js';
import { StynxOutboxModule } from '../../src/outbox.module.js';
import { OutboxService } from '../../src/outbox.service.js';
import { OutboxEventStreamSource } from '../../src/event-stream-source.js';
import { packedStorageCli } from '../support/packed-storage-cli.js';
import {
  createPostgresTestDatabase,
  withPostgresCredentials,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';

const ACTOR = 'f3333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: string) =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

interface Fixture {
  postgres: PostgresTestDatabase;
  admin: Client;
  moduleRef: TestingModule;
  database: Database;
  outbox: OutboxService;
  options: NonNullable<Parameters<typeof renderOutboxStorage>[0]>;
  roles: string[];
  tenants: [string, string];
}

async function createFixture(): Promise<Fixture> {
  const postgres = await createPostgresTestDatabase('stynx_obx_consumer', { useTemplate: false });
  const admin = await postgres.connectAsAdmin();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  // A confined fresh-cluster validation sets the exact DETRAN role name. Normal
  // parallel integration runs own unique roles and never alter another fixture.
  const appRole = process.env.STYNX_TEST_STORAGE_APP_ROLE ?? `role_app_backend_${suffix}`;
  const ownerRole = `consumer_owner_${suffix}`;
  const readerRole = `consumer_reader_${suffix}`;
  const roles: string[] = [];
  const options = {
    ownerRole,
    appRole,
    readerRole,
    tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
  };
  const tenants: [string, string] = [randomUUID(), randomUUID()];
  let moduleRef: TestingModule | undefined;
  try {
    await admin.query(
      `create role ${admin.escapeIdentifier(ownerRole)} nosuperuser bypassrls noinherit`,
    );
    roles.push(ownerRole);
    await admin.query(
      `create role ${admin.escapeIdentifier(appRole)} login nosuperuser nobypassrls noinherit`,
    );
    roles.push(appRole);
    await admin.query(
      `create role ${admin.escapeIdentifier(readerRole)} nosuperuser nobypassrls noinherit`,
    );
    roles.push(readerRole);
    await postgres.ensureRoleLogin(appRole);
    await admin.query(
      `grant connect,create on database ${admin.escapeIdentifier(postgres.database)} to ${admin.escapeIdentifier(ownerRole)}`,
    );
    await admin.query(
      `grant connect on database ${admin.escapeIdentifier(postgres.database)} to ${admin.escapeIdentifier(appRole)},${admin.escapeIdentifier(readerRole)}`,
    );
    await admin.query(`set role ${admin.escapeIdentifier(ownerRole)}`);
    await admin.query(
      'create schema auth; create table auth.tenants(tenant_uuid uuid primary key)',
    );
    await admin.query('insert into auth.tenants(tenant_uuid) values ($1),($2)', tenants);
    const artifact = renderOutboxStorage(options);
    await admin.query(artifact.objectsSql);
    await admin.query(artifact.roleBindingsSql);
    await admin.query('reset role');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          appRoleName: appRole,
          retry: false,
          connections: {
            owner: {
              connectionString: asRole(postgres.connectionString('consumer-owner'), ownerRole),
            },
            app: { connectionString: postgres.appConnectionString('consumer-app', appRole) },
            reader: {
              connectionString: asRole(postgres.connectionString('consumer-reader'), readerRole),
            },
          },
        }),
        StynxOutboxModule.forRoot({
          storageMode: 'consumer-owned',
          dispatcher: {
            send: async () => undefined,
            sendEvent: async (row) => ({
              provider: 'consumer-proof',
              requestBytes: Buffer.from(row.id),
              responseStatus: 202,
            }),
          },
        }),
      ],
    }).compile();
    await moduleRef.init();
    return {
      postgres,
      admin,
      moduleRef,
      options,
      roles,
      tenants,
      database: moduleRef.get(Database),
      outbox: moduleRef.get(OutboxService),
    };
  } catch (error) {
    await moduleRef?.close();
    await admin.query('reset role').catch(() => undefined);
    for (const role of roles) {
      await admin
        .query(`drop owned by ${admin.escapeIdentifier(role)} cascade`)
        .catch(() => undefined);
      await admin
        .query(`drop role if exists ${admin.escapeIdentifier(role)}`)
        .catch(() => undefined);
    }
    await admin.end();
    await postgres.dispose();
    throw error;
  }
}

async function dispose(fixture: Fixture): Promise<void> {
  await fixture.moduleRef.close();
  await fixture.admin.query('reset role');
  // These roles were created by this fixture. CASCADE also removes dependencies
  // in the intentional application-ownership drift witness. Process roles one
  // at a time so PostgreSQL does not visit shared default ACLs twice.
  for (const role of fixture.roles) {
    await fixture.admin.query(`drop owned by ${fixture.admin.escapeIdentifier(role)} cascade`);
    await fixture.admin.query(`drop role ${fixture.admin.escapeIdentifier(role)}`);
  }
  await fixture.admin.end();
  await fixture.postgres.dispose();
}

const scope = <T>(fixture: Fixture, tenantId: string, work: () => Promise<T>) =>
  fixture.database.withRequestContext({ tenantId, actorId: ACTOR }, work);
const verify = (fixture: Fixture): Promise<StorageVerificationReport> =>
  fixture.database.withSystemContext('read-only consumer storage conformance', () =>
    fixture.database.tx((trx) => verifyOutboxStorage(trx, fixture.options), {
      role: 'owner',
      readonly: true,
      retry: false,
    }),
  );
async function evidenceSnapshot(fixture: Fixture) {
  const result: Record<string, unknown> = {};
  for (const table of [
    'messages',
    'acknowledgements',
    'legacy_event_map',
    'ack_quarantine',
    'events',
    'event_delivery',
    'event_attempts',
    'event_acks',
    'event_retirements',
    'tenant_clock',
    'legacy_ownership',
  ]) {
    result[table] = (
      await fixture.admin.query(
        `select to_jsonb(t)::text as row from outbox.${table} t order by to_jsonb(t)::text`,
      )
    ).rows;
  }
  result.event_order_seq = (
    await fixture.admin.query('select last_value::text,is_called from outbox.event_order_seq')
  ).rows;
  return result;
}

// ADR-OUTBOX-0003 D2/D3; ADR-OUTBOX-0004 D4. This database deliberately has no
// platform tenancy/audit installation and uses its own tenant UUID column.
describe('independently rendered consumer outbox storage (PostgreSQL)', () => {
  it('supports a direct restricted role, two-tenant append/replay/retirement and data-neutral reapplication', async () => {
    const fixture = await createFixture();
    try {
      const { database, outbox, tenants, admin, options } = fixture;
      const identity = await fixture.moduleRef
        .get(StynxPoolRegistry)
        .pools.app.query(
          'select current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user',
        );
      expect(identity.rows).toEqual([
        {
          current_user: options.appRole,
          session_user: options.appRole,
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
      expect(
        (
          await admin.query(
            `select to_regnamespace('tenancy') as tenancy,to_regnamespace('audit') as audit`,
          )
        ).rows,
      ).toEqual([{ tenancy: null, audit: null }]);
      const fact = {
        entity: 'consumer.fact',
        entityId: randomUUID(),
        idempotencyKey: 'preserved-key',
        payload: { original: true },
      };
      const append = (tenantId: string) =>
        scope(fixture, tenantId, () =>
          database.tx((trx) => outbox.appendInTransaction(trx, fact), {
            role: 'app',
            requireActor: true,
            retry: false,
          }),
        );
      const first = await append(tenants[0]);
      await expect(append(tenants[0])).resolves.toEqual(first);
      const foreign = await append(tenants[1]);
      expect(foreign.id).not.toBe(first.id);
      await expect(
        scope(fixture, tenants[0], () =>
          database.tx(
            (trx) => outbox.appendInTransaction(trx, { ...fact, payload: { original: false } }),
            { role: 'app', requireActor: true, retry: false },
          ),
        ),
      ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_CONFLICT' });
      const receipt = await scope(fixture, tenants[0], () =>
        outbox.retireEvent(first.id, {
          idempotencyKey: 'consumer-retirement',
          reason: 'Destination removed',
        }),
      );
      expect(receipt).toMatchObject({
        tenantId: tenants[0],
        actorId: ACTOR,
        eventId: first.id,
        previousStatus: 'PENDING',
      });
      await expect(
        scope(fixture, tenants[1], () => outbox.getEventRetirement(first.id)),
      ).resolves.toBe(null);
      const source = new OutboxEventStreamSource(database);
      await expect(
        source.findById(first.id, { tenantId: tenants[0], actorId: ACTOR }),
      ).resolves.toMatchObject({ id: first.id });
      await expect(
        source.findById(first.id, { tenantId: tenants[1], actorId: ACTOR }),
      ).resolves.toBe(null);
      const initialReport = await verify(fixture);
      expect(
        initialReport,
        JSON.stringify(
          initialReport.checks.filter((check) => check.status !== 'pass'),
          null,
          2,
        ),
      ).toMatchObject({ supported: true, binding: options });
      expect(initialReport.checks.length).toBeGreaterThan(0);
      expect(initialReport.checks.every((check) => check.status === 'pass')).toBe(true);
      const before = await evidenceSnapshot(fixture);
      await admin.query(`set role ${admin.escapeIdentifier(options.ownerRole!)}`);
      const artifact = renderOutboxStorage(options);
      await admin.query(artifact.objectsSql);
      await admin.query(artifact.roleBindingsSql);
      await admin.query(artifact.objectsSql);
      await admin.query(artifact.roleBindingsSql);
      await admin.query('reset role');
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      const additionalApp = `role_app_additional_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      fixture.roles.push(additionalApp);
      await admin.query(
        `create role ${admin.escapeIdentifier(additionalApp)} login nosuperuser nobypassrls noinherit`,
      );
      await admin.query(
        `grant connect on database ${admin.escapeIdentifier(fixture.postgres.database)} to ${admin.escapeIdentifier(additionalApp)}`,
      );
      await fixture.postgres.ensureRoleLogin(additionalApp);
      const additional = renderOutboxStorage({
        ...options,
        appRole: additionalApp,
        readerRole: null,
      });
      await admin.query(`set role ${admin.escapeIdentifier(options.ownerRole!)}`);
      await admin.query(additional.roleBindingsSql);
      await admin.query('reset role');
      const secondApp = new Client({
        connectionString: fixture.postgres.appConnectionString(
          'additional-consumer-app',
          additionalApp,
        ),
      });
      await secondApp.connect();
      try {
        await secondApp.query('begin');
        await secondApp.query(
          `select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)`,
          [tenants[0], ACTOR],
        );
        expect((await secondApp.query('select id from outbox.events order by id')).rows).toEqual([
          { id: first.id },
        ]);
        await secondApp.query('rollback');
      } finally {
        await secondApp.end();
      }
      await expect(
        scope(fixture, tenants[0], () => outbox.getEventRetirement(first.id)),
      ).resolves.toEqual(receipt);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      await expect(outbox.cutoverLegacyMessages()).rejects.toMatchObject({
        code: 'OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED',
        reason: 'consumer-owned-storage',
      });
      const platform = new OutboxService(database, {});
      await expect(platform.cutoverLegacyMessages()).rejects.toMatchObject({
        code: 'OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED',
        reason: 'audit-chain-unavailable',
      });
      expect(await evidenceSnapshot(fixture)).toEqual(before);
    } finally {
      await dispose(fixture);
    }
  });

  it.each([
    [
      'filtered owner visibility',
      (fixture: Fixture) =>
        fixture.admin.query(
          `alter role ${fixture.admin.escapeIdentifier(fixture.options.ownerRole!)} nobypassrls`,
        ),
    ],
    [
      'sequence restart behind a future cursor',
      async (fixture: Fixture) => {
        const futureMs = Date.now() + 3_600_000;
        await fixture.admin.query(
          `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
          values (outbox.event_uuid($2::bigint,100),$1,'consumer.future','one','future-cursor','{}',to_timestamp($2::numeric/1000))`,
          [fixture.tenants[0], futureMs],
        );
        await fixture.admin.query(
          'insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,$2)',
          [fixture.tenants[0], futureMs],
        );
        await fixture.admin.query('alter sequence outbox.event_order_seq restart with 1');
      },
    ],
    [
      'missing ownership singleton',
      (fixture: Fixture) => fixture.admin.query('delete from outbox.legacy_ownership'),
    ],
    [
      'submillisecond imported event',
      async (fixture: Fixture) => {
        await fixture.admin.query(
          `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
        values ($1,$2,'consumer.bad-clock','one','submillisecond','{}','2026-10-01T12:00:00.123456Z')`,
          [randomUUID(), fixture.tenants[0]],
        );
        await fixture.admin.query(
          `insert into outbox.tenant_clock(tenant_id,last_ms)
        values ($1,floor(extract(epoch from '2026-10-01T12:00:00.123456Z'::timestamptz)*1000)::bigint)`,
          [fixture.tenants[0]],
        );
      },
    ],
    [
      'retired without provenance',
      async (fixture: Fixture) => {
        const eventId = randomUUID();
        await fixture.admin.query(
          `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
        values ($1,$2,'consumer.no-receipt','one','missing-receipt','{}','2026-10-01T12:00:00.123Z')`,
          [eventId, fixture.tenants[0]],
        );
        await fixture.admin.query(
          `insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,1790856000123)`,
          [fixture.tenants[0]],
        );
        await fixture.admin.query(
          `insert into outbox.event_delivery(tenant_id,event_id,status) values ($1,$2,'RETIRED')`,
          [fixture.tenants[0], eventId],
        );
      },
    ],
    [
      'legacy ACK tenant differs from its existing message',
      async (fixture: Fixture) => {
        const messageId = randomUUID();
        await fixture.admin.query(
          `insert into outbox.messages(id,tenant_id,entity,entity_id,payload,idempotency_key)
          values ($1,$2,'legacy.tenant','one','{"original":true}','legacy-tenant-message')`,
          [messageId, fixture.tenants[1]],
        );
        await fixture.admin.query(
          `insert into outbox.acknowledgements(tenant_id,message_id,ack_status,ack_message,ack_time)
          values ($1,$2,'ACKED','preserve actual legacy evidence',clock_timestamp())`,
          [fixture.tenants[0], messageId],
        );
      },
    ],
    ...(['pointer', 'generation', 'delivery'] as const).map(
      (variant) =>
        [
          `legacy ${variant} mapping disagreement`,
          async (fixture: Fixture) => {
            const events = await scope(fixture, fixture.tenants[0], () =>
              fixture.database.tx(
                (trx) =>
                  fixture.outbox.appendManyInTransaction(trx, [
                    {
                      entity: 'legacy.map',
                      entityId: 'one',
                      idempotencyKey: 'map-one',
                      payload: { one: true },
                    },
                    {
                      entity: 'legacy.map',
                      entityId: 'two',
                      idempotencyKey: 'map-two',
                      payload: { two: true },
                    },
                  ]),
                { role: 'app', requireActor: true, retry: false },
              ),
            );
            const messageId = randomUUID();
            const generation = variant === 'generation' ? 2 : 1;
            await fixture.admin.query(
              "update outbox.legacy_ownership set state='NEW',generation=1",
            );
            await fixture.admin.query(
              `insert into outbox.messages(id,tenant_id,entity,entity_id,payload,idempotency_key,migrated_event_id,cutover_generation)
          values ($1,$2,'legacy.map','one','{"original":true}','legacy-map-message',$3,$4)`,
              [messageId, fixture.tenants[0], events[0]!.id, generation],
            );
            await fixture.admin.query(
              'insert into outbox.legacy_event_map(legacy_id,tenant_id,event_id,generation) values ($1,$2,$3,$4)',
              [
                messageId,
                fixture.tenants[0],
                events[variant === 'pointer' ? 1 : 0]!.id,
                generation,
              ],
            );
            if (variant === 'delivery')
              await fixture.admin.query(
                `insert into outbox.event_delivery(tenant_id,event_id,legacy_id)
          values ($1,$2,$3) on conflict(tenant_id,event_id) do update set legacy_id=excluded.legacy_id`,
                [fixture.tenants[0], events[1]!.id, messageId],
              );
          },
        ] as const,
    ),
    [
      'negative tenant clock',
      (fixture: Fixture) =>
        fixture.admin.query('insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,-1)', [
          fixture.tenants[0],
        ]),
    ],
    [
      'tenant clock outside UUID millisecond domain',
      (fixture: Fixture) =>
        fixture.admin.query(
          'insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,281474976710656)',
          [fixture.tenants[0]],
        ),
    ],
    [
      'nonfinite imported timestamp',
      async (fixture: Fixture) => {
        await fixture.admin.query(
          `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
          values ($1,$2,'consumer.infinity','one','infinite-cursor','{}','infinity')`,
          [randomUUID(), fixture.tenants[0]],
        );
        await fixture.admin.query(
          'insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,0)',
          [fixture.tenants[0]],
        );
      },
    ],
    [
      'exhausted event sequence',
      (fixture: Fixture) =>
        fixture.admin.query("select setval('outbox.event_order_seq',9223372036854775807,true)"),
    ],
    [
      'disabled foreign-key trigger',
      (fixture: Fixture) =>
        fixture.admin.query('alter table outbox.event_acks disable trigger all'),
    ],
    [
      'orphan historical ACK with enabled foreign key',
      async (fixture: Fixture) => {
        await fixture.admin.query('alter table outbox.event_acks disable trigger all');
        await fixture.admin.query(
          `insert into outbox.event_acks(tenant_id,event_id,status,raw_body,identity_verified,hmac_verified)
          values ($1,$2,'ACKED',$3,false,false)`,
          [fixture.tenants[0], randomUUID(), Buffer.from('preserve orphan ACK bytes')],
        );
        await fixture.admin.query('alter table outbox.event_acks enable trigger all');
      },
    ],
    [
      'missing cursor index',
      (fixture: Fixture) => fixture.admin.query('drop index outbox.outbox_events_cursor'),
    ],
    [
      'missing required function',
      (fixture: Fixture) => fixture.admin.query('drop function outbox.event_uuid(bigint,bigint)'),
    ],
    [
      'missing FORCE RLS',
      (fixture: Fixture) =>
        fixture.admin.query('alter table outbox.events no force row level security'),
    ],
    [
      'missing immutable trigger',
      (fixture: Fixture) =>
        fixture.admin.query(
          'drop trigger outbox_retirements_immutable on outbox.event_retirements',
        ),
    ],
    [
      'missing policy',
      (fixture: Fixture) =>
        fixture.admin.query(`do $$ declare p text; begin
      select policyname into p from pg_policies where schemaname='outbox' and tablename='events'
        and ${fixture.admin.escapeLiteral(fixture.options.appRole!)}=any(roles::text[]) limit 1;
      if p is null then raise exception 'fixture has no app event policy'; end if;
      execute format('drop policy %I on outbox.events',p); end $$`),
    ],
    [
      'excess immutable-history grant',
      (fixture: Fixture) =>
        fixture.admin.query(
          `grant update on outbox.event_retirements to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)}`,
        ),
    ],
    [
      'inherited column mutation grant',
      async (fixture: Fixture) => {
        const parent = `consumer_parent_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
        fixture.roles.push(parent);
        await fixture.admin.query(
          `create role ${fixture.admin.escapeIdentifier(parent)} noinherit nosuperuser nobypassrls`,
        );
        await fixture.admin.query(
          `grant update(raw_body) on outbox.event_acks to ${fixture.admin.escapeIdentifier(parent)}`,
        );
        await fixture.admin.query(
          `grant ${fixture.admin.escapeIdentifier(parent)} to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)} with inherit true`,
        );
        const effective = await fixture.admin.query(
          `select has_table_privilege($1,'outbox.event_acks','UPDATE') as table_update,
          has_column_privilege($1,'outbox.event_acks','raw_body','UPDATE') as column_update`,
          [fixture.options.appRole],
        );
        expect(effective.rows).toEqual([{ table_update: false, column_update: true }]);
      },
    ],
    [
      'inherited grant option on otherwise allowed SELECT',
      async (fixture: Fixture) => {
        const parent = `consumer_grant_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
        await fixture.admin.query(
          `create role ${fixture.admin.escapeIdentifier(parent)} nosuperuser nobypassrls noinherit`,
        );
        fixture.roles.push(parent);
        await fixture.admin.query(
          `grant select on outbox.events to ${fixture.admin.escapeIdentifier(parent)} with grant option`,
        );
        await fixture.admin.query(
          `grant ${fixture.admin.escapeIdentifier(parent)} to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)} with inherit true`,
        );
        expect(
          (
            await fixture.admin.query(
              `select has_table_privilege($1,'outbox.events','SELECT') as allowed,
          has_table_privilege($1,'outbox.events','SELECT WITH GRANT OPTION') as grantable`,
              [fixture.options.appRole],
            )
          ).rows,
        ).toEqual([{ allowed: true, grantable: true }]);
      },
    ],
    [
      'SET-able NOINHERIT parent with a cross-tenant SELECT policy',
      async (fixture: Fixture) => {
        for (const tenantId of fixture.tenants)
          await scope(fixture, tenantId, () =>
            fixture.database.tx(
              (trx) =>
                fixture.outbox.appendInTransaction(trx, {
                  entity: 'consumer.policy',
                  entityId: tenantId,
                  idempotencyKey: 'policy-witness',
                  payload: { tenantId },
                }),
              { role: 'app', requireActor: true, retry: false },
            ),
          );
        const parent = `consumer_set_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
        await fixture.admin.query(
          `create role ${fixture.admin.escapeIdentifier(parent)} nosuperuser nobypassrls noinherit`,
        );
        fixture.roles.push(parent);
        await fixture.admin.query(
          `grant usage on schema outbox to ${fixture.admin.escapeIdentifier(parent)}; grant select on outbox.events to ${fixture.admin.escapeIdentifier(parent)}`,
        );
        await fixture.admin.query(
          `create policy consumer_parent_escape on outbox.events for select to ${fixture.admin.escapeIdentifier(parent)} using(true)`,
        );
        await fixture.admin.query(
          `grant ${fixture.admin.escapeIdentifier(parent)} to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)} with inherit false,set true`,
        );
        const app = new Client({
          connectionString: fixture.postgres.appConnectionString(
            'parent-policy-witness',
            fixture.options.appRole!,
          ),
        });
        await app.connect();
        try {
          await app.query('begin');
          await app.query(
            "select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)",
            [fixture.tenants[0], ACTOR],
          );
          expect(
            (await app.query('select distinct tenant_id from outbox.events order by tenant_id'))
              .rows,
          ).toEqual([{ tenant_id: fixture.tenants[0] }]);
          await app.query(`set local role ${app.escapeIdentifier(parent)}`);
          expect(
            (await app.query('select distinct tenant_id from outbox.events order by tenant_id'))
              .rows,
          ).toEqual([...fixture.tenants].sort().map((tenant_id) => ({ tenant_id })));
        } finally {
          await app.query('rollback');
          await app.end();
        }
      },
    ],
    [
      'inherited owner capability',
      (fixture: Fixture) =>
        fixture.admin.query(
          `grant ${fixture.admin.escapeIdentifier(fixture.options.ownerRole!)} to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)}`,
        ),
    ],
    [
      'application-owned relation',
      (fixture: Fixture) =>
        fixture.admin.query(
          `alter table outbox.events owner to ${fixture.admin.escapeIdentifier(fixture.options.appRole!)}`,
        ),
    ],
    [
      'schema drift',
      (fixture: Fixture) =>
        fixture.admin.query(
          'alter table outbox.event_retirements drop constraint outbox_retirements_operation_key',
        ),
    ],
  ] as const)('fails closed on %s without repairing the database', async (_label, mutate) => {
    const fixture = await createFixture();
    try {
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      await mutate(fixture);
      const before = await evidenceSnapshot(fixture);
      const report = await verify(fixture);
      expect(report.supported).toBe(false);
      expect(report.checks.some((check) => check.status !== 'pass')).toBe(true);
      expect(
        report.checks
          .filter((check) => check.status !== 'pass')
          .every((check) => check.id.length > 0 && check.object.length > 0),
      ).toBe(true);
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      await expect(verify(fixture)).resolves.toEqual(report);
    } finally {
      await dispose(fixture);
    }
  });

  it('preserves arbitrary imported IDs and admits an advanced tenant clock without consuming the sequence', async () => {
    const fixture = await createFixture();
    try {
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      const futureMs = Date.now() + 3_600_000;
      const imported = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
      await fixture.admin.query(
        `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
        values ($1,$2,'consumer.arbitrary','one','arbitrary-cursor','{"original":true}',to_timestamp($3::numeric/1000))`,
        [imported, fixture.tenants[0], futureMs],
      );
      await fixture.admin.query(
        'insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,$2)',
        [fixture.tenants[0], futureMs],
      );
      await fixture.admin.query('alter sequence outbox.event_order_seq restart with 1');
      const before = await evidenceSnapshot(fixture);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: false });
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      await fixture.admin.query('update outbox.tenant_clock set last_ms=$2 where tenant_id=$1', [
        fixture.tenants[0],
        futureMs + 1,
      ]);
      const advanced = await evidenceSnapshot(fixture);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      expect(await evidenceSnapshot(fixture)).toEqual(advanced);
      const next = await scope(fixture, fixture.tenants[0], () =>
        fixture.database.tx(
          (trx) =>
            fixture.outbox.appendInTransaction(trx, {
              entity: 'consumer.arbitrary',
              entityId: 'two',
              idempotencyKey: 'after-import',
              payload: { next: true },
            }),
          { role: 'app', requireActor: true, retry: false },
        ),
      );
      expect(next.id).not.toBe(imported);
      expect(
        (
          await fixture.admin.query(
            'select id,payload from outbox.events where tenant_id=$1 order by created_at,id',
            [fixture.tenants[0]],
          )
        ).rows,
      ).toEqual([
        { id: imported, payload: { original: true } },
        { id: next.id, payload: { next: true } },
      ]);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
    } finally {
      await dispose(fixture);
    }
  });

  it('admits arbitrary historical IDs when actual server time advances the next cursor', async () => {
    const fixture = await createFixture();
    try {
      const historicalMs = Date.now() - 3_600_000;
      const imported = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
      await fixture.admin.query(
        `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
        values ($1,$2,'consumer.historical','one','historical-cursor','{"original":true}',to_timestamp($3::numeric/1000))`,
        [imported, fixture.tenants[0], historicalMs],
      );
      await fixture.admin.query(
        'insert into outbox.tenant_clock(tenant_id,last_ms) values ($1,$2)',
        [fixture.tenants[0], historicalMs],
      );
      await fixture.admin.query('alter sequence outbox.event_order_seq restart with 1');
      const before = await evidenceSnapshot(fixture);
      await expect(verify(fixture)).resolves.toMatchObject({ supported: true });
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      const next = await scope(fixture, fixture.tenants[0], () =>
        fixture.database.tx(
          (trx) =>
            fixture.outbox.appendInTransaction(trx, {
              entity: 'consumer.historical',
              entityId: 'two',
              idempotencyKey: 'after-history',
              payload: { next: true },
            }),
          { role: 'app', requireActor: true, retry: false },
        ),
      );
      expect(next.createdAt.getTime()).toBeGreaterThan(historicalMs);
      expect(
        (
          await fixture.admin.query(
            'select id,payload from outbox.events where tenant_id=$1 order by created_at,id',
            [fixture.tenants[0]],
          )
        ).rows,
      ).toEqual([
        { id: imported, payload: { original: true } },
        { id: next.id, payload: { next: true } },
      ]);
    } finally {
      await dispose(fixture);
    }
  });

  it('the packed CLI rejects real storage drift without changing evidence or leaking connection credentials', async () => {
    const fixture = await createFixture();
    let cli: ReturnType<typeof packedStorageCli> | undefined;
    try {
      cli = packedStorageCli();
      await fixture.postgres.ensureRoleLogin(fixture.options.ownerRole!);
      const ownerPassword = `private-packed-${randomUUID()}`;
      await fixture.admin.query(
        `alter role ${fixture.admin.escapeIdentifier(fixture.options.ownerRole!)} password ${fixture.admin.escapeLiteral(ownerPassword)}`,
      );
      const databaseUrl = withPostgresCredentials(
        fixture.postgres.appConnectionString(
          'packed-owner-secret-marker',
          fixture.options.ownerRole!,
        ),
        { user: fixture.options.ownerRole!, password: ownerPassword },
      );
      const env = { ...process.env, STYNX_PACKED_STORAGE_URL: databaseUrl };
      const options = [
        '--owner-role',
        fixture.options.ownerRole!,
        '--app-role',
        fixture.options.appRole!,
        '--reader-role',
        fixture.options.readerRole!,
        '--tenant-schema',
        'auth',
        '--tenant-table',
        'tenants',
        '--tenant-column',
        'tenant_uuid',
      ];
      const offline = cli.run(['--render', ...options], {
        ...process.env,
        STYNX_STORAGE_DATABASE_URL: 'invalid://offline-secret-marker',
      });
      expect(offline.error).toBe(undefined);
      expect(offline.status).toBe(0);
      expect(JSON.parse(offline.stdout)).toMatchObject({ binding: fixture.options });
      const supported = cli.run(
        ['--database-url-env', 'STYNX_PACKED_STORAGE_URL', ...options],
        env,
      );
      expect(supported.error).toBe(undefined);
      expect(supported.status).toBe(0);
      expect(JSON.parse(supported.stdout)).toMatchObject({ supported: true });
      await scope(fixture, fixture.tenants[0], () =>
        fixture.database.tx(
          (trx) =>
            fixture.outbox.appendManyInTransaction(trx, [
              {
                entity: 'packed.cli',
                entityId: 'evidence',
                idempotencyKey: 'cli-evidence',
                payload: { preserve: true },
              },
            ]),
          { role: 'app', requireActor: true },
        ),
      );
      await fixture.admin.query('drop index outbox.outbox_events_cursor');
      const before = await evidenceSnapshot(fixture);
      const rejected = cli.run(['--database-url-env', 'STYNX_PACKED_STORAGE_URL', ...options], env);
      expect(rejected.error).toBe(undefined);
      expect(rejected.signal).toBe(null);
      expect(rejected.status).toBe(1);
      const report = JSON.parse(rejected.stdout) as StorageVerificationReport;
      expect(report.supported).toBe(false);
      expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(await evidenceSnapshot(fixture)).toEqual(before);
      for (const result of [offline, supported, rejected]) {
        expect(result.stdout + result.stderr).not.toContain(databaseUrl);
        expect(result.stdout + result.stderr).not.toContain('packed-owner-secret-marker');
        expect(result.stdout + result.stderr).not.toContain('offline-secret-marker');
        expect(result.stdout + result.stderr).not.toContain(ownerPassword);
        expect(result.stdout + result.stderr).not.toContain(encodeURIComponent(ownerPassword));
      }
      const unavailable = cli.run(['--database-url-env', 'STYNX_PACKED_STORAGE_URL', ...options], {
        ...env,
        STYNX_PACKED_STORAGE_URL:
          'postgresql://redacted:private-password-marker@localhost:1/missing?connect_timeout=1',
      });
      expect(unavailable.error).toBe(undefined);
      expect(unavailable.status).toBe(1);
      expect(unavailable.stdout + unavailable.stderr).not.toContain('private-password-marker');
      expect(JSON.parse(unavailable.stderr)).toMatchObject({
        supported: false,
        error: 'Outbox storage verification refused',
      });
    } finally {
      cli?.dispose();
      await dispose(fixture);
    }
  }, 60_000);

  it('refuses writable or wrong-role verifier transactions without taking transaction ownership', async () => {
    const fixture = await createFixture();
    try {
      const statements: string[] = [];
      await fixture.admin.query('begin');
      const transaction = {
        query: async <T extends Record<string, unknown>>(sql: string, values?: unknown[]) => {
          statements.push(sql);
          return fixture.admin.query<T>(sql, values);
        },
      };
      const report = await verifyOutboxStorage(transaction, fixture.options);
      expect(report.supported).toBe(false);
      expect(report.checks.some((check) => check.status !== 'pass')).toBe(true);
      expect(
        statements.every(
          (sql) =>
            !/^\s*(?:BEGIN|COMMIT|ROLLBACK|SET|GRANT|ALTER|CREATE|DROP|INSERT|UPDATE|DELETE)\b/iu.test(
              sql,
            ),
        ),
      ).toBe(true);
      expect(
        (await fixture.admin.query(`select current_setting('transaction_read_only') as readonly`))
          .rows,
      ).toEqual([{ readonly: 'off' }]);
      await fixture.admin.query('rollback');
      await fixture.admin.query('begin read only');
      const wrongRole = await verifyOutboxStorage(transaction, fixture.options);
      expect(wrongRole.supported).toBe(false);
      expect(wrongRole.checks.some((check) => check.status !== 'pass')).toBe(true);
      await fixture.admin.query('rollback');
    } finally {
      await fixture.admin.query('rollback');
      await dispose(fixture);
    }
  });
});
