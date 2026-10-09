import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, HttpCode, Post, UseFilters, UseGuards, type ArgumentsHost, type ExceptionFilter, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import request from 'supertest';
import { z } from 'zod';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import * as backend from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

type IfMatchApi = {
  RequireIfMatch: () => MethodDecorator;
  IfMatchRevision: () => ParameterDecorator;
  RevisionETag: () => MethodDecorator;
  IfMatchExceptionFilter: new (...args: never[]) => ExceptionFilter;
  PreconditionFailedError: new (message?: string, details?: Record<string, unknown>) => Error;
  PreconditionRequiredError: new (message?: string, details?: Record<string, unknown>) => Error;
  TransactionalCommand: (options?: Record<string, unknown>) => MethodDecorator;
  StynxTransactionalCommandModule: { forRoot(options: Record<string, unknown>): unknown };
};

const api = backend as unknown as Partial<IfMatchApi>;
const suppliedRequestId = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const schema = JSON.parse(readFileSync(resolve(__dirname, '../../../../law/schemas/error-envelope.schema.json'), 'utf8')) as {
  required: string[];
  properties: Record<string, unknown>;
};

function expectLawEnvelope(response: { status: number; body: Record<string, unknown>; headers: Record<string, string> },
  status: 412 | 428, code: string, expectedRequestId?: string): void {
  expect(response.status).toBe(status);
  for (const key of schema.required) expect(response.body).toHaveProperty(key);
  for (const key of Object.keys(response.body)) expect(Object.keys(schema.properties)).toContain(key);
  expect(response.body.statusCode).toBe(status);
  expect(response.body.errorCode).toBe(code);
  expect(response.body.message).toEqual(expect.any(String));
  expect((response.body.message as string).length).toBeGreaterThan(0);
  expect(response.body.requestId).toMatch(uuidV7);
  expect(response.body.requestId).toBe(response.headers['x-request-id']);
  if (expectedRequestId) expect(response.body.requestId).toBe(expectedRequestId);
  expect(response.headers).not.toHaveProperty('etag');
  expect(response.body).not.toHaveProperty('code');
  expect(response.body).not.toHaveProperty('context');
}

class ConsumerCatchAll implements ExceptionFilter {
  catch(_error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    res.status(599).json({ code: 'CONSUMER_GLOBAL_FILTER_WON' });
  }
}

