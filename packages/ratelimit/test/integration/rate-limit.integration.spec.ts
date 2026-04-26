import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { StynxDataModule, Database } from '@stynx/data';
import { STYNX_RATE_LIMIT_ROUTE } from '../../src/constants';
import { InMemoryRateLimitMetrics } from '../../src/metrics';
import { DatabaseRateLimitPolicyResolver } from '../../src/rate-limit-policy.service';
import { RateLimitGuard } from '../../src/rate-limit.guard';
import { RedisSlidingWindowRateLimitStore } from '../../src/redis-rate-limit.store';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { startRedisDockerContainer, stopRedisDockerContainer, type RedisDockerContainer } from '../../../../test/support/redis-docker';

function createExecutionContext(request: Record<string, unknown>, handler: Function): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('Rate limit integration', () => {
  jest.setTimeout(120_000);

  let redis: RedisDockerContainer | undefined;
  let databaseRef: Database | undefined;
  let postgres: PostgresTestDatabase | undefined;

  beforeAll(async () => {
    redis = await startRedisDockerContainer();
    postgres = await createPostgresTestDatabase('stynx_ratelimit');
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('@stynx/ratelimit:owner') },
            app: { connectionString: postgres.connectionString('@stynx/ratelimit:app') },
            reader: { connectionString: postgres.connectionString('@stynx/ratelimit:reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    databaseRef = moduleRef.get(Database);

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`
        insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ('01978f4a-32bf-7c27-a131-fd73a9e003a1', 'tenant-ratelimit', 'Tenant Rate Limit', true, clock_timestamp(), clock_timestamp())
      `);
      await admin.query(`
        insert into core.config (key, value, updated_at)
        values ('ratelimit.documents.write', '{"limit":100,"windowSeconds":60}'::jsonb, clock_timestamp())
      `);
      await admin.query(`
        insert into core.rate_limit_overrides (id, tenant_id, bucket, scope, limit_value, window_seconds, updated_at)
        values (
          '01978f4a-32bf-7c27-a131-fd73a9e003f1',
          '01978f4a-32bf-7c27-a131-fd73a9e003a1',
          'tenant',
          'documents.write',
          150,
          60,
          clock_timestamp()
        )
      `);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await stopRedisDockerContainer(redis);
    await postgres?.dispose();
  });

  it('applies per-tenant overrides via core.rate_limit_overrides', async () => {
    const resolver = new DatabaseRateLimitPolicyResolver(
      { redis: { url: `redis://127.0.0.1:${redis?.port}`, keyPrefix: 'stynx:test:ratelimit' } },
      databaseRef,
    );

    const resolved = await resolver.resolve(
      { headers: {}, tenantId: '01978f4a-32bf-7c27-a131-fd73a9e003a1' },
      { bucket: 'tenant', scope: 'documents.write' },
    );

    expect(resolved.limit).toBe(150);
    expect(resolved.windowSeconds).toBe(60);
  });

  it('keeps Redis sliding-window atomic under 1000 concurrent hits', async () => {
    const store = new RedisSlidingWindowRateLimitStore({
      redis: { url: `redis://127.0.0.1:${redis?.port}`, keyPrefix: 'stynx:test:ratelimit' },
    });
    await store.onModuleInit();
    try {
      const decisions = await Promise.all(
        Array.from({ length: 1000 }, () =>
          store.consume({
            request: { headers: {}, tenantId: '01978f4a-32bf-7c27-a131-fd73a9e003a1', ip: '127.0.0.1' },
            bucketKey: 'documents.write:tenant:01978f4a-32bf-7c27-a131-fd73a9e003a1',
            tenantId: '01978f4a-32bf-7c27-a131-fd73a9e003a1',
            ttlMs: 60_000,
            scope: 'documents.write',
            cost: 1,
            limit: 100,
            bucket: 'tenant',
          }),
        ),
      );

      const allowed = decisions.filter((decision) => decision.allowed).length;
      const blocked = decisions.length - allowed;
      expect(allowed).toBe(100);
      expect(blocked).toBe(900);
    } finally {
      await store.onModuleDestroy();
    }
  });

  it('emits headers and blocks above the resolved limit', async () => {
    const handler = function limited() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 'documents.write' }, handler);
    const response = {
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
    };

    const store = new RedisSlidingWindowRateLimitStore({
      redis: { url: `redis://127.0.0.1:${redis?.port}`, keyPrefix: 'stynx:test:ratelimit:guard' },
    });
    await store.onModuleInit();
    const resolver = new DatabaseRateLimitPolicyResolver(
      { redis: { url: `redis://127.0.0.1:${redis?.port}`, keyPrefix: 'stynx:test:ratelimit:guard' } },
      databaseRef,
    );
    const metrics = new InMemoryRateLimitMetrics();
    const guard = new RateLimitGuard(new Reflector(), { distributedStrict: true }, store, resolver, metrics);

    try {
      for (let i = 0; i < 150; i += 1) {
        await expect(
          guard.canActivate(
            createExecutionContext(
              {
                headers: {},
                method: 'POST',
                path: '/documents',
                tenantId: '01978f4a-32bf-7c27-a131-fd73a9e003a1',
                ip: '127.0.0.1',
                res: response,
              },
              handler,
            ),
          ),
        ).resolves.toBe(true);
      }

      await expect(
        guard.canActivate(
          createExecutionContext(
            {
              headers: {},
              method: 'POST',
              path: '/documents',
              tenantId: '01978f4a-32bf-7c27-a131-fd73a9e003a1',
              ip: '127.0.0.1',
              res: response,
            },
            handler,
          ),
        ),
      ).rejects.toBeTruthy();

      expect(response.headers['X-RateLimit-Limit']).toBe('150');
      expect(response.headers['Retry-After']).toBeTruthy();
      expect(metrics.snapshot()).toEqual({ 'documents.write': 1 });
    } finally {
      await store.onModuleDestroy();
    }
  });
});
