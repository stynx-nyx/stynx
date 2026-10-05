import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { HttpOutboxDispatcher } from '../../src/http-outbox-dispatcher';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import type { OutboxRow, OutboxTransportEvidence } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'd1111111-1111-4111-8111-111111111111';
const ACTOR = 'd2222222-2222-4222-8222-222222222222';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Every case shares one scheduler lease. It must outlast the few database round
// trips a case makes between a claim and its next assertion even when the host
// is saturated: a 40 ms lease expired mid-case under load, the row was reclaimed
// and the unacknowledged event then failed every later case. Reclaim cases wait
// for real expiry, so the wait is derived from the lease instead of being tuned.
const EVENT_LEASE_MS = 750;
const LEASE_EXPIRY_WAIT_MS = EVENT_LEASE_MS + 50;
const bounded = async <T>(work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    delay(5_000).then(() => {
      throw new Error('CTG9 delivery deadline');
    }),
  ]);

describe('CTG9 event delivery leases and evidence (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let send: (row: OutboxRow) => Promise<OutboxTransportEvidence> = async () => ({});
  let sendLegacy: (row: OutboxRow) => Promise<void> = async () => undefined;

  const append = async (entityId = randomUUID()) =>
    database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        (trx) =>
          outbox.appendInTransaction(trx, {
            entity: 'ctg9.delivery',
            entityId,
            idempotencyKey: `ctg9:${entityId}`,
            payload: { entityId },
          }),
        { role: 'app', isolation: 'read committed', retry: false },
      ),
    );
  const ack = (eventId: string) =>
    outbox.ackEvent({
      tenantId: TENANT,
      eventId,
      status: 'ACKED',
      rawBody: Buffer.from(`ack:${eventId}`),
      hmacVerified: true,
    });

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_delivery', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-delivery-owner') },
            app: {
              connectionString: asRole(postgres.connectionString('ctg9-delivery-app'), 'stynx_app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-delivery-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          eventLeaseMs: EVENT_LEASE_MS,
          dispatcher: {
            send: (row) => sendLegacy(row),
            sendEvent: (row) => send(row),
          },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    const pools = moduleRef.get(StynxPoolRegistry).pools;
    for (const [pool, role] of [
      [pools.app, 'stynx_app'],
      [pools.reader, 'stynx_reader'],
    ] as const) {
      const result = await pool.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>('select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
      expect(result.rows).toEqual([{ current_user: role, rolsuper: false, rolbypassrls: false }]);
    }
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id,slug,name) values ($1,'ctg9-delivery','CTG9 delivery')`,
        [TENANT],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('fences a late failure from attempt N after another scheduler reclaims attempt N+1', async () => {
    const event = await append();
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: (value: OutboxTransportEvidence) => void;
    let startedFirst!: () => void;
    let startedSecond!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      startedFirst = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      startedSecond = resolve;
    });
    let calls = 0;
    send = async () => {
      calls += 1;
      if (calls === 1) {
        startedFirst();
        return new Promise<OutboxTransportEvidence>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      startedSecond();
      return new Promise<OutboxTransportEvidence>((resolve) => {
        resolveSecond = resolve;
      });
    };
    const first = outbox.dispatchEventsDue(1);
    await bounded(firstStarted);
    await delay(LEASE_EXPIRY_WAIT_MS);
    const second = outbox.dispatchEventsDue(1);
    await bounded(secondStarted);
    rejectFirst(new Error('late attempt one failure'));
    await bounded(first);

    const admin = await postgres.connectAsAdmin();
    try {
      const projection = await admin.query<{
        status: string;
        attempts: number;
        lease_until: Date | null;
      }>(
        `select status,attempts,lease_until from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, event.id],
      );
      expect(projection.rows).toEqual([expect.objectContaining({ status: 'SENT', attempts: 2 })]);
      expect(new Date(projection.rows[0]!.lease_until!).getTime()).toBeGreaterThan(
        Date.now() - 1_000,
      );
      const ledger = await admin.query<{ attempt_ordinal: number; result: string }>(
        `select attempt_ordinal,result from outbox.event_attempts where tenant_id=$1 and event_id=$2 order by attempt_ordinal`,
        [TENANT, event.id],
      );
      expect(ledger.rows).toEqual([
        { attempt_ordinal: 1, result: 'ERROR' },
        { attempt_ordinal: 2, result: 'CLAIMED' },
      ]);
    } finally {
      resolveSecond({ provider: 'probe', protocol: 'HTTP' });
      await bounded(second);
      await admin.end();
    }
    await ack(event.id);
  }, 15_000);

  it('allows one scheduler claim, then reclaims after a crashed lease without duplicate ordinal', async () => {
    const event = await append();
    let calls = 0;
    send = async () => {
      calls += 1;
      return { provider: 'probe', protocol: 'HTTP' };
    };
    const [left, right] = await bounded(
      Promise.all([outbox.dispatchEventsDue(1), outbox.dispatchEventsDue(1)]),
    );
    expect(left.length + right.length).toBe(1);
    expect(calls).toBe(1);
    expect(await outbox.dispatchEventsDue(1)).toHaveLength(0);
    await delay(LEASE_EXPIRY_WAIT_MS);
    const reclaimed = await bounded(outbox.dispatchEventsDue(1));
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.row.id).toBe(event.id);
    expect(calls).toBe(2);
    const admin = await postgres.connectAsAdmin();
    try {
      const attempts = await admin.query<{ attempts: number }>(
        `select attempts from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, event.id],
      );
      expect(attempts.rows).toEqual([{ attempts: 2 }]);
      const ordinals = await admin.query<{ attempt_ordinal: number }>(
        `select attempt_ordinal from outbox.event_attempts where tenant_id=$1 and event_id=$2 order by attempt_ordinal`,
        [TENANT, event.id],
      );
      expect(ordinals.rows).toEqual([{ attempt_ordinal: 1 }, { attempt_ordinal: 2 }]);
    } finally {
      await admin.end();
    }
    await ack(event.id);
  }, 15_000);

  it('keeps an in-flight SENT message terminal when cutover and its ACK finish before transport returns', async () => {
    const key = `ctg9-sent-cutover-ack-${randomUUID()}`;
    const admin = await postgres.connectAsAdmin();
    let sendStartedResolve!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      sendStartedResolve = resolve;
    });
    let finishSend!: (evidence: OutboxTransportEvidence) => void;
    let sendCalls = 0;
    try {
      const inserted = await admin.query<{ id: string }>(
        `insert into outbox.messages (tenant_id,entity,entity_id,payload,idempotency_key)
         values ($1,'ctg9.inflight-cutover',$2,'{"state":"pending"}'::jsonb,$2)
         returning id`,
        [TENANT, key],
      );
      const legacyId = inserted.rows[0]!.id;
      sendLegacy = async (row) => {
        sendCalls += 1;
        expect(row.id).toBe(legacyId);
        sendStartedResolve();
        return new Promise<void>((resolve) => {
          finishSend = () => resolve();
        });
      };

      const legacyDispatch = bounded(outbox.dispatchDue(1));
      await bounded(sendStarted);
      await bounded(outbox.cutoverLegacyMessages());
      const acknowledged = await outbox.ack({
        entity: 'ctg9.inflight-cutover',
        entityId: key,
        tenantId: TENANT,
        status: 'ACKED',
      });
      expect(acknowledged.id).toBe(legacyId);
      expect(acknowledged.status).toBe('ACKED');

      finishSend({ provider: 'probe', protocol: 'HTTP' });
      const [outcome] = await bounded(legacyDispatch);
      expect(outcome?.dispatched).toBe(true);
      expect(sendCalls).toBe(1);

      const linked = await admin.query<{ migrated_event_id: string; status: string }>(
        'select migrated_event_id,status from outbox.messages where id=$1',
        [legacyId],
      );
      expect(linked.rows[0]?.status).toBe('ACKED');
      const eventId = linked.rows[0]!.migrated_event_id;
      const delivery = await admin.query<{ status: string; attempts: number }>(
        `select status,attempts from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, eventId],
      );
      expect(delivery.rows).toEqual([{ status: 'ACKED', attempts: 1 }]);
      expect(await bounded(outbox.dispatchEventsDue(10))).toHaveLength(0);
      expect(sendCalls).toBe(1);
    } finally {
      finishSend?.({ provider: 'probe', protocol: 'HTTP' });
      sendLegacy = async () => undefined;
      await admin.end();
    }
  }, 15_000);

  it('records final HTTP headers, status, exact bytes, and SHA-256 for success and failure', async () => {
    const success = await append();
    const failure = await append();
    const fetchImpl = vi.fn(
      async (_url: string, request: RequestInit) =>
        new Response(
          request.headers &&
            (request.headers as Record<string, string>)['x-outbox-event-id'] === success.id
            ? 'accepted'
            : 'unavailable',
          {
            status:
              (request.headers as Record<string, string>)['x-outbox-event-id'] === success.id
                ? 202
                : 503,
          },
        ),
    );
    const http = new HttpOutboxDispatcher({
      url: 'https://provider.example.test/submit',
      headers: { Authorization: 'Bearer private', 'x-signature': 'hmac-private' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    send = (row) => http.sendEvent(row);
    const outcomes = await bounded(outbox.dispatchEventsDue(2));
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((item) => item.row.id === success.id)?.dispatched).toBe(true);
    expect(outcomes.find((item) => item.row.id === failure.id)?.dispatched).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const admin = await postgres.connectAsAdmin();
    try {
      const rows = await admin.query<{
        event_id: string;
        result: string;
        provider: string;
        protocol: string;
        request_bytes: Buffer;
        request_sha256: string;
        response_bytes: Buffer;
        response_sha256: string;
        response_status: number;
        request_headers: Record<string, string>;
      }>(
        `select event_id,result,provider,protocol,request_bytes,request_sha256,
                response_bytes,response_sha256,response_status,request_headers
           from outbox.event_attempts where tenant_id=$1 and event_id in ($2,$3)`,
        [TENANT, success.id, failure.id],
      );
      expect(rows.rows).toHaveLength(2);
      for (const item of rows.rows) {
        expect(item.provider).toBe('https://provider.example.test/submit');
        expect(item.protocol).toBe('HTTP');
        expect(item.request_bytes).toEqual(
          Buffer.from(
            JSON.stringify({
              entityId: item.event_id === success.id ? success.entityId : failure.entityId,
            }),
          ),
        );
        expect(item.request_sha256).toBe(
          createHash('sha256').update(item.request_bytes).digest('hex'),
        );
        expect(item.response_sha256).toBe(
          createHash('sha256').update(item.response_bytes).digest('hex'),
        );
        expect(item.request_headers['x-outbox-event-id']).toBe(item.event_id);
        expect(item.request_headers['x-outbox-idempotency-key']).toBe(
          `ctg9:${item.event_id === success.id ? success.entityId : failure.entityId}`,
        );
        expect(item.request_headers.authorization).toBe('[redacted]');
        expect(item.request_headers['x-signature']).toBe('[redacted]');
        expect(JSON.stringify(item.request_headers)).not.toContain('hmac-private');
        expect(JSON.stringify(item.request_headers)).not.toContain('Bearer private');
        if (item.event_id === success.id) {
          expect(item.result).toBe('SENT');
          expect(item.response_status).toBe(202);
          expect(item.response_bytes.toString()).toBe('accepted');
        } else {
          expect(item.result).toBe('ERROR');
          expect(item.response_status).toBe(503);
          expect(item.response_bytes.toString()).toBe('unavailable');
        }
      }
    } finally {
      await admin.end();
    }
    await ack(success.id);
    await ack(failure.id);
  }, 15_000);

  it('defers a negative ACK by backoff and accepts a later positive ACK as terminal', async () => {
    const event = await append();
    send = async () => ({ provider: 'probe', protocol: 'HTTP' });
    const sent = await bounded(outbox.dispatchEventsDue(1));
    expect(sent.map((item) => item.row.id)).toEqual([event.id]);
    await outbox.ackEvent({
      tenantId: TENANT,
      eventId: event.id,
      status: 'ERROR',
      rawBody: Buffer.from('negative-ack'),
      hmacVerified: true,
    });
    const admin = await postgres.connectAsAdmin();
    try {
      const rejected = await admin.query<{ status: string; next_attempt_at: Date | null }>(
        `select status,next_attempt_at from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, event.id],
      );
      const premature = await bounded(outbox.dispatchEventsDue(1));
      await outbox.ackEvent({
        tenantId: TENANT,
        eventId: event.id,
        status: 'ACKED',
        rawBody: Buffer.from('positive-ack'),
        hmacVerified: true,
      });
      const final = await admin.query<{ status: string; next_attempt_at: Date | null }>(
        `select status,next_attempt_at from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, event.id],
      );
      expect(rejected.rows[0]?.status).toBe('ERROR');
      expect(new Date(rejected.rows[0]!.next_attempt_at!).getTime()).toBeGreaterThan(Date.now());
      expect(premature).toEqual([]);
      expect(final.rows).toEqual([{ status: 'ACKED', next_attempt_at: null }]);
    } finally {
      await admin.end();
    }
  }, 15_000);

  it('bounds an owner claim wait behind an exclusive delivery table lock', async () => {
    const event = await append();
    send = async () => ({ provider: 'probe', protocol: 'HTTP' });
    const holder = await postgres.connectAsAdmin();
    try {
      await holder.query('begin');
      await holder.query('lock table outbox.event_delivery in share row exclusive mode');
      const started = Date.now();
      let blocked: unknown;
      try {
        await bounded(outbox.dispatchEventsDue(1));
      } catch (error) {
        blocked = error;
      }
      expect(Date.now() - started).toBeLessThan(3_000);
      const unchanged = await holder.query<{ status: string; attempts: number }>(
        'select status,attempts from outbox.event_delivery where tenant_id=$1 and event_id=$2',
        [TENANT, event.id],
      );
      expect(unchanged.rows).toEqual([{ status: 'PENDING', attempts: 0 }]);
      await holder.query('commit');
      const recovered = await bounded(outbox.dispatchEventsDue(1));
      expect(recovered.map((item) => item.row.id)).toEqual([event.id]);
      await ack(event.id);
      expect(blocked).toMatchObject({ code: 'OUTBOX_OWNERSHIP_CONTENTION', status: 503 });
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);

  it('does not resend after a successful send whose persistence is blocked, and continues the next row', async () => {
    const first = await append();
    const second = await append();
    let startFirst!: () => void;
    let startSecond!: () => void;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      startFirst = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      startSecond = resolve;
    });
    const firstMayComplete = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondMayComplete = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const sent: string[] = [];
    send = async (row) => {
      sent.push(row.id);
      if (row.id === first.id) {
        startFirst();
        await firstMayComplete;
      } else {
        startSecond();
        await secondMayComplete;
      }
      return { provider: 'probe', protocol: 'HTTP' };
    };
    const dispatch = outbox.dispatchEventsDue(2);
    await bounded(firstStarted);
    const holder = await postgres.connectAsAdmin();
    try {
      await holder.query('begin');
      await holder.query('lock table outbox.event_delivery in share row exclusive mode');
      releaseFirst();
      await bounded(secondStarted);
      await holder.query('commit');
      releaseSecond();
      const outcomes = await bounded(dispatch);
      expect(sent).toEqual([first.id, second.id]);
      expect(outcomes[0]).toMatchObject({
        row: { id: first.id },
        dispatched: true,
        reconciliationRequired: true,
        error: expect.stringContaining('persistence unresolved'),
      });
      expect(outcomes[1]).toMatchObject({ row: { id: second.id }, dispatched: true });
      expect(outcomes[1]?.reconciliationRequired ?? false).toBe(false);
      const ledger = await holder.query<{ event_id: string; result: string }>(
        `select event_id,result from outbox.event_attempts where tenant_id=$1 and event_id in ($2,$3)`,
        [TENANT, first.id, second.id],
      );
      expect(ledger.rows.find((item) => item.event_id === first.id)?.result).toBe('CLAIMED');
      expect(ledger.rows.find((item) => item.event_id === second.id)?.result).toBe('SENT');
    } finally {
      releaseFirst?.();
      releaseSecond?.();
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
      await ack(first.id);
      await ack(second.id);
    }
  }, 15_000);

  it('never exposes URL credentials, query tokens, or fetch error secrets in failed-send evidence', async () => {
    const event = await append();
    const url = 'https://alice:pw-secret@provider.example.test/submit?token=query-secret';
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch-secret transport failure');
    });
    const http = new HttpOutboxDispatcher({
      url,
      headers: { Authorization: 'Bearer header-secret' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    send = (row) => http.sendEvent(row);
    const outcomes = await bounded(outbox.dispatchEventsDue(1));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(outcomes.map((item) => item.row.id)).toEqual([event.id]);
    const admin = await postgres.connectAsAdmin();
    try {
      const evidence = await admin.query<{
        provider: string;
        error: string;
        request_headers: Record<string, string>;
      }>(
        `select provider,error,request_headers from outbox.event_attempts
          where tenant_id=$1 and event_id=$2 and attempt_ordinal=1`,
        [TENANT, event.id],
      );
      const delivery = await admin.query<{ last_error: string }>(
        `select last_error from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
        [TENANT, event.id],
      );
      expect(evidence.rows).toHaveLength(1);
      expect(evidence.rows[0]?.provider).toBe('https://provider.example.test/submit');
      expect(evidence.rows[0]?.request_headers.authorization).toBe('[redacted]');
      const exposed = JSON.stringify({
        outcome: outcomes[0],
        attempt: evidence.rows[0],
        projection: delivery.rows[0],
      });
      for (const secret of [
        'alice',
        'pw-secret',
        'query-secret',
        'fetch-secret',
        'header-secret',
      ]) {
        expect(exposed).not.toContain(secret);
      }
    } finally {
      await admin.end();
      await ack(event.id);
    }
  }, 15_000);
});
