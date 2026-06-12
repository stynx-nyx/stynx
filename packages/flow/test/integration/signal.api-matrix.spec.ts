import { generateKeyPairSync } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import {
  AuditInterceptor,
  StynxAuditModule,
  StynxPlatformPipelineModule,
  type IdempotencyBackend,
  type IdempotencyDecisionContext,
  type IdempotencyStoredEntry,
  type RateLimitDecision,
  type RateLimitDecisionContext,
  type RateLimitStore,
} from '@stynx/backend';
import { generateRequestId, StynxCoreModule } from '@stynx/core';
import type { AuditEventEnvelope, AuditSink } from '@stynx/contracts';
import {
  SessionJwtSigningService,
  SessionService,
  type StynxSessionSigningKeySet,
} from '@stynx/sessions';
import request from 'supertest';
import { z } from 'zod';
import { StynxFlowModule } from '../../src/flow.module';
import {
  createStynxFixtures,
  createTestApp,
  mintTestSession,
  type TestAppContext,
} from '@stynx/testing';

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832b';
const FLOW_RUNTIME_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28420';
const FLOW_RUNTIME_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28520';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28620';
const GRAPH_ID = '0197481e-7294-7c53-8b03-5c36d7c28621';
const RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28622';

let activeJwks: unknown = { keys: [] };

class FlowSignalRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number>();
  private allowedRequests = Number.POSITIVE_INFINITY;

  reset(allowedRequests = Number.POSITIVE_INFINITY): void {
    this.hits.clear();
    this.allowedRequests = allowedRequests;
  }

  async consume(context: RateLimitDecisionContext): Promise<RateLimitDecision> {
    const used = (this.hits.get(context.bucketKey) ?? 0) + context.cost;
    this.hits.set(context.bucketKey, used);
    const limit = Number.isFinite(this.allowedRequests) ? this.allowedRequests : context.limit;
    const allowed = used <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(limit - used, 0),
      resetAtEpochMs: Date.now() + context.ttlMs,
      retryAfterSeconds: Math.max(1, Math.ceil(context.ttlMs / 1000)),
      used,
    };
  }
}

class RecordingAuditSink implements AuditSink {
  readonly events: AuditEventEnvelope[] = [];

  async write(event: AuditEventEnvelope): Promise<void> {
    this.events.push(event);
  }

  reset(): void {
    this.events.length = 0;
  }
}

class FlowSignalIdempotencyBackend implements IdempotencyBackend {
  private readonly entries = new Map<string, IdempotencyStoredEntry>();
  private readonly locks = new Map<string, string>();

  reset(): void {
    this.entries.clear();
    this.locks.clear();
  }

