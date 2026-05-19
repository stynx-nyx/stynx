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
import { SessionJwtSigningService, SessionService, type StynxSessionSigningKeySet } from '@stynx/sessions';
import request from 'supertest';
import { z } from 'zod';
import { StynxFlowModule } from '../../src/flow.module';
import { FLOW_DOMAIN_ADAPTERS } from '../../src/tokens';
import type { FlowDomainAdapter, FlowEffectInput } from '../../src/adapters';
import {
  createStynxFixtures,
  createTestApp,
  mintTestSession,
  type TestAppContext,
} from '../../../testing/src';

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832b';
const FLOW_ADMIN_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28430';
const FLOW_ADMIN_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28530';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28630';
const GRAPH_ID = '0197481e-7294-7c53-8b03-5c36d7c28631';
const RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28632';
const NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28633';
const EFFECT_EVENT_ID = '0197481e-7294-7c53-8b03-5c36d7c28634';

let activeJwks: unknown = { keys: [] };

class FlowEffectsRateLimitStore implements RateLimitStore {
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
    return {
      allowed: used <= limit,
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

class FlowEffectsIdempotencyBackend implements IdempotencyBackend {
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

class RecordingEffectAdapter implements FlowDomainAdapter {
  readonly key = 'test';
  readonly effects: FlowEffectInput[] = [];

  async buildFacts(): Promise<Record<string, never>> {
    return {};
  }

  async applyEffect(input: FlowEffectInput): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
    this.effects.push(input);
    return { ok: true, payload: { delivered: true } };
  }

  async canView(): Promise<boolean> {
    return true;
  }

  async canManage(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.effects.length = 0;
  }
}

const rateLimitStore = new FlowEffectsRateLimitStore();
const auditSink = new RecordingAuditSink();
const idempotencyBackend = new FlowEffectsIdempotencyBackend();
const effectAdapter = new RecordingEffectAdapter();

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
    {
      provide: FLOW_DOMAIN_ADAPTERS,
      useValue: [effectAdapter],
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
    FLOW_DOMAIN_ADAPTERS,
    StynxJwtValidator,
    PermissionCacheMetrics,
    PermissionQueryService,
    PermissionCache,
    StynxAuthGuard,
    PermissionGuard,
  ],
})
class FlowEffectsApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-effects-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-effects-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowEffectsRuntime(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({ id: TENANT_ID, slug: 'flow-effects-api-matrix', name: 'Flow Effects API Matrix' });
  await fixtures.createUser({ id: ADMIN_USER_ID, email: 'flow-effects-api-matrix-admin@example.com' });
  await fixtures.createUser({ id: VIEWER_USER_ID, email: 'flow-effects-api-matrix-viewer@example.com' });
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
        values ($1::uuid, 'flow:admin:*', 'Administer flow runtime effects')
      `,
      [FLOW_ADMIN_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.roles (id, tenant_id, key, name)
        values ($1::uuid, $2::uuid, 'flow-admin', 'Flow Admin')
      `,
      [FLOW_ADMIN_ROLE_ID, TENANT_ID],
    );
    await admin.query(
      `
        insert into auth.role_perms (role_id, perm_id)
        values ($1::uuid, $2::uuid)
      `,
      [FLOW_ADMIN_ROLE_ID, FLOW_ADMIN_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.membership_roles (membership_id, role_id)
        values ($1::uuid, $2::uuid)
      `,
      [ADMIN_MEMBERSHIP_ID, FLOW_ADMIN_ROLE_ID],
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
          'flow-effects-api-matrix',
          'Flow Effects API Matrix',
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
        insert into flow.nodes (
          id,
          tenant_id,
          graph_id,
          code,
          name,
          kind,
          decision_policy,
          allowed_actions,
          sort_order,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          'notify',
          'Notify',
          'system',
          'any',
          ARRAY['notify']::text[],
          1,
          $4::uuid,
          $4::uuid,
          clock_timestamp(),
          clock_timestamp()
        )
      `,
      [NODE_ID, TENANT_ID, GRAPH_ID, ADMIN_USER_ID],
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

async function insertPendingEffect(testApp: TestAppContext, eventId = generateRequestId()): Promise<string> {
  const admin = await testApp.adminClient();
  try {
    await admin.query(
      `
        insert into flow.events (id, tenant_id, run_id, node_id, kind, actor_id, payload)
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          'effect_requested',
          $5::uuid,
          '{"effectKey":"notify","payload":{"channel":"ops"}}'::jsonb
        )
      `,
      [eventId, TENANT_ID, RUN_ID, NODE_ID, ADMIN_USER_ID],
    );
    return eventId;
  } finally {
    await admin.end();
  }
}

describe('FlowEffectsController API error matrix', () => {
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
            appName: 'flow-effects-api-matrix',
            schema: z.object({}),
          }),
          FlowEffectsApiMatrixAuthModule,
          StynxPlatformPipelineModule.forRoot({
            rateLimit: {
              store: rateLimitStore,
              defaults: {
                'flow.effect.dispatch': { limit: 100, windowSeconds: 60 },
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

    await seedFlowEffectsRuntime(testApp);
  }, 60_000);

  afterAll(async () => {
    await testApp?.teardown();
  });

  beforeEach(() => {
    rateLimitStore.reset();
    auditSink.reset();
    idempotencyBackend.reset();
    effectAdapter.reset();
  });

  function headers(
    authorization = adminAuthorization,
    idempotencyKey = `flow-effects-${generateRequestId()}`,
  ): Record<string, string> {
    return {
      authorization,
      'idempotency-key': idempotencyKey,
      'x-request-id': generateRequestId(),
    };
  }

  function validBody(effectEventId?: string): Record<string, unknown> {
    return {
      ...(effectEventId ? { effectEventId } : {}),
      limit: 10,
      reason: 'api-matrix',
    };
  }

  describe('POST /flow/effects/dispatch', () => {
    it('returns 201 after dispatching a pending effect', async () => {
      await insertPendingEffect(testApp, EFFECT_EVENT_ID);
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(requestHeaders)
        .send(validBody(EFFECT_EVENT_ID))
        .expect(201)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            attempted: 1,
            succeeded: 1,
            failed: 0,
            skipped: 0,
            diagnostics: [
              {
                effectEventId: EFFECT_EVENT_ID,
                ok: true,
              },
            ],
          });
        });

      expect(effectAdapter.effects).toEqual([
        expect.objectContaining({
          tenantId: TENANT_ID,
          adapterKey: 'test',
          targetType: 'case',
          targetId: 'case-1',
          runId: RUN_ID,
          effectKey: 'notify',
          nodeCode: 'notify',
          payload: { channel: 'ops' },
        }),
      ]);
      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.effect.dispatch',
          entity: 'flow.events',
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 400 when the body fails dispatch validation', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers())
        .send({ limit: 'ten' })
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
        .post('/flow/effects/dispatch')
        .set({
          'idempotency-key': `flow-effects-${generateRequestId()}`,
          'x-request-id': generateRequestId(),
        })
        .send(validBody())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow admin permission', async () => {
      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers(viewerAuthorization))
        .send(validBody())
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:admin:*');
        });
    });

    it('returns 422 when an idempotency key is reused with a different body', async () => {
      const idempotencyKey = `flow-effects-${generateRequestId()}`;

      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers(adminAuthorization, idempotencyKey))
        .send({ limit: 1, reason: 'first' })
        .expect(201);

      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers(adminAuthorization, idempotencyKey))
        .send({ limit: 2, reason: 'second' })
        .expect(422)
        .expect(({ body }) => {
          expect(body.message).toBe('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
        });
    });

    it('returns 429 when the flow effect dispatch tenant bucket is exhausted', async () => {
      rateLimitStore.reset(1);

      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers())
        .send({ limit: 1, reason: 'first' })
        .expect(201);

      await request(testApp.app.getHttpServer())
        .post('/flow/effects/dispatch')
        .set(headers())
        .send({ limit: 1, reason: 'second' })
        .expect(429)
        .expect((response) => {
          expect(response.text).toContain('Rate limit exceeded');
        });
    });
  });
});
