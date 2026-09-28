import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry, Transaction } from '@stynx-nyx/data';
import * as outboxPublic from '@stynx-nyx/outbox';
import { StynxEventStreamService } from '../../src/event-stream/event-stream.service';
import type {
  EventStreamCursor,
  EventStreamRow,
  EventStreamSource,
  StynxSseRequest,
  StynxSseResponse,
} from '../../src/event-stream/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT_A = 'b1111111-1111-4111-8111-111111111111';
const TENANT_B = 'b2222222-2222-4222-8222-222222222222';
const ACTOR = 'b3333333-3333-4333-8333-333333333333';
const scopeA = { tenantId: TENANT_A, actorId: ACTOR };
const scopeB = { tenantId: TENANT_B, actorId: ACTOR };
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

interface AppendFact {
  id: string;
  createdAt: Date | string;
  tenantId: string;
}
interface AppendPort {
  appendManyInTransaction(
    trx: Transaction,
    events: Array<{
      entity: string;
      entityId: string;
      idempotencyKey: string;
      payload: Record<string, unknown>;
    }>,
  ): Promise<AppendFact[]>;
}
type SourceConstructor = new (
  database: Database,
  options?: { lockTimeoutMs: number },
) => EventStreamSource<EventStreamRow>;
const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

class ResponseProbe implements StynxSseResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  ended = 0;
  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
  write(_chunk: string): void {}
  end(): void {
    this.ended += 1;
  }
  on(_event: 'close', _listener: () => void): void {}
}

class RequestProbe implements StynxSseRequest {
  constructor(readonly headers: StynxSseRequest['headers'] = {}) {}
  on(_event: 'close', _listener: () => void): void {}
}

describe('CTG9 PostgreSQL outbox SSE adapter through backend', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let append: AppendPort;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_sse', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-sse-owner') },
            app: {
              connectionString: asRole(postgres.connectionString('ctg9-sse-app'), 'stynx_app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-sse-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        outboxPublic.StynxOutboxModule.forRoot(),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    append = moduleRef.get(outboxPublic.OutboxService) as unknown as AppendPort;
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1, 'ctg9-sse-a', 'CTG9 SSE A', true, clock_timestamp(), clock_timestamp()),
                ($2, 'ctg9-sse-b', 'CTG9 SSE B', true, clock_timestamp(), clock_timestamp())`,
        [TENANT_A, TENANT_B],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  function source(): EventStreamSource<EventStreamRow> {
    const Source = (outboxPublic as unknown as { OutboxEventStreamSource?: SourceConstructor })
      .OutboxEventStreamSource;
    expect(Source).toBeTypeOf('function');
    return new Source!(database, { lockTimeoutMs: 150 });
  }

  async function appendThree(): Promise<AppendFact[]> {
    const aggregate = `ctg9-sse-${randomUUID()}`;
    return database.withRequestContext(scopeA, () =>
      database.tx(
        (trx) =>
          append.appendManyInTransaction(
            trx,
            [0, 1, 2].map((index) => ({
              entity: 'ctg9.sse',
              entityId: aggregate,
              idempotencyKey: `${aggregate}:${index}`,
              payload: { index },
            })),
          ),
        { role: 'app', isolation: 'read committed', retry: false },
      ),
    );
  }

  it('reads committed UUIDv7 facts on the primary with a stable (createdAt,id) cursor across a one-row batch', async () => {
    const rows = await appendThree();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.id)).toEqual(rows.map((row) => row.id).sort());
    expect(
      rows.every((row) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.id),
      ),
    ).toBe(true);
    expect(new Set(rows.map((row) => asDate(row.createdAt).getTime())).size).toBe(1);

    const adapter = source();
    const query = vi.spyOn(Transaction.prototype, 'query');
    try {
      const first = await adapter.findById(rows[0]!.id, scopeA);
      expect(first?.id).toBe(rows[0]!.id);
      expect(await adapter.findById(rows[0]!.id, scopeB)).toBe(null);
      const cursor: EventStreamCursor = { createdAt: asDate(rows[0]!.createdAt), id: rows[0]!.id };
      const page1 = await adapter.listSince(cursor, scopeA, 1);
      expect(page1.map((row) => row.id)).toEqual([rows[1]!.id]);
      const page2 = await adapter.listSince(
        { createdAt: page1[0]!.createdAt, id: page1[0]!.id },
        scopeA,
        1,
      );
      expect(page2.map((row) => row.id)).toEqual([rows[2]!.id]);
      const current = await adapter.now(scopeA);
      expect(current.getTime()).toBeGreaterThanOrEqual(asDate(rows[2]!.createdAt).getTime());
      expect(query.mock.calls.some(([sql]) => String(sql).includes('pg_is_in_recovery'))).toBe(
        true,
      );
    } finally {
      query.mockRestore();
    }
  });

  it('rejects now() in a derived ambient transaction before another pool connection', async () => {
    const adapter = source();
    await database.withRequestContext(scopeA, () =>
      database.tx(
        async () => {
          const pool = moduleRef.get(StynxPoolRegistry).pools.app;
          const spy = vi.spyOn(pool, 'connect').mockImplementation(() => {
            throw new Error('SECOND_CONNECT_ATTEMPT');
          });
          let failure: unknown;
          try {
            await database.withRequestContext(scopeA, () => adapter.now(scopeA));
          } catch (error) {
            failure = error;
          } finally {
            spy.mockRestore();
          }
          expect((failure as Error | undefined)?.constructor.name).toBe(
            'OutboxClockAmbientTransactionError',
          );
          expect(spy).not.toHaveBeenCalled();
        },
        { role: 'app', retry: false },
      ),
    );
  });

  it('turns a locked clock preflight into backend SSE 503 without claiming a cursor', async () => {
    await appendThree();
    const holder = await postgres.connectAsAdmin();
    const adapter = source();
    try {
      await holder.query('begin');
      await holder.query('select * from outbox.tenant_clock where tenant_id = $1 for update', [
        TENANT_A,
      ]);
      const service = new StynxEventStreamService(database, { every: () => ({ cancel() {} }) });
      const response = new ResponseProbe();
      await service.open(new RequestProbe(), response, adapter, {
        scope: scopeA,
        tickMs: 1000,
        batchSize: 1,
        project: (row) => row,
      });
      expect(response.statusCode).toBe(503);
      expect(response.headers.get('x-stynx-error-code')).toBe('SSE_SOURCE_UNAVAILABLE');
      expect(response.ended).toBe(1);
      service.onModuleDestroy();
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 10_000);

  it('rejects malformed Last-Event-ID and restarts unknown IDs at the current primary cursor', async () => {
    await appendThree();
    const adapter = source();
    const service = new StynxEventStreamService(database, { every: () => ({ cancel() {} }) });
    try {
      const malformed = new ResponseProbe();
      await service.open(new RequestProbe({ 'last-event-id': 'bad\nheader' }), malformed, adapter, {
        scope: scopeA,
        tickMs: 1000,
        batchSize: 1,
        project: (row) => row,
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.headers.get('x-stynx-error-code')).toBe('SSE_INVALID_LAST_EVENT_ID');

      const unknown = new ResponseProbe();
      await service.open(new RequestProbe({ 'last-event-id': randomUUID() }), unknown, adapter, {
        scope: scopeA,
        tickMs: 1000,
        batchSize: 1,
        project: (row) => row,
      });
      expect(unknown.statusCode).toBe(200);
      expect(unknown.ended).toBe(0);
    } finally {
      service.onModuleDestroy();
    }
  });
});
