import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { lastValueFrom, Observable } from 'rxjs';
import { StynxDataModule, Database } from '@stynx/data';
import { STYNX_IDEMPOTENT_ROUTE } from '../../src/constants';
import { DatabaseIdempotencyStore } from '../../src/database-idempotency.store';
import { IdempotencyInterceptor } from '../../src/idempotency.interceptor';
import { InMemoryIdempotencyMetrics } from '../../src/metrics';
import { RedisIdempotencyBackend } from '../../src/redis-idempotency.backend';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { startRedisDockerContainer, stopRedisDockerContainer, type RedisDockerContainer } from '../../../../test/support/redis-docker';

function createExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  handler: Function,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => handler,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function createResponseStub() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

describe('Idempotency integration', () => {

  let redis: RedisDockerContainer | undefined;
  let postgres: PostgresTestDatabase | undefined;
  let database: Database | undefined;
  let moduleRef: TestingModule | undefined;
  let store: DatabaseIdempotencyStore;
  let backend: RedisIdempotencyBackend;
  let reflector: Reflector;
  let handler: Function;

  beforeAll(async () => {
    redis = await startRedisDockerContainer();
    postgres = await createPostgresTestDatabase('stynx_idempotency');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('@stynx/idempotency:owner') },
            app: { connectionString: postgres.connectionString('@stynx/idempotency:app') },
            reader: { connectionString: postgres.connectionString('@stynx/idempotency:reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`
        insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values
          ('01978f4a-32bf-7c27-a131-fd73a9e004a1', 'tenant-idempotency-1', 'Tenant Idempotency 1', true, clock_timestamp(), clock_timestamp()),
          ('01978f4a-32bf-7c27-a131-fd73a9e004a2', 'tenant-idempotency-2', 'Tenant Idempotency 2', true, clock_timestamp(), clock_timestamp()),
          ('01978f4a-32bf-7c27-a131-fd73a9e004a3', 'tenant-idempotency-3', 'Tenant Idempotency 3', true, clock_timestamp(), clock_timestamp())
      `);
    } finally {
      await admin.end();
    }
    store = new DatabaseIdempotencyStore(database, { ttlMs: 86_400_000 });
    backend = new RedisIdempotencyBackend({
      redis: { url: `redis://${redis.host}:${redis.port}`, keyPrefix: 'stynx:test:idempotency' },
    });
    await backend.onModuleInit();
    reflector = new Reflector();
    handler = function idempotentHandler() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_IDEMPOTENT_ROUTE, { headerName: 'Idempotency-Key' }, handler);
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
    if (backend) {
      await backend.onModuleDestroy();
    }
    await stopRedisDockerContainer(redis);
    await postgres?.dispose();
  }, 60_000);

  it('replays the exact response on the second call', async () => {
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, backend, new InMemoryIdempotencyMetrics());
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: '01978f4a-32bf-7c27-a131-fd73a9e004a1',
      actor: { id: '01978f4a-32bf-7c27-a131-fd73a9e004b1' },
      headers: { 'Idempotency-Key': 'same-key' },
      body: { value: 1 },
    };

    const first = await lastValueFrom(
      interceptor.intercept(
        createExecutionContext(request, createResponseStub(), handler),
        { handle: () => new Observable((subscriber) => { subscriber.next({ ok: true }); subscriber.complete(); }) } as CallHandler,
      ),
    );
    const secondResponse = createResponseStub();
    const second = await lastValueFrom(
      interceptor.intercept(
        createExecutionContext(request, secondResponse, handler),
        { handle: () => new Observable((subscriber) => { subscriber.next({ shouldNotRun: true }); subscriber.complete(); }) } as CallHandler,
      ),
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(secondResponse.headers['Idempotency-Replayed']).toBe('true');
  });

  it('blocks concurrent identical requests until the first finishes and then replays', async () => {
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, backend, new InMemoryIdempotencyMetrics());
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: '01978f4a-32bf-7c27-a131-fd73a9e004a2',
      actor: { id: '01978f4a-32bf-7c27-a131-fd73a9e004b2' },
      headers: { 'Idempotency-Key': 'concurrent-key' },
      body: { value: 2 },
    };

    let release: (() => void) | undefined;
    let readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const firstNext: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          release = () => {
            subscriber.next({ ok: 'done' });
            subscriber.complete();
          };
          readyResolve?.();
        }),
    };

    const firstPromise = lastValueFrom(
      interceptor.intercept(createExecutionContext(request, createResponseStub(), handler), firstNext),
    );

    const secondPromise = lastValueFrom(
      interceptor.intercept(
        createExecutionContext(request, createResponseStub(), handler),
        { handle: () => new Observable((subscriber) => { subscriber.next({ shouldNotRun: true }); subscriber.complete(); }) } as CallHandler,
      ),
    );

    await ready;
    release?.();
    await expect(firstPromise).resolves.toEqual({ ok: 'done' });
    await expect(secondPromise).resolves.toEqual({ ok: 'done' });
  });

  it('returns 422 for body mismatch and does not store 5xx responses', async () => {
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, backend, new InMemoryIdempotencyMetrics());
    const baseRequest = {
      method: 'POST',
      url: '/v1/items',
      tenantId: '01978f4a-32bf-7c27-a131-fd73a9e004a3',
      actor: { id: '01978f4a-32bf-7c27-a131-fd73a9e004b3' },
      headers: { 'Idempotency-Key': 'mismatch-key' },
    };

    await lastValueFrom(
      interceptor.intercept(
        createExecutionContext({ ...baseRequest, body: { value: 1 } }, createResponseStub(), handler),
        { handle: () => new Observable((subscriber) => { subscriber.next({ ok: true }); subscriber.complete(); }) } as CallHandler,
      ),
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createExecutionContext({ ...baseRequest, body: { value: 2 } }, createResponseStub(), handler),
          { handle: () => new Observable((subscriber) => { subscriber.next({ shouldNotRun: true }); subscriber.complete(); }) } as CallHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createExecutionContext({ ...baseRequest, headers: { 'Idempotency-Key': 'retry-key' }, body: { value: 3 } }, createResponseStub(), handler),
          { handle: () => new Observable((subscriber) => { subscriber.error(new HttpException({ message: 'boom' }, 500)); }) } as CallHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createExecutionContext({ ...baseRequest, headers: { 'Idempotency-Key': 'retry-key' }, body: { value: 3 } }, createResponseStub(), handler),
          { handle: () => new Observable((subscriber) => { subscriber.next({ ok: 'retry' }); subscriber.complete(); }) } as CallHandler,
        ),
      ),
    ).resolves.toEqual({ ok: 'retry' });
  });
});
