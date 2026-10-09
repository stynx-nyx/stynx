import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import type { Client } from 'pg';
import {
  OutboxAppRoleOwnershipError,
  OutboxEventConflictError,
  OutboxEventTransactionError,
} from '../../src/errors';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import { StynxOutboxModule } from '../../src/outbox.module';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxEventRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

// INV-TENANCY-001; UPS-OBX-10 (ADR-OUTBOX-0003 D1): a conforming application
// role other than stynx_app appends, reads and completes its own attempts
// under FORCE RLS; the wrong role is refused typed; a role that owns, or is a
// member of the owner of, an outbox relation cannot boot the module.
const TENANT_A = 'd1111111-1111-4111-8111-111111111111';
const TENANT_B = 'd2222222-2222-4222-8222-222222222222';
const ACTOR = 'd3333333-3333-4333-8333-333333333333';
const suffix = () => randomUUID().replace(/-/g, '').slice(0, 10);
const asRole = (url: string, role: string) =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const TENANT_POLICY = "tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid";

describe('outbox configurable application role (PostgreSQL/RLS)', () => {
  let postgres: PostgresTestDatabase;
  let admin: Client;
  const roles: string[] = [];
  const modules: TestingModule[] = [];

  async function createRole(prefix: string): Promise<string> {
    const role = `${prefix}_${suffix()}`;
    const quoted = admin.escapeIdentifier(role);
    await admin.query(`create role ${quoted} login nosuperuser nobypassrls noinherit`);
    await admin.query(
      `grant connect on database ${admin.escapeIdentifier(postgres.database)} to ${quoted}`,
    );
    await postgres.ensureRoleLogin(role);
    roles.push(role);
    return role;
  }

  /** The role-binding of 0018/0021/0022 for one application role (what ADR-OUTBOX-0003 D2 will render). */
  async function bindOutboxRole(role: string): Promise<void> {
    const quoted = admin.escapeIdentifier(role);
    const policy = (table: string, clause: string) =>
      `create policy ${admin.escapeIdentifier(`${role}_${table}`)} on outbox.${table} ${clause}`;
    await admin.query('set role stynx_owner');
    for (const statement of [
      `grant usage on schema outbox to ${quoted}`,
      `grant usage on schema tenancy to ${quoted}`,
      `grant select,update on outbox.legacy_ownership to ${quoted}`,
      `grant select,insert,update on outbox.tenant_clock to ${quoted}`,
      `grant select,insert on outbox.events to ${quoted}`,
      `grant select,insert,update on outbox.event_delivery to ${quoted}`,
      `grant select,insert on outbox.event_attempts,outbox.event_acks to ${quoted}`,
      `grant update (result,error,completed_at,provider,protocol,request_bytes,request_sha256,
        request_headers,response_bytes,response_sha256,response_status,evidence_state) on outbox.event_attempts to ${quoted}`,
      `grant select on outbox.legacy_event_map to ${quoted}`,
      `grant usage,select on sequence outbox.event_order_seq to ${quoted}`,
      policy('legacy_ownership', `for select to ${quoted} using (true)`),
      policy('tenant_clock', `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`),
      policy('events', `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`),
      policy(
        'event_delivery',
        `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`,
      ),
      policy(
        'event_attempts',
        `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`,
      ),
      policy('event_acks', `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`),
      policy(
        'legacy_event_map',
        `to ${quoted} using (${TENANT_POLICY}) with check (${TENANT_POLICY})`,
      ),
    ]) {
      await admin.query(statement);
    }
    await admin.query(`create policy ${admin.escapeIdentifier(`${role}_ownership_lock`)} on outbox.legacy_ownership
      for update to ${quoted} using (true) with check (false)`);
    await admin.query('reset role');
  }

  async function compile(
    role: string,
    appRoleName: string,
    migrations = false,
  ): Promise<TestingModule> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: {
              connectionString: asRole(
                postgres.connectionString(`outbox-role-owner-${role}`),
                'stynx_owner',
              ),
            },
            app: {
              connectionString: postgres.appConnectionString(`outbox-role-app-${role}`, role),
              max: 2,
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString(`outbox-role-reader-${role}`),
                'stynx_reader',
              ),
            },
          },
          appRoleName,
          retry: false,
          ...(migrations ? { migrations: { enabled: true } } : {}),
        }),
        StynxOutboxModule.forRoot({
          dispatcher: { send: async () => undefined, sendEvent: async () => undefined },
        }),
      ],
    }).compile();
    modules.push(moduleRef);
    return moduleRef;
  }

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_app_role');
    admin = await postgres.connectAsAdmin();
    await admin.query(
      `insert into tenancy.tenants (id, slug, name)
       values ($1::uuid, 'outbox-role-a', 'Outbox role A'), ($2::uuid, 'outbox-role-b', 'Outbox role B')
       on conflict do nothing`,
      [TENANT_A, TENANT_B],
    );
  }, 90_000);

  afterAll(async () => {
    for (const moduleRef of modules.reverse()) await moduleRef.close().catch(() => undefined);
    await admin
      .query('alter table outbox.ack_quarantine owner to stynx_owner')
      .catch(() => undefined);
    for (const role of roles) {
      await admin.query(`drop owned by ${admin.escapeIdentifier(role)}`).catch(() => undefined);
      await admin
        .query(`drop role if exists ${admin.escapeIdentifier(role)}`)
        .catch(() => undefined);
    }
    await admin.end();
    await postgres.dispose();
  }, 60_000);

  it('accepts append, replay, conflict, reads, the clock and own attempt completion under a non-default role', async () => {
    const role = await createRole('stynx_obx10_detran');
    await bindOutboxRole(role);
    const moduleRef = await compile(role, role, true);
    await moduleRef.init();
    const database = moduleRef.get(Database);
    const outbox = moduleRef.get(OutboxService);
    const source = new OutboxEventStreamSource(database);
    const scopeA = { tenantId: TENANT_A, actorId: ACTOR };
    const scopeB = { tenantId: TENANT_B, actorId: ACTOR };
    const event = {
      entity: 'renach.exam',
      entityId: `exam-${suffix()}`,
      idempotencyKey: `key-${suffix()}`,
      payload: { ok: true },
    };

    expect(database.appRoleName).toBe(role);
    const appended = await database.withRequestContext(scopeA, () =>
      database.tx(
        async (trx) => {
          const identity = await trx.query<{ current_user: string }>('select current_user::text');
          expect(identity.rows).toEqual([{ current_user: role }]);
          return outbox.appendInTransaction(trx, event);
        },
        { retry: false },
      ),
    );
    expect(appended.tenantId).toBe(TENANT_A);
    const replayed = await database.withRequestContext(scopeA, () =>
      database.tx((trx) => outbox.appendInTransaction(trx, event), { retry: false }),
    );
    expect(replayed.id).toBe(appended.id);
    await expect(
      database.withRequestContext(scopeA, () =>
        database.tx(
          (trx) => outbox.appendInTransaction(trx, { ...event, payload: { ok: false } }),
          { retry: false },
        ),
      ),
    ).rejects.toBeInstanceOf(OutboxEventConflictError);

    await expect(source.now(scopeA)).resolves.toBeInstanceOf(Date);
    const found = await source.findById(appended.id, scopeA);
    expect(found).toMatchObject({ id: appended.id, event: event.entity });
    const since = await source.listSince({ createdAt: new Date(0), id: '' }, scopeA, 10);
    expect(since.map((row: OutboxEventRow | { id: string }) => row.id)).toContain(appended.id);
    await expect(source.findById(appended.id, scopeB)).resolves.toBe(null);
    await expect(source.listSince({ createdAt: new Date(0), id: '' }, scopeB, 10)).resolves.toEqual(
      [],
    );

    await admin.query(
      `insert into outbox.event_attempts (tenant_id,event_id,attempt_ordinal,result,completed_at)
      values ($1::uuid,$2::uuid,1,'SENT',clock_timestamp()),($1::uuid,$2::uuid,2,'CLAIMED',null)`,
      [TENANT_A, appended.id],
    );
    const completion = (ordinal: number, set: string) =>
      database.withRequestContext(scopeA, () =>
        database.tx(
          async (trx) =>
            (
              await trx.query(
                `update outbox.event_attempts set ${set}
        where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
                [TENANT_A, appended.id, ordinal],
              )
            ).rowCount,
          { retry: false },
        ),
      );
    await expect(completion(2, "result='SENT',completed_at=clock_timestamp()")).resolves.toBe(1);
    await expect(completion(1, "result='ERROR'")).rejects.toMatchObject({ code: '42501' });
    await expect(completion(2, "result='ERROR'")).rejects.toMatchObject({ code: '42501' });
    const ownerRewrite = await database.withSystemContext('owner attempt path', () =>
      database.tx(
        async (trx) =>
          (
            await trx.query(
              `update outbox.event_attempts set error='owner'
        where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=1`,
              [TENANT_A, appended.id],
            )
          ).rowCount,
        { role: 'owner', retry: false },
      ),
    );
    expect(ownerRewrite).toBe(1);
  }, 120_000);

  it('refuses the wrong SQL role, isolation, read-only, missing tenant and owner transactions typed', async () => {
    const role = await createRole('stynx_obx10_wrong');
    await bindOutboxRole(role);
    await admin.query(`grant stynx_app to ${admin.escapeIdentifier(role)}`);
    const moduleRef = await compile(role, role);
    await moduleRef.init();
    const database = moduleRef.get(Database);
    const outbox = moduleRef.get(OutboxService);
    const scope = { tenantId: TENANT_A, actorId: ACTOR };
    const event = {
      entity: 'renach.exam',
      entityId: `wrong-${suffix()}`,
      idempotencyKey: `wrong-${suffix()}`,
      payload: {},
    };
    const refusal = async (run: () => Promise<unknown>): Promise<unknown> => {
      try {
        await run();
      } catch (error) {
        return error;
      }
      return undefined;
    };

    const wrongRole = await refusal(() =>
      database.withRequestContext(scope, () =>
        database.tx(
          async (trx) => {
            await trx.query('set role stynx_app');
            try {
              return await outbox.appendInTransaction(trx, event);
            } finally {
              await trx.query('reset role');
            }
          },
          { retry: false },
        ),
      ),
    );
    expect(wrongRole).toBeInstanceOf(OutboxEventTransactionError);
    expect(wrongRole).toMatchObject({ reason: 'sql_role', context: { reason: 'sql_role' } });

    const isolation = await refusal(() =>
      database.withRequestContext(scope, () =>
        database.tx((trx) => outbox.appendInTransaction(trx, event), {
          isolation: 'repeatable read',
          retry: false,
        }),
      ),
    );
    expect(isolation).toMatchObject({ code: 'OUTBOX_EVENT_TRANSACTION', reason: 'isolation' });
    const readOnly = await refusal(() =>
      database.withRequestContext(scope, () =>
        database.tx((trx) => outbox.appendInTransaction(trx, event), {
          readonly: true,
          retry: false,
        }),
      ),
    );
    expect(readOnly).toMatchObject({ code: 'OUTBOX_EVENT_TRANSACTION', reason: 'read_only' });
    const tenant = await refusal(() =>
      database.withRequestContext(scope, () =>
        database.tx(
          async (trx) => {
            await trx.query(`select set_config('app.tenant_id','',true)`);
            return outbox.appendInTransaction(trx, event);
          },
          { retry: false },
        ),
      ),
    );
    expect(tenant).toMatchObject({ code: 'OUTBOX_EVENT_TRANSACTION', reason: 'tenant' });
    const owner = await refusal(() =>
      database.withSystemContext('owner append', () =>
        database.tx((trx) => outbox.appendInTransaction(trx, event), {
          role: 'owner',
          retry: false,
        }),
      ),
    );
    expect(owner).toMatchObject({ code: 'OUTBOX_EVENT_TRANSACTION', reason: 'transaction_role' });
  }, 60_000);

  it('prevents startup when the application role owns or is a member of the owner of an outbox relation', async () => {
    const owning = await createRole('stynx_obx10_owns');
    await admin.query(
      `alter table outbox.ack_quarantine owner to ${admin.escapeIdentifier(owning)}`,
    );
    const owningModule = await compile(owning, owning);
    await expect(owningModule.init()).rejects.toMatchObject({
      code: 'OUTBOX_APP_ROLE_OWNERSHIP',
      context: { property: 'owns', role: owning, relation: 'outbox.ack_quarantine', owner: owning },
    });
    await admin.query('alter table outbox.ack_quarantine owner to stynx_owner');

    const member = await createRole('stynx_obx10_member');
    await admin.query(`grant stynx_owner to ${admin.escapeIdentifier(member)}`);
    const memberModule = await compile(member, member);
    let failure: unknown;
    try {
      await memberModule.init();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(OutboxAppRoleOwnershipError);
    expect(failure).toMatchObject({
      context: { property: 'member', role: member, owner: 'stynx_owner' },
    });
  }, 60_000);
});