describe('If-Match decorators on real Nest HTTP routes with StynxCoreModule', () => {
  let app: INestApplication | undefined;
  let currentRevision: number;
  const handler = vi.fn();

  beforeAll(async () => {
    for (const name of ['RequireIfMatch', 'IfMatchRevision', 'RevisionETag',
      'PreconditionFailedError', 'PreconditionRequiredError', 'IfMatchExceptionFilter'] as const) {
      expect(api[name], name).toBeTypeOf('function');
    }

    @Controller('/if-match-contract')
    class ResourceController {
      @Post('/update')
      @HttpCode(200)
      update(suppliedRevision: number) {
        handler(suppliedRevision);
        if (suppliedRevision !== currentRevision)
          throw new api.PreconditionFailedError!('Revision does not match', { currentRevision });
        currentRevision += 1;
        return { revision: currentRevision, record: { title: 'unchanged response body' } };
      }

      @Post('/bad-revision')
      @HttpCode(200)
      badRevision(_suppliedRevision: number) {
        return { record: { title: 'missing revision' } };
      }

      @Post('/explicit-filter')
      @HttpCode(200)
      explicitFilter() {
        throw new api.PreconditionFailedError!('Concurrent revision');
      }
    }

    for (const name of ['update', 'badRevision'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(ResourceController.prototype, name)!;
      api.IfMatchRevision!()(ResourceController.prototype, name, 0);
      api.RequireIfMatch!()(ResourceController.prototype, name, descriptor);
      api.RevisionETag!()(ResourceController.prototype, name, descriptor);
    }
    UseFilters(api.IfMatchExceptionFilter!)(ResourceController.prototype, 'explicitFilter',
      Object.getOwnPropertyDescriptor(ResourceController.prototype, 'explicitFilter')!);

    const module = await Test.createTestingModule({
      imports: [StynxCoreModule.forRoot({ appName: 'if-match-contract', schema: z.object({}) })],
      controllers: [ResourceController],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new ConsumerCatchAll());
    // Express auto-generated ETags would conceal whether @RevisionETag emitted one.
    app.getHttpAdapter().getInstance().disable('etag');
    await app.init();
  });

  beforeEach(() => { currentRevision = 4; handler.mockClear(); });
  afterAll(async () => { await app?.close(); });

  it.each([undefined, suppliedRequestId])('returns 428 law envelope with correlated request ID for absent If-Match (%s)', async (id) => {
    let call = request(app!.getHttpServer()).post('/if-match-contract/update');
    if (id) call = call.set('x-request-id', id);
    const response = await call.send({ title: 'ignored' });
    expectLawEnvelope(response, 428, 'PRECONDITION:REQUIRED:if-match', id);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([undefined, suppliedRequestId])('returns 412 law envelope for malformed supplied tag (%s)', async (id) => {
    let call = request(app!.getHttpServer()).post('/if-match-contract/update').set('if-match', 'W/"4"');
    if (id) call = call.set('x-request-id', id);
    const response = await call.send({ title: 'ignored' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', id);
    expect(handler).not.toHaveBeenCalled();
  });

  // HTTP parsers may remove outer OWS before Nest receives the header; the
  // exact raw-string OWS grammar is probed by the parser unit table above.
  it.each(['', 'W/"4"', '*', '"4", "5"', '"9007199254740992"'])('rejects malformed present If-Match %j before calling the handler', async (raw) => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', raw).send({ title: 'ignored' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match');
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes a safe integer revision to the handler and returns the unchanged body with the new revision ETag', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', '"4"').send({ title: 'changed' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ revision: 5, record: { title: 'unchanged response body' } });
    expect(response.headers.etag).toBe('"5"');
    expect(handler).toHaveBeenCalledExactlyOnceWith(4);
    expect(currentRevision).toBe(5);
  });

  it('uses the scoped filter for a concurrent revision error raised by the handler', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', '"3"').set('x-request-id', suppliedRequestId).send({ title: 'race' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', suppliedRequestId);
    expect(handler).toHaveBeenCalledExactlyOnceWith(3);
    expect(currentRevision).toBe(4);
  });

  it('allows direct use of the error only with its explicitly registered filter', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/explicit-filter')
      .set('x-request-id', suppliedRequestId).send({});
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', suppliedRequestId);
  });

  it('treats a successful body without a safe revision as a programmer error and emits no ETag', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/bad-revision')
      .set('if-match', '"4"').send({});
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers).not.toHaveProperty('etag');
  });
});

const COMMAND_TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const COMMAND_ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';

