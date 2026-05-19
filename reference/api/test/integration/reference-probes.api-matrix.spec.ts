import { createHash, generateKeyPairSync } from 'node:crypto';
import { Global, Logger, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type IdempotencyBackend,
  type IdempotencyDecisionContext,
  type IdempotencyStoredEntry,
} from '@stynx/idempotency';
import {
  type RateLimitDecision,
  type RateLimitDecisionContext,
  type RateLimitStore,
} from '@stynx/ratelimit';
import {
  PermissionCache,
  PermissionCacheMetrics,
  PermissionGuard,
  PermissionQueryService,
  resolveAuthOptions,
  STYNX_AUTH_OPTIONS,
  STYNX_PERMISSION_CACHE_BACKEND,
  StynxAuthGuard,
  StynxJwtValidator,
} from '@stynx/auth';
import { StynxPlatformPipelineModule } from '@stynx/backend';
import { Database, StynxDataModule } from '@stynx/data';
import { SessionJwtSigningService, SessionService, type StynxSessionSigningKeySet } from '@stynx/sessions';
import { mintTestSession } from '@stynx/testing';
import request from 'supertest';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../packages/data/test/support/postgres';
import { ReferenceProbesController } from '../../src/sample/reference-probes.controller';

const tenantA = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
const adminAUser = '01978f4a-32bf-7c27-a131-fd73a9e002a1';
const readerAUser = '01978f4a-32bf-7c27-a131-fd73a9e002a2';
const noPermAUser = '01978f4a-32bf-7c27-a131-fd73a9e002a4';
const adminAMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a1';
const readerAMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a2';
const noPermAMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a4';

let activeJwks: unknown = { keys: [] };

