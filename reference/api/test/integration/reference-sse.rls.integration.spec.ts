import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { vi } from 'vitest';
import { Controller, Get, Inject, Req, Res, UseGuards } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { PermissionCache, StynxAuthGuard, StynxAuthModule, StynxJwtValidator } from '@stynx-nyx/auth';
import { RequestContext } from '@stynx-nyx/core';
import { SessionService } from '@stynx-nyx/sessions';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import {
  StynxEventStreamModule,
  StynxEventStreamService,
  type EventStreamContextRunner,
  type EventStreamCursor,
  type EventStreamRow,
  type EventStreamScheduler,
  type StynxSseRequest,
  type StynxSseResponse,
} from '@stynx-nyx/backend';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../packages/data/test/support/postgres';

const tenantA = '00000000-0000-7000-8000-0000000000a1';
const tenantB = '00000000-0000-7000-8000-0000000000b1';
const actorA = '00000000-0000-7000-8000-0000000000a2';

interface StreamRow extends EventStreamRow { payload: { tenant: string; value: string } }

class Scheduler implements EventStreamScheduler {
  readonly jobs: Array<{ period: number; tick: () => void; cancelled: boolean }> = [];
  every(period: number, tick: () => void) {
    const job = { period, tick, cancelled: false };
    this.jobs.push(job);
    return { cancel: () => { job.cancelled = true; } };
  }
  async fire(period: number): Promise<void> {
    this.jobs.filter((job) => job.period === period && !job.cancelled).forEach((job) => job.tick());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The queries deliberately contain no tenant predicate: FORCE RLS is the sensor. */
class RlsSource {
  constructor(@Inject(Database) private readonly database: Database) {}

  async now(): Promise<Date> {
    return this.database.tx(async (trx) => {
      await trx.query('set local role stynx_app');
      const result = await trx.query<{ value: Date }>('select clock_timestamp() as value');
      return result.rows[0]!.value;
    }, { role: 'app', readonly: true });
  }

  async findById(id: string): Promise<StreamRow | null> {
    return this.database.tx(async (trx) => {
      await trx.query('set local role stynx_app');
      const result = await trx.query<StreamRow>(`
        select id, created_at as "createdAt", event, payload
        from sse_fixture.event_stream where id = $1
      `, [id]);
      return result.rows[0] ?? null;
    }, { role: 'app', readonly: true });
  }

  async listSince(cursor: EventStreamCursor, _scope: { tenantId: string; actorId: string }): Promise<readonly StreamRow[]> {
    return this.database.tx(async (trx) => {
      await trx.query('set local role stynx_app');
      const role = await trx.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`
        select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user
      `);
      expect(role.rows[0]).toEqual({ current_user: 'stynx_app', rolsuper: false, rolbypassrls: false });
      const result = await trx.query<StreamRow>(`
        select id, created_at as "createdAt", event, payload
        from sse_fixture.event_stream
        where (created_at, id) > ($1::timestamptz, $2)
        order by created_at asc, id asc
      `, [cursor.createdAt, cursor.id]);
      return result.rows;
    }, { role: 'app', readonly: true });
  }
}

@Controller('/_sse')
@UseGuards(StynxAuthGuard)
class StreamController {
  constructor(
    @Inject(StynxEventStreamService) private readonly streams: StynxEventStreamService,
    @Inject(RlsSource) private readonly source: RlsSource,
    @Inject(RequestContext) private readonly requestContext: RequestContext,
  ) {}

  @Get()
  async get(
    @Req() request: StynxSseRequest,
    @Res() response: StynxSseResponse,
  ): Promise<void> {
    const captured = this.requestContext.snapshot();
    await this.streams.open(request, response, this.source, {
      scope: { tenantId: captured.tenantId ?? '', actorId: captured.actorId ?? '', ...(captured.sessionId ? { sessionId: captured.sessionId } : {}) },
      tickMs: 5,
      batchSize: 10,
      project: (row) => row.payload,
    });
  }
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/iu.test(value)) throw new Error('unexpected PostgreSQL role name');
  return `"${value}"`;
}

