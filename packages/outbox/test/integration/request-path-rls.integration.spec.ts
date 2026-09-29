import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import type { OutboxDispatchOutcome, OutboxEventRow, OutboxRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT_A = 'b3111111-1111-4111-8111-111111111111';
const TENANT_B = 'b3222222-2222-4222-8222-222222222222';
const ACTOR = 'b3333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

interface TenantOutboxPort {
  dispatchTenantEventsDue(limit?: number): Promise<OutboxDispatchOutcome[]>;
  ackTenantEvent(input: {
    eventId?: string;
    idempotencyKey?: string;
    rawBody: Buffer;
    status: 'ACKED' | 'ERROR';
    hmacVerified?: boolean;
  }): Promise<void>;
}

describe('request-path outbox delivery and ACK (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let requestPath: TenantOutboxPort;
  const delivered: OutboxRow[] = [];

  const asTenant = <T>(tenantId: string, work: () => Promise<T>) =>
    database.withRequestContext({ tenantId, actorId: ACTOR }, work);

  const append = (tenantId: string, entityId = randomUUID()) =>
    asTenant(tenantId, () =>
      database.tx(
        (trx) =>
          outbox.appendInTransaction(trx, {
            entity: 'request-path.probe',
            entityId,
            idempotencyKey: `request-path:${entityId}`,
            payload: { entityId },
          }),
        { role: 'app', isolation: 'read committed', retry: false, requireActor: true },
      ),
    );

  const ack = (tenantId: string, event: OutboxEventRow) =>
    asTenant(tenantId, () =>
      requestPath.ackTenantEvent({
        eventId: event.id,
        status: 'ACKED',
        rawBody: Buffer.from(`ack:${event.id}`),
        hmacVerified: true,
      }),
    );

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_request_rls', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('outbox-request-owner') },
            app: {
              connectionString: asRole(
                postgres.connectionString('outbox-request-app'),
                'stynx_app',
              ),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('outbox-request-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher: {
            send: async () => undefined,
            sendEvent: async (row) => {
              delivered.push(row);
              return {
                provider: 'request-path-probe',
                protocol: 'HTTP',
                requestBytes: Buffer.from(`request:${row.id}`),
                responseBytes: Buffer.from(`response:${row.id}`),
                responseStatus: 202,
              };
            },
          },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    requestPath = outbox as unknown as TenantOutboxPort;

    const app = moduleRef.get(StynxPoolRegistry).pools.app;
    const identity = await app.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>('select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
    expect(identity.rows).toEqual([
      { current_user: 'stynx_app', rolsuper: false, rolbypassrls: false },
    ]);

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id,slug,name) values
           ($1,'outbox-request-a','Outbox request A'),
           ($2,'outbox-request-b','Outbox request B')`,
        [TENANT_A, TENANT_B],
      );
      // A normal result is insufficient to prove SQL role: an owner transaction
      // with a tenant predicate could mimic RLS. These probes reject such writes
      // at the database boundary during request-path claim, evidence and ACK.
      await admin.query(`
        create function outbox.test_request_app_boundary() returns trigger
        language plpgsql as $$
        begin
          if current_user is distinct from 'stynx_app'
             or current_setting('app.role', true) is distinct from 'app'
             or nullif(current_setting('app.actor_id', true), '')::uuid is distinct from '${ACTOR}'::uuid
             or new.tenant_id is distinct from nullif(current_setting('app.tenant_id', true), '')::uuid then
            raise exception 'request_outbox_must_use_app_rls' using errcode='STY50';
          end if;
          return new;
        end $$;
        create trigger test_request_delivery_role before update on outbox.event_delivery
          for each row execute function outbox.test_request_app_boundary();
        create trigger test_request_attempt_role before insert or update on outbox.event_attempts
          for each row execute function outbox.test_request_app_boundary();
        create trigger test_request_ack_role before insert on outbox.event_acks
          for each row execute function outbox.test_request_app_boundary();
      `);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('grants app attempt updates while retaining FORCE RLS on request-path tables', async () => {
    const admin = await postgres.connectAsAdmin();
    try {
      const grant = await admin.query<{ allowed: boolean }>(
        `select has_table_privilege('stynx_app','outbox.event_attempts','UPDATE') as allowed`,
      );
      expect(grant.rows).toEqual([{ allowed: true }]);
      const relations = await admin.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `select relname,relrowsecurity,relforcerowsecurity from pg_class
          where oid in ('outbox.events'::regclass,'outbox.event_delivery'::regclass,
                        'outbox.event_attempts'::regclass,'outbox.event_acks'::regclass)
          order by relname`,
      );
      expect(relations.rows).toHaveLength(4);
      expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(
        true,
      );
    } finally {
      await admin.end();
    }
  });

  it('claims and persists attempts only for the active tenant under app role', async () => {
    const eventA = await append(TENANT_A);
    const eventB = await append(TENANT_B);
    const forbidden = await asTenant(TENANT_A, () =>
      database.tx(
        async (trx) => {
          const visible = await trx.query<{ id: string }>(
            `select id from outbox.events where tenant_id=$1::uuid and id=$2::uuid`,
            [TENANT_B, eventB.id],
          );
          const changed = await trx.query<{ event_id: string }>(
            `update outbox.event_delivery set status='ERROR'
               where tenant_id=$1::uuid and event_id=$2::uuid returning event_id`,
            [TENANT_B, eventB.id],
          );
          return { visible: visible.rows, changed: changed.rows };
        },
        { role: 'app', isolation: 'read committed', retry: false, requireActor: true },
      ),
    );
    expect(forbidden).toEqual({ visible: [], changed: [] });
    const first = await asTenant(TENANT_A, () => requestPath.dispatchTenantEventsDue(10));
    expect(first.map((outcome) => outcome.row.id)).toEqual([eventA.id]);
    expect(delivered.map((row) => row.id)).toEqual([eventA.id]);

    const admin = await postgres.connectAsAdmin();
    try {
      const projections = await admin.query<{
        tenant_id: string;
        event_id: string;
        status: string;
        attempts: number;
      }>(
        `select tenant_id::text,event_id::text,status,attempts from outbox.event_delivery
          where event_id in ($1,$2) order by tenant_id`,
        [eventA.id, eventB.id],
      );
      expect(projections.rows).toEqual([
        { tenant_id: TENANT_A, event_id: eventA.id, status: 'SENT', attempts: 1 },
        { tenant_id: TENANT_B, event_id: eventB.id, status: 'PENDING', attempts: 0 },
      ]);
      const attempts = await admin.query<{
        tenant_id: string;
        event_id: string;
        result: string;
        request_sha256: string;
        response_sha256: string;
        protocol: string;
      }>(
        `select tenant_id::text,event_id::text,result,request_sha256,response_sha256,protocol
           from outbox.event_attempts where event_id in ($1,$2)`,
        [eventA.id, eventB.id],
      );
      expect(attempts.rows).toEqual([
        {
          tenant_id: TENANT_A,
          event_id: eventA.id,
          result: 'SENT',
          request_sha256: createHash('sha256').update(`request:${eventA.id}`).digest('hex'),
          response_sha256: createHash('sha256').update(`response:${eventA.id}`).digest('hex'),
          protocol: 'HTTP',
        },
      ]);
    } finally {
      await admin.end();
    }

    const second = await asTenant(TENANT_B, () => requestPath.dispatchTenantEventsDue(10));
    expect(second.map((outcome) => outcome.row.id)).toEqual([eventB.id]);
    expect(delivered.map((row) => row.id)).toEqual([eventA.id, eventB.id]);
    await ack(TENANT_A, eventA);
    await ack(TENANT_B, eventB);
    const adminAfterAck = await postgres.connectAsAdmin();
    try {
      const acks = await adminAfterAck.query<{
        tenant_id: string;
        event_id: string;
        raw_sha256: string;
        identity_verified: boolean;
        hmac_verified: boolean;
      }>(
        `select tenant_id::text,event_id::text,raw_sha256,identity_verified,hmac_verified
           from outbox.event_acks where event_id in ($1,$2) order by tenant_id`,
        [eventA.id, eventB.id],
      );
      expect(acks.rows).toEqual([
        {
          tenant_id: TENANT_A,
          event_id: eventA.id,
          raw_sha256: createHash('sha256').update(`ack:${eventA.id}`).digest('hex'),
          identity_verified: true,
          hmac_verified: true,
        },
        {
          tenant_id: TENANT_B,
          event_id: eventB.id,
          raw_sha256: createHash('sha256').update(`ack:${eventB.id}`).digest('hex'),
          identity_verified: true,
          hmac_verified: true,
        },
      ]);
    } finally {
      await adminAfterAck.end();
    }
  });

  it('rejects cross-tenant identity and runtime tenantId spoofing without an ACK ledger row', async () => {
    const eventA = await append(TENANT_A);
    const eventB = await append(TENANT_B);
    await expect(
      asTenant(TENANT_A, () =>
        requestPath.ackTenantEvent({
          eventId: eventB.id,
          status: 'ACKED',
          rawBody: Buffer.from(`wrong-tenant:${eventB.id}`),
          hmacVerified: true,
          tenantId: TENANT_B,
        } as Parameters<TenantOutboxPort['ackTenantEvent']>[0]),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(TENANT_B, () =>
        requestPath.ackTenantEvent({
          idempotencyKey: eventA.idempotencyKey,
          status: 'ACKED',
          rawBody: Buffer.from(`wrong-key:${eventA.id}`),
          hmacVerified: true,
        }),
      ),
    ).rejects.toThrow();

    const admin = await postgres.connectAsAdmin();
    try {
      const state = await admin.query<{ event_id: string; status: string; ack_count: string }>(
        `select d.event_id::text,d.status,count(a.id)::text as ack_count
           from outbox.event_delivery d left join outbox.event_acks a
             on a.tenant_id=d.tenant_id and a.event_id=d.event_id
          where d.event_id in ($1,$2) group by d.event_id,d.status order by d.event_id`,
        [eventA.id, eventB.id],
      );
      expect(state.rows).toHaveLength(2);
      expect(state.rows.every((row) => row.status === 'PENDING' && row.ack_count === '0')).toBe(
        true,
      );
    } finally {
      await admin.end();
    }
    await ack(TENANT_A, eventA);
    await ack(TENANT_B, eventB);
  });

  it('rejects absent actor/tenant and invalid HMAC without touching delivery rows', async () => {
    const event = await append(TENANT_A);
    const rawBody = Buffer.from(`invalid-hmac:${event.id}`);
    await expect(requestPath.dispatchTenantEventsDue(1)).rejects.toThrow();
    await expect(
      requestPath.ackTenantEvent({
        eventId: event.id,
        status: 'ACKED',
        rawBody,
        hmacVerified: true,
      }),
    ).rejects.toThrow();
    await expect(
      database.withRequestContext({ tenantId: TENANT_A }, () =>
        requestPath.dispatchTenantEventsDue(1),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(TENANT_A, () =>
        requestPath.ackTenantEvent({
          eventId: event.id,
          status: 'ACKED',
          rawBody,
          hmacVerified: false,
        }),
      ),
    ).rejects.toThrow();

    const admin = await postgres.connectAsAdmin();
    try {
      const state = await admin.query<{ status: string; attempts: number; ack_count: string }>(
        `select d.status,d.attempts,count(a.id)::text as ack_count
           from outbox.event_delivery d left join outbox.event_acks a
             on a.tenant_id=d.tenant_id and a.event_id=d.event_id
          where d.tenant_id=$1 and d.event_id=$2 group by d.status,d.attempts`,
        [TENANT_A, event.id],
      );
      expect(state.rows).toEqual([{ status: 'PENDING', attempts: 0, ack_count: '0' }]);
      const quarantine = await admin.query<{ raw_sha256: string; reason: string }>(
        `select raw_sha256,reason from outbox.ack_quarantine where raw_sha256=$1`,
        [createHash('sha256').update(rawBody).digest('hex')],
      );
      expect(quarantine.rows).toContainEqual({
        raw_sha256: createHash('sha256').update(rawBody).digest('hex'),
        reason: 'invalid-hmac',
      });
    } finally {
      await admin.end();
    }
    await ack(TENANT_A, event);
  });
});