@Global()
@Module({
  providers: [
    {
      provide: STYNX_AUTH_OPTIONS,
      useValue: resolveAuthOptions({
        stynx: {
          issuer: 'https://reference-api.test',
        },
      }),
    },
    {
      provide: STYNX_PERMISSION_CACHE_BACKEND,
      useValue: null,
    },
    {
      provide: SessionJwtSigningService,
      useValue: {
        getJwks: async () => activeJwks,
      },
    },
    {
      provide: SessionService,
      useValue: {
        get: async () => ({ status: 'active' }),
      },
    },
    StynxJwtValidator,
    PermissionCacheMetrics,
    PermissionQueryService,
    PermissionCache,
    StynxAuthGuard,
    PermissionGuard,
  ],
  exports: [
    STYNX_AUTH_OPTIONS,
    STYNX_PERMISSION_CACHE_BACKEND,
    SessionJwtSigningService,
    SessionService,
    StynxJwtValidator,
    PermissionCacheMetrics,
    PermissionQueryService,
    PermissionCache,
    StynxAuthGuard,
    PermissionGuard,
  ],
})
class ProbeApiMatrixAuthModule {}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { resetAtEpochMs: number; used: number }>();

  async consume(context: RateLimitDecisionContext): Promise<RateLimitDecision> {
    const nowMs = Date.now();
    const current = this.buckets.get(context.bucketKey);
    const active = current && current.resetAtEpochMs > nowMs
      ? current
      : { resetAtEpochMs: nowMs + context.ttlMs, used: 0 };
    const nextUsed = active.used + context.cost;
    if (nextUsed > context.limit) {
      this.buckets.set(context.bucketKey, active);
      return {
        allowed: false,
        limit: context.limit,
        remaining: Math.max(context.limit - active.used, 0),
        resetAtEpochMs: active.resetAtEpochMs,
        retryAfterSeconds: Math.max(1, Math.ceil((active.resetAtEpochMs - nowMs) / 1000)),
        used: active.used,
      };
    }
    const updated = { ...active, used: nextUsed };
    this.buckets.set(context.bucketKey, updated);
    return {
      allowed: true,
      limit: context.limit,
      remaining: Math.max(context.limit - updated.used, 0),
      resetAtEpochMs: updated.resetAtEpochMs,
      retryAfterSeconds: Math.max(1, Math.ceil((updated.resetAtEpochMs - nowMs) / 1000)),
      used: updated.used,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

class MemoryIdempotencyBackend implements IdempotencyBackend {
  private readonly entries = new Map<string, IdempotencyStoredEntry>();
  private readonly locks = new Map<string, string>();

  async get(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null> {
    const entry = this.entries.get(context.compositeKey);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(context.compositeKey);
      return null;
    }
    return entry;
  }

  async set(context: IdempotencyDecisionContext, entry: IdempotencyStoredEntry): Promise<void> {
    this.entries.set(context.compositeKey, entry);
  }

  async acquireLock(context: IdempotencyDecisionContext, token: string): Promise<boolean> {
    if (this.locks.has(context.compositeKey)) {
      return false;
    }
    this.locks.set(context.compositeKey, token);
    return true;
  }

  async releaseLock(context: IdempotencyDecisionContext, token: string): Promise<void> {
    if (this.locks.get(context.compositeKey) === token) {
      this.locks.delete(context.compositeKey);
    }
  }

  async isLocked(context: IdempotencyDecisionContext): Promise<boolean> {
    return this.locks.has(context.compositeKey);
  }

  clear(): void {
    this.entries.clear();
    this.locks.clear();
  }
}

function now(): string {
  return new Date().toISOString();
}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'reference-probes-api-matrix-key-1',
    keys: [
      {
        kid: 'reference-probes-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedProbeState(database: PostgresTestDatabase): Promise<void> {
  const client = await database.connectAsAdmin();
  const stamp = now();
  try {
    await client.query(
      `
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values ($1::uuid, 'probe-tenant-a', 'Probe Tenant A', 'active', true, $2::timestamptz, $2::timestamptz)
      `,
      [tenantA, stamp],
    );
    await client.query(
      `
        insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
        values
          ($1::uuid, 'probe-admin-a@example.com', 'probe-cognito-admin-a', 'en', $4::timestamptz, $4::timestamptz),
          ($2::uuid, 'probe-reader-a@example.com', 'probe-cognito-reader-a', 'en', $4::timestamptz, $4::timestamptz),
          ($3::uuid, 'probe-no-perm-a@example.com', 'probe-cognito-no-perm-a', 'en', $4::timestamptz, $4::timestamptz)
      `,
      [adminAUser, readerAUser, noPermAUser, stamp],
    );
    await client.query(
      `
        insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
        values
          ($1::uuid, $4::uuid, $5::uuid, null, 0, true, $7::timestamptz),
          ($2::uuid, $4::uuid, $6::uuid, null, 0, true, $7::timestamptz),
          ($3::uuid, $4::uuid, $8::uuid, null, 0, true, $7::timestamptz)
      `,
      [adminAMembership, readerAMembership, noPermAMembership, tenantA, adminAUser, readerAUser, stamp, noPermAUser],
    );
    await client.query(
      `
        insert into auth.perms (id, key, description)
        values (gen_random_uuid(), 'sample:probe:read', 'Run internal probe routes')
        on conflict (key) do nothing
      `,
    );
    for (const membership of [adminAMembership, readerAMembership]) {
      await client.query(
        `
          insert into auth.direct_perms (id, membership_id, perm_id, effect)
          select gen_random_uuid(), $1::uuid, perm.id, 'allow'
          from auth.perms perm
          where perm.key = 'sample:probe:read'
        `,
        [membership],
      );
    }
  } finally {
    await client.end();
  }
}

describe('ReferenceProbesController API error matrix', () => {
  let postgres: PostgresTestDatabase;
  let app: INestApplication;
  let database: Database;
  let adminAToken = '';
  let readerAToken = '';
  let noPermAToken = '';
  let idempotencyCounter = 0;
  const keySet = buildKeySet();
  const rateLimitStore = new MemoryRateLimitStore();
  const idempotencyBackend = new MemoryIdempotencyBackend();

  function authGet(token: string, path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${token}`);
  }

  function nextIdempotencyKey(prefix: string): string {
    idempotencyCounter += 1;
    return `${prefix}-${idempotencyCounter}`;
  }

  async function createDirectToken(userId: string): Promise<string> {
    const session = await mintTestSession({
      userId,
      tenantId: tenantA,
      issuer: 'https://reference-api.test',
      keySet,
    });
    activeJwks = session.jwks;
    return session.token;
  }

  async function withSuppressedReadonlyLog(fn: () => Promise<void>): Promise<void> {
    const expectedErrorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await fn();
    } finally {
      expectedErrorLog.mockRestore();
    }
  }

  async function setReadonlyProbeLimit(limit: number): Promise<void> {
    await database.withSystemContext('reference probe matrix rate-limit override', async () =>
      database.tx(
        async (trx) => {
          await trx.query(
            `
              insert into core.config (key, tenant_id, value, updated_at)
              values (
                'ratelimit.sample.probes.readonly',
                null,
                jsonb_build_object('limit', $1::int, 'windowSeconds', 60),
                clock_timestamp()
              )
              on conflict (key)
              do update set value = excluded.value, updated_at = excluded.updated_at
            `,
            [limit],
          );
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('reference_api_probes');

    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('@stynx/reference-api-probes:owner') },
            app: { connectionString: postgres.connectionString('@stynx/reference-api-probes:app') },
            reader: { connectionString: postgres.connectionString('@stynx/reference-api-probes:reader') },
          },
          migrations: { enabled: true },
        }),
        ProbeApiMatrixAuthModule,
        StynxPlatformPipelineModule.forRoot({
          rateLimit: {
            defaultLimit: 120,
            defaultWindowSeconds: 60,
            store: rateLimitStore,
          },
          idempotency: {
            ttlMs: 24 * 60 * 60 * 1000,
            backend: idempotencyBackend,
          },
          sla: false,
        }),
      ],
      controllers: [ReferenceProbesController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    database = moduleRef.get(Database);

    await seedProbeState(postgres);
    adminAToken = await createDirectToken(adminAUser);
    readerAToken = await createDirectToken(readerAUser);
    noPermAToken = await createDirectToken(noPermAUser);
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  });

  beforeEach(() => {
    rateLimitStore.clear();
    idempotencyBackend.clear();
  });

  describe('GET /_probes/data-tx', () => {
    it('returns 200 with the data transaction overhead header for a valid STYNX token', async () => {
      await authGet(adminAToken, '/_probes/data-tx')
        .expect(200)
        .expect(({ body, headers }) => {
          expect(body).toEqual({
            status: 'ok',
            dataTxOverheadStatistic: 'trimmed_min',
          });
          expect(headers['x-stynx-data-tx-overhead-ms']).toEqual(expect.any(String));
        });
    });

    it('returns 400 when the route-local STYNX bearer token is missing', async () => {
      await request(app.getHttpServer())
        .get('/_probes/data-tx')
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });
  });

  describe('POST /_probes/idempotency', () => {
    it('returns 201 and persists the idempotency response for a valid key', async () => {
      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .set('Idempotency-Key', nextIdempotencyKey('probe-ok'))
        .send({ status: 'first' })
        .expect(201)
        .expect(({ body, headers }) => {
          expect(body).toEqual({ status: 'ok' });
          expect(headers['x-stynx-idempotency-lookup-ms']).toEqual(expect.any(String));
        });
    });

    it('returns 400 when the idempotency key is missing', async () => {
      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .send({ status: 'missing-key' })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('Idempotency-Key header is required for idempotent routes');
        });
    });

    it('returns 201 with replay headers when the same key and body are replayed', async () => {
      const key = nextIdempotencyKey('probe-replay');
      const body = { digest: createHash('sha256').update(key).digest('hex') };

      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201)
        .expect(({ body: responseBody, headers }) => {
          expect(responseBody).toEqual({ status: 'ok' });
          expect(headers['idempotency-replayed']).toBe('true');
          expect(headers['x-idempotency-key']).toBe(key);
        });
    });

    it('returns 422 when the same idempotency key is replayed with a different body', async () => {
      const key = nextIdempotencyKey('probe-mismatch');

      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .set('Idempotency-Key', key)
        .send({ status: 'original' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/_probes/idempotency')
        .set('Idempotency-Key', key)
        .send({ status: 'changed' })
        .expect(422)
        .expect(({ body }) => {
          expect(body.message).toBe('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
        });
    });
  });

  describe('GET /_probes/ratelimit', () => {
    it('returns 200 with rate-limit probe timing headers', async () => {
      await request(app.getHttpServer())
        .get('/_probes/ratelimit')
        .expect(200)
        .expect(({ body, headers }) => {
          expect(body).toMatchObject({
            status: 'ok',
            rateLimitOverheadStatistic: 'trimmed_min',
          });
          expect(body.rateLimitOverheadSamplesMs).toHaveLength(9);
          expect(headers['x-stynx-ratelimit-overhead-ms']).toEqual(expect.any(String));
        });
    });
  });

  describe('GET /_probes/readonly-write', () => {
    it('returns 401 when the protected readonly probe is called without a bearer token', async () => {
      await request(app.getHttpServer())
        .get('/_probes/readonly-write')
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the actor lacks sample:probe:read', async () => {
      await authGet(noPermAToken, '/_probes/readonly-write')
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission sample:probe:read');
        });
    });

    it('returns 429 after the tenant readonly probe bucket is exhausted', async () => {
      await setReadonlyProbeLimit(1);

      await withSuppressedReadonlyLog(async () => {
        await authGet(readerAToken, '/_probes/readonly-write')
          .expect(500)
          .expect(({ body }) => {
            expect(body.code).toBe('READONLY_VIOLATION');
          });
      });

      await authGet(readerAToken, '/_probes/readonly-write')
        .expect(429)
        .expect(({ body, headers, text }) => {
          expect(`${JSON.stringify(body)} ${text}`).toContain('Rate limit exceeded');
          expect(headers['retry-after']).toEqual(expect.any(String));
        });
    });

    it('returns 500 READONLY_VIOLATION for an authorized readonly write attempt', async () => {
      await withSuppressedReadonlyLog(async () => {
        await authGet(readerAToken, '/_probes/readonly-write')
          .expect(500)
          .expect(({ body }) => {
            expect(body).toMatchObject({
              code: 'READONLY_VIOLATION',
              message: 'Read-only transaction cannot execute a write statement',
            });
          });
      });
    });
  });
});