describe('If-Match and transactional command composition over Nest HTTP and PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;
  let app: INestApplication | undefined;
  const handler = vi.fn();

  beforeAll(async () => {
    expect(api.TransactionalCommand).toBeTypeOf('function');
    expect(api.StynxTransactionalCommandModule?.forRoot).toBeTypeOf('function');

    @Controller('/if-match-command')
    @UseGuards(AuthContextGuard)
    class RevisionController {
      constructor(private readonly database: Database) {}

      @Post('/update')
      @HttpCode(200)
      async update(suppliedRevision: number) {
        handler('update', suppliedRevision);
        return this.database.tx(async (trx) => {
          const updated = await trx.query<{ revision: number; note: string }>(
            `update core.if_match_command_probes set revision = revision + 1, note = 'committed'
             where tenant_id = $1 and revision = $2 returning revision, note`,
            [COMMAND_TENANT, suppliedRevision],
          );
          if (!updated.rows[0]) throw new api.PreconditionFailedError!('Revision does not match');
          return { revision: updated.rows[0].revision, note: updated.rows[0].note };
        }, { role: 'app', requireActor: true });
      }

      @Post('/rollback')
      @HttpCode(200)
      async rollback(suppliedRevision: number) {
        handler('rollback', suppliedRevision);
        await this.database.tx(async (trx) => {
          await trx.query('update core.if_match_command_probes set note = $1 where tenant_id = $2',
            ['rolled back', COMMAND_TENANT]);
        }, { role: 'app', requireActor: true });
        throw new Error('rollback after write');
      }

      @Post('/update-reversed')
      @HttpCode(200)
      updateReversed(suppliedRevision: number) { return this.update(suppliedRevision); }
    }

    for (const method of ['update', 'rollback'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(RevisionController.prototype, method)!;
      api.IfMatchRevision!()(RevisionController.prototype, method, 0);
      api.RequireIfMatch!()(RevisionController.prototype, method, descriptor);
      api.RevisionETag!()(RevisionController.prototype, method, descriptor);
      api.TransactionalCommand!()(RevisionController.prototype, method, descriptor);
      (Idempotent as unknown as (options: { transactional: true }) => MethodDecorator)({ transactional: true })(
        RevisionController.prototype, method, descriptor,
      );
      backend.Audit({ action: `command.ifMatch.${method}`, entity: 'revision', transactional: true } as never)(
        RevisionController.prototype, method, descriptor,
      );
    }
    const reversed = Object.getOwnPropertyDescriptor(RevisionController.prototype, 'updateReversed')!;
    api.TransactionalCommand!()(RevisionController.prototype, 'updateReversed', reversed);
    api.RevisionETag!()(RevisionController.prototype, 'updateReversed', reversed);
    api.RequireIfMatch!()(RevisionController.prototype, 'updateReversed', reversed);
    api.IfMatchRevision!()(RevisionController.prototype, 'updateReversed', 0);
    (Idempotent as unknown as (options: { transactional: true }) => MethodDecorator)({ transactional: true })(
      RevisionController.prototype, 'updateReversed', reversed);
    backend.Audit({ action: 'command.ifMatch.updateReversed', entity: 'revision', transactional: true } as never)(
      RevisionController.prototype, 'updateReversed', reversed);

    postgres = await createPostgresTestDatabase('stynx_if_match_command');
    const auditSink = new AuditSqlSink({ query: async () => { throw new Error('legacy audit path used'); } },
      { mode: 'audit_write_function' });
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'if-match-command', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('if-match-owner') },
            app: { connectionString: postgres.appConnectionString('if-match-app') },
            reader: { connectionString: `${postgres.connectionString('if-match-reader')}&options=${encodeURIComponent('-c role=stynx_reader')}` },
          },
          migrations: { enabled: true },
        }),
        StynxAuthModule.forRoot({ tokenVerifier: {
          verifyAuthorizationHeader: async () => ({ principal: {
            id: COMMAND_ACTOR, roles: ['member'], permissions: [], tenants: [COMMAND_TENANT],
            claims: { tenant_id: COMMAND_TENANT },
          } }),
        } }),
        StynxIdempotencyModule.forRoot({ backend: {
          get: async () => null, set: async () => undefined, acquireLock: async () => true,
          releaseLock: async () => undefined, isLocked: async () => false,
        } }),
        api.StynxTransactionalCommandModule!.forRoot({ auditSink }) as never,
      ],
      controllers: [RevisionController],
    }).compile();
    app = testing.createNestApplication();
    app.getHttpAdapter().getInstance().disable('etag');
    await app.init();

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'if-match-command', 'If-Match command', true, clock_timestamp(), clock_timestamp())`, [COMMAND_TENANT]);
      await admin.query(`create table core.if_match_command_probes (
        tenant_id uuid primary key references tenancy.tenants(id), revision integer not null, note text not null
      )`);
      await admin.query('alter table core.if_match_command_probes enable row level security');
      await admin.query('alter table core.if_match_command_probes force row level security');
      await admin.query(`create policy if_match_command_tenant on core.if_match_command_probes
        using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
      await admin.query('grant select, update on core.if_match_command_probes to stynx_app');
      await admin.query('insert into core.if_match_command_probes values ($1, 4, $2)', [COMMAND_TENANT, 'initial']);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  });

  beforeEach(async () => {
    handler.mockClear();
    const admin = await postgres!.connectAsAdmin();
    try {
      await admin.query('update core.if_match_command_probes set revision = 4, note = $1 where tenant_id = $2',
        ['initial', COMMAND_TENANT]);
      await admin.query("delete from audit.events where tenancy_id = $1 and operation like 'command.ifMatch.%'", [COMMAND_TENANT]);
      await admin.query('delete from core.idempotency_keys where tenant_id = $1', [COMMAND_TENANT]);
    } finally {
      await admin.end();
    }
  });

  const send = (path: 'update' | 'update-reversed' | 'rollback', key: string, ifMatch?: string,
    body: Record<string, unknown> = { note: 'requested' }) => {
    let call = request(app!.getHttpServer()).post(`/if-match-command/${path}`)
      .set('authorization', 'Bearer verified').set('idempotency-key', key);
    if (ifMatch !== undefined) call = call.set('if-match', ifMatch);
    return call.send(body);
  };

  const state = async () => {
    const admin = await postgres!.connectAsAdmin();
    try {
      const row = await admin.query<{ revision: number; note: string }>(
        'select revision, note from core.if_match_command_probes where tenant_id = $1', [COMMAND_TENANT]);
      const audit = await admin.query<{ operation: string; count: string }>(
        `select operation, count(*)::text from audit.events where tenancy_id = $1
         and operation like 'command.ifMatch.%' group by operation order by operation`, [COMMAND_TENANT]);
      const keys = await admin.query<{ count: string }>(
        'select count(*)::text from core.idempotency_keys where tenant_id = $1', [COMMAND_TENANT]);
      return { row: row.rows[0], audit: audit.rows, keys: Number(keys.rows[0]?.count) };
    } finally {
      await admin.end();
    }
  };

  it('rejects missing and malformed preconditions before handler or commit', async () => {
    const missing = await send('update', 'if-match-missing');
    const malformed = await send('update', 'if-match-malformed', 'W/"4"');
    expectLawEnvelope(missing, 428, 'PRECONDITION:REQUIRED:if-match');
    expectLawEnvelope(malformed, 412, 'PRECONDITION:FAILED:if-match');
    expect(handler).not.toHaveBeenCalled();
    expect(await state()).toEqual({ row: { revision: 4, note: 'initial' }, audit: [], keys: 0 });
  });

  it('rejects a stale strong revision without committing the write, key or audit', async () => {
    const stale = await send('update', 'if-match-stale', '"3"');
    expectLawEnvelope(stale, 412, 'PRECONDITION:FAILED:if-match');
    expect(handler).toHaveBeenLastCalledWith('update', 3);
    expect(await state()).toEqual({ row: { revision: 4, note: 'initial' }, audit: [], keys: 0 });
  });

  it('commits the revision and ETag once, then replays the same bytes and ETag without handler or audit', async () => {
    const first = await send('update', 'if-match-success', '"4"');
    const replay = await send('update', 'if-match-success', '"4"');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ revision: 5, note: 'committed' });
    expect(first.headers.etag).toBe('"5"');
    expect(replay.status).toBe(first.status);
    expect(replay.text).toBe(first.text);
    expect(replay.headers.etag).toBe(first.headers.etag);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(handler).toHaveBeenCalledExactlyOnceWith('update', 4);
    expect(await state()).toEqual({
      row: { revision: 5, note: 'committed' },
      audit: [{ operation: 'command.ifMatch.update', count: '1' }], keys: 1,
    });
  });

  it.each(['update', 'update-reversed'] as const)('returns a full CTG5 conflict envelope beside If-Match in %s decorator order', async (path) => {
    const key = `if-match-conflict-${path}`;
    const first = await send(path, key, '"4"');
    expect(first.status).toBe(200);
    const admin = await postgres!.connectAsAdmin();
    try {
      await admin.query('update core.if_match_command_probes set revision = 4 where tenant_id = $1', [COMMAND_TENANT]);
    } finally { await admin.end(); }
    const conflicting = await send(path, key, '"4"', { note: 'different request body' });
    expect(conflicting.status).toBe(409);
    const requestId = conflicting.headers['x-request-id'];
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    expect(conflicting.body).toEqual({ statusCode: 409, errorCode: 'IDEMPOTENCY:CONFLICT:duplicate-key',
      message: 'Idempotency key was used for a different request', requestId,
      details: { key }, retryable: false });
    expect(conflicting.headers).not.toHaveProperty('etag');
    expect(handler).toHaveBeenCalledTimes(1);
    const durable = await state();
    expect(durable.row).toEqual({ revision: 4, note: 'committed' });
    expect(durable.keys).toBe(1);
    expect(durable.audit).toHaveLength(1);
  });

  it('rolls back a handler write and emits no ETag or durable audit/key', async () => {
    const failed = await send('rollback', 'if-match-rollback', '"4"');
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(failed.headers).not.toHaveProperty('etag');
    expect(handler).toHaveBeenCalledExactlyOnceWith('rollback', 4);
    expect(await state()).toEqual({
      row: { revision: 4, note: 'initial' }, audit: [], keys: 0,
    });
  });
});