describe('reference API SSE with PostgreSQL FORCE RLS (UPS-SSE-04, UPS-SSE-05)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let scheduler: Scheduler;
  let database: Database;
  let app: import('@nestjs/common').INestApplication;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('reference_api_sse');
    const admin = await postgres.connectAsAdmin();
    try {
      const connector = (await admin.query<{ current_user: string }>('select current_user')).rows[0]!.current_user;
      const quotedConnector = quoteIdentifier(connector);
      await admin.query(`do $$ begin create role stynx_app nologin noinherit nobypassrls nosuperuser; exception when duplicate_object then null; end $$`);
      await admin.query(`do $$ begin create role stynx_sse_owner nologin noinherit nobypassrls nosuperuser; exception when duplicate_object then null; end $$`);
      await admin.query(`grant stynx_app, stynx_sse_owner to ${quotedConnector}`);
      await admin.query('create schema sse_fixture authorization stynx_sse_owner');
      await admin.query('create schema tenancy; create schema auth');
      await admin.query('create table tenancy.tenants (id uuid primary key, is_active boolean not null, state text)');
      await admin.query('create table auth.memberships (user_id uuid not null, tenant_id uuid not null, is_active boolean not null)');
      await admin.query('insert into tenancy.tenants values ($1, true, \'active\'), ($2, true, \'active\')', [tenantA, tenantB]);
      await admin.query('insert into auth.memberships values ($1, $2, true)', [actorA, tenantA]);
      await admin.query(`create table sse_fixture.event_stream (
        id text primary key, tenant_id uuid not null, created_at timestamptz not null,
        event text not null, payload jsonb not null
      )`);
      await admin.query('alter table sse_fixture.event_stream owner to stynx_sse_owner');
      await admin.query('alter table sse_fixture.event_stream enable row level security');
      await admin.query('alter table sse_fixture.event_stream force row level security');
      await admin.query(`create policy tenant_visibility on sse_fixture.event_stream
        using (tenant_id::text = current_setting('app.tenant_id', true))
        with check (tenant_id::text = current_setting('app.tenant_id', true))`);
      await admin.query('grant usage on schema sse_fixture to stynx_app');
      await admin.query('grant select, insert on sse_fixture.event_stream to stynx_app');
      await admin.query(`insert into sse_fixture.event_stream (id, tenant_id, created_at, event, payload) values
        ('a-expired', $1, clock_timestamp() - interval '25 hours', 'record.changed', jsonb_build_object('tenant', 'A', 'value', 'expired')),
        ('a-recent', $1, clock_timestamp() - interval '1 minute', 'record.changed', jsonb_build_object('tenant', 'A', 'value', 'recent')),
        ('b-private', $2, clock_timestamp() - interval '1 minute', 'record.changed', jsonb_build_object('tenant', 'B', 'value', 'private'))`, [tenantA, tenantB]);
    } finally { await admin.end(); }

    scheduler = new Scheduler();
    const contextRunner: EventStreamContextRunner = {
      withRequestContext: (scope, fn) => database.withRequestContext(scope, fn),
    };
    moduleRef = await Test.createTestingModule({
      controllers: [StreamController],
      providers: [RlsSource, { provide: SessionService, useValue: { get: async () => ({ id: 'sse' }) } }],
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('reference-sse-owner') },
            app: { connectionString: postgres.connectionString('reference-sse-app') },
            reader: { connectionString: postgres.connectionString('reference-sse-reader') },
          },
          migrations: { enabled: false },
        }),
        StynxAuthModule.forRoot({ stynx: { issuer: 'https://sse.test' } }),
        StynxTenancyModule.forRoot({}),
        StynxEventStreamModule.forRoot({ contextRunner, scheduler }),
      ],
    })
      .overrideProvider(StynxJwtValidator)
      .useValue({ validate: async () => ({ sub: actorA, sid: randomUUID(), tenantId: tenantA, claims: {} }) })
      .overrideProvider(PermissionCache)
      .useValue({ getForSession: async () => ({ sid: 'sse', userId: actorA, tenantId: tenantA, membershipId: 'sse', permissions: [], hash: 'sse', generation: 1, computedAt: Date.now() }) })
      .compile();
    database = moduleRef.get(Database);
    // The app's concrete Database is the structural context port; this catches a core.Database substitution.
    const streamModule = moduleRef.get(StynxEventStreamService);
    expect(streamModule).toBeDefined();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
  }, 60_000);

  afterAll(async () => { await app?.close(); await postgres?.dispose(); }, 60_000);

  it('keeps A-positive replay/tick and B-negative RLS behavior in one real Nest/PostgreSQL scenario', async () => {
    const source = moduleRef.get(RlsSource);
    const runAsA = <T>(fn: () => Promise<T>) => database.withRequestContext({ tenantId: tenantA, actorId: actorA }, fn);
    await expect(runAsA(() => source.now())).resolves.toBeInstanceOf(Date);
    await expect(runAsA(() => source.findById('a-recent'))).resolves.toMatchObject({ id: 'a-recent' });
    await expect(runAsA(() => source.findById('b-private'))).resolves.toBeNull();
    await expect(runAsA(() => source.listSince({ createdAt: new Date(0), id: '' }, { tenantId: tenantA, actorId: actorA }))).resolves.toEqual([
      expect.objectContaining({ id: 'a-expired' }), expect.objectContaining({ id: 'a-recent' }),
    ]);

    // A timer has no request CLS. A source call outside the context must fail; service ticks must re-establish A.
    await expect(source.now()).rejects.toThrow();

    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Nest HTTP listener is unavailable');
    const stream = await new Promise<{ body(): string; contentType: string | undefined; close(): void }>((resolve, reject) => {
      const client = httpRequest({ host: '127.0.0.1', port: address.port, path: '/_sse', headers: { host: 'reference-api.test', authorization: 'Bearer test-a', 'x-tenant-id': tenantA } });
      client.once('response', (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
          if (body.includes(': connected\n\n')) resolve({ body: () => body, contentType: response.headers['content-type'], close: () => client.destroy() });
        });
        response.once('end', () => reject(new Error(`stream ended before handshake: HTTP ${response.statusCode}, content-type ${response.headers['content-type']}, body ${body}`)));
      });
      client.once('error', reject);
      client.end();
    });
    expect(stream.contentType).toContain('text/event-stream');
    expect(stream.body()).toContain(': connected\n\n');
    try {
      const liveAdmin = await postgres.connectAsAdmin();
      try {
        await liveAdmin.query(`insert into sse_fixture.event_stream (id, tenant_id, created_at, event, payload) values
          ('a-tick', $1, clock_timestamp() + interval '1 second', 'record.changed', jsonb_build_object('tenant', 'A', 'value', 'tick')),
          ('b-tick', $2, clock_timestamp() + interval '1 second', 'record.changed', jsonb_build_object('tenant', 'B', 'value', 'private'))`, [tenantA, tenantB]);
      } finally { await liveAdmin.end(); }
      await scheduler.fire(5);
      await vi.waitFor(() => expect(stream.body()).toContain('id: a-tick'), { timeout: 5_000, interval: 20 });
      expect(stream.body()).not.toContain('b-tick');
    } finally {
      stream.close();
    }

    const statusFor = async (lastEventId: string) => new Promise<number>((resolve, reject) => {
      const client = httpRequest({ host: '127.0.0.1', port: address.port, path: '/_sse', headers: { host: 'reference-api.test', authorization: 'Bearer test-a', 'x-tenant-id': tenantA, 'last-event-id': lastEventId } }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
        client.destroy();
      });
      client.once('error', reject); client.end();
    });
    // A's expired cursor ends cleanly. B's ID is intentionally indistinguishable from unknown;
    // both remain streams (200) and never disclose B.
    await expect(statusFor('a-expired')).resolves.toBe(204);
    await expect(statusFor('b-private')).resolves.toBe(200);

    // A conflicting tenant claim is rejected before stream headers on the real Nest route.
    const rejected = await new Promise<{ status: number | undefined; contentType: string | undefined }>((resolve, reject) => {
      const client = httpRequest({ host: '127.0.0.1', port: address.port, path: '/_sse', headers: { host: 'reference-api.test', authorization: 'Bearer test-a', 'x-tenant-id': tenantB } }, (response) => {
        response.resume(); response.once('end', () => resolve({ status: response.statusCode, contentType: response.headers['content-type'] }));
      });
      client.once('error', reject); client.end();
    });
    expect(rejected.status).toBe(403);
    expect(rejected.contentType).not.toContain('text/event-stream');
  });
});