  async get(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null> {
    return this.entries.get(context.compositeKey) ?? null;
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
}

const rateLimitStore = new FlowSignalRateLimitStore();
const auditSink = new RecordingAuditSink();
const idempotencyBackend = new FlowSignalIdempotencyBackend();

@Global()
@Module({
  providers: [
    {
      provide: STYNX_AUTH_OPTIONS,
      useValue: resolveAuthOptions({
        stynx: {
          issuer: 'https://stynx.testing.local',
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
class FlowSignalApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-signal-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-signal-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowSignalRuntime(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({
    id: TENANT_ID,
    slug: 'flow-signal-api-matrix',
    name: 'Flow Signal API Matrix',
  });
  await fixtures.createUser({
    id: ADMIN_USER_ID,
    email: 'flow-signal-api-matrix-admin@example.com',
  });
  await fixtures.createUser({
    id: VIEWER_USER_ID,
    email: 'flow-signal-api-matrix-viewer@example.com',
  });
  await fixtures.createMembership({
    id: ADMIN_MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: ADMIN_USER_ID,
  });
  await fixtures.createMembership({
    id: VIEWER_MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: VIEWER_USER_ID,
  });

  const admin = await testApp.adminClient();
  try {
    await admin.query(
      `
        insert into auth.perms (id, key, description)
        values ($1::uuid, 'flow:read:runtime', 'Read flow runtime')
      `,
      [FLOW_RUNTIME_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.roles (id, tenant_id, key, name)
        values ($1::uuid, $2::uuid, 'flow-runtime-reader', 'Flow Runtime Reader')
      `,
      [FLOW_RUNTIME_ROLE_ID, TENANT_ID],
    );
    await admin.query(
      `
        insert into auth.role_perms (role_id, perm_id)
        values ($1::uuid, $2::uuid)
      `,
      [FLOW_RUNTIME_ROLE_ID, FLOW_RUNTIME_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.membership_roles (membership_id, role_id)
        values ($1::uuid, $2::uuid)
      `,
      [ADMIN_MEMBERSHIP_ID, FLOW_RUNTIME_ROLE_ID],
    );
    await admin.query(
      `
        insert into flow.scopes (
          id,
          tenant_id,
          code,
          label,
          adapter_key,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          'flow-signal-api-matrix',
          'Flow Signal API Matrix',
          'test',
          $3::uuid,
          $3::uuid,
          clock_timestamp(),
          clock_timestamp()
        )
      `,
      [SCOPE_ID, TENANT_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.graphs (
          id,
          tenant_id,
          scope_id,
          code,
          version,
          is_active,
          name,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          'approval',
          'v1',
          true,
          'Approval',
          $4::uuid,
          $4::uuid,
          clock_timestamp(),
          clock_timestamp()
        )
      `,
      [GRAPH_ID, TENANT_ID, SCOPE_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.runs (
          id,
          tenant_id,
          scope_id,
          graph_id,
          adapter_key,
          target_type,
          target_id,
          status,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          'test',
          'case',
          'case-1',
          'active',
          $5::uuid,
          $5::uuid,
          clock_timestamp(),
          clock_timestamp()
        )
      `,
      [RUN_ID, TENANT_ID, SCOPE_ID, GRAPH_ID, ADMIN_USER_ID],
    );
  } finally {
    await admin.end();
  }
}

describe('FlowSignalController API error matrix', () => {
  let testApp: TestAppContext;
  let adminAuthorization: string;
  let viewerAuthorization: string;

  beforeAll(async () => {
    const keySet = buildKeySet();
    const adminSession = await mintTestSession({
      keySet,
      userId: ADMIN_USER_ID,
      tenantId: TENANT_ID,
    });
    const viewerSession = await mintTestSession({
      keySet,
      userId: VIEWER_USER_ID,
      tenantId: TENANT_ID,
    });
    activeJwks = adminSession.jwks;
    adminAuthorization = `Bearer ${adminSession.token}`;
    viewerAuthorization = `Bearer ${viewerSession.token}`;

    testApp = await createTestApp({
      localstack: { enabled: false },
      overrides: {
        imports: [
          StynxCoreModule.forRoot({
            appName: 'flow-signal-api-matrix',
            schema: z.object({}),
          }),
          FlowSignalApiMatrixAuthModule,
          StynxPlatformPipelineModule.forRoot({
            rateLimit: {
              store: rateLimitStore,
              defaults: {
                'flow.signal': { limit: 100, windowSeconds: 60 },
              },
            },
            sla: false,
            idempotency: {
              backend: idempotencyBackend,
              waitAttempts: 1,
              waitIntervalMs: 1,
            },
          }),
          StynxAuditModule.forRoot({ sink: auditSink }),
          StynxFlowModule,
        ],
        providers: [
          {
            provide: APP_INTERCEPTOR,
            useExisting: AuditInterceptor,
          },
        ],
      },
    });

    await seedFlowSignalRuntime(testApp);
  }, 60_000);

  afterAll(async () => {
    await testApp?.teardown();
  });

  beforeEach(() => {
    rateLimitStore.reset();
    auditSink.reset();
    idempotencyBackend.reset();
  });

  function headers(
    authorization = adminAuthorization,
    idempotencyKey = `flow-signal-${generateRequestId()}`,
  ): Record<string, string> {
    return {
      authorization,
      'idempotency-key': idempotencyKey,
      'x-request-id': generateRequestId(),
    };
  }

  function validBody(targetId = 'case-1'): Record<string, unknown> {
    return {
      scopeCode: 'flow-signal-api-matrix',
      targetType: 'case',
      targetId,
      payload: {
        source: 'api-matrix',
      },
    };
  }

  describe('POST /flow/signal', () => {
    it('returns 201 after signaling an active flow target', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(requestHeaders)
        .send(validBody())
        .expect(201)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            scopeId: SCOPE_ID,
            targetType: 'case',
            targetId: 'case-1',
            signaled: true,
          });
        });

      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.signal',
          entity: 'flow.runs',
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 400 when the body fails flow signal validation', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers())
        .send({
          scopeCode: 'flow-signal-api-matrix',
          targetType: 'case',
          targetId: 42,
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            code: 'FLOW_VALIDATION_ERROR',
            issues: expect.any(Array),
          });
        });
    });

    it('returns 401 when the bearer token is missing', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set({
          'idempotency-key': `flow-signal-${generateRequestId()}`,
          'x-request-id': generateRequestId(),
        })
        .send(validBody())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow runtime permission', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers(viewerAuthorization))
        .send(validBody())
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:read:runtime');
        });
    });

    it('returns 404 when the referenced flow scope does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers())
        .send({
          scopeCode: 'missing-flow-signal-scope',
          targetType: 'case',
          targetId: 'case-1',
        })
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Scope not found');
        });
    });

    it('returns 422 when an idempotency key is reused with a different body', async () => {
      const idempotencyKey = `flow-signal-${generateRequestId()}`;

      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers(adminAuthorization, idempotencyKey))
        .send(validBody('case-idempotent-1'))
        .expect(201);

      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers(adminAuthorization, idempotencyKey))
        .send(validBody('case-idempotent-2'))
        .expect(422)
        .expect(({ body }) => {
          expect(body.message).toBe('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
        });
    });

    it('returns 429 when the flow signal tenant bucket is exhausted', async () => {
      rateLimitStore.reset(1);

      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers())
        .send(validBody('case-rate-limit-1'))
        .expect(201);

      await request(testApp.app.getHttpServer())
        .post('/flow/signal')
        .set(headers())
        .send(validBody('case-rate-limit-2'))
        .expect(429)
        .expect((response) => {
          expect(response.text).toContain('Rate limit exceeded');
        });
    });
  });
});
