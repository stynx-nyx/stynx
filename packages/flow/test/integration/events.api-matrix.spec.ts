import { generateKeyPairSync } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
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
} from '@stynx-nyx/auth';
import { generateRequestId, StynxCoreModule } from '@stynx-nyx/core';
import {
  SessionJwtSigningService,
  SessionService,
  type StynxSessionSigningKeySet,
} from '@stynx-nyx/sessions';
import request from 'supertest';
import { z } from 'zod';
import { StynxFlowModule } from '../../src/flow.module';
import {
  createStynxFixtures,
  createTestApp,
  mintTestSession,
  type TestAppContext,
} from '@stynx-nyx/testing';

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2832b';
const FLOW_RUNTIME_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28440';
const FLOW_RUNTIME_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28540';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28640';
const GRAPH_ID = '0197481e-7294-7c53-8b03-5c36d7c28641';
const RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28642';
const NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28643';
const EVENT_ID = '0197481e-7294-7c53-8b03-5c36d7c28644';

let activeJwks: unknown = { keys: [] };

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
class FlowEventsApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-events-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-events-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowEventsRuntime(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({
    id: TENANT_ID,
    slug: 'flow-events-api-matrix',
    name: 'Flow Events API Matrix',
  });
  await fixtures.createUser({
    id: ADMIN_USER_ID,
    email: 'flow-events-api-matrix-admin@example.com',
  });
  await fixtures.createUser({
    id: VIEWER_USER_ID,
    email: 'flow-events-api-matrix-viewer@example.com',
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
        values ($1::uuid, $2::uuid, 'flow-events-reader', 'Flow Events Reader')
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
          'flow-events-api-matrix',
          'Flow Events API Matrix',
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
          'review',
          'Review',
          'human',
          'any',
          ARRAY['approve', 'reject']::text[],
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
    await admin.query(
      `
        insert into flow.events (id, tenant_id, run_id, node_id, kind, actor_id, payload)
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          'signal_received',
          $5::uuid,
          '{"source":"api-matrix"}'::jsonb
        )
      `,
      [EVENT_ID, TENANT_ID, RUN_ID, NODE_ID, ADMIN_USER_ID],
    );
  } finally {
    await admin.end();
  }
}

describe('FlowEventsController API error matrix', () => {
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
            appName: 'flow-events-api-matrix',
            schema: z.object({}),
          }),
          FlowEventsApiMatrixAuthModule,
          StynxFlowModule,
        ],
      },
    });

    await seedFlowEventsRuntime(testApp);
  }, 60_000);

  afterAll(async () => {
    await testApp?.teardown();
  });

  function headers(authorization = adminAuthorization): Record<string, string> {
    return {
      authorization,
      'x-request-id': generateRequestId(),
    };
  }

  describe('GET /flow/events', () => {
    it('returns 200 with flow events for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .get(`/flow/events?runId=${RUN_ID}&page=1&pageSize=5`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            data: [
              expect.objectContaining({
                id: EVENT_ID,
                tenantId: TENANT_ID,
                runId: RUN_ID,
                nodeId: NODE_ID,
                kind: 'signal_received',
                actorId: ADMIN_USER_ID,
                payload: {
                  source: 'api-matrix',
                },
              }),
            ],
            meta: {
              page: 1,
              pageSize: 5,
              total: 1,
            },
          });
        });
    });

    it('returns 400 when the request id header is malformed', async () => {
      await request(testApp.app.getHttpServer())
        .get('/flow/events')
        .set({
          authorization: adminAuthorization,
          'x-request-id': 'not-a-uuidv7',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('X-Request-Id must be a valid UUIDv7');
        });
    });

    it('returns 401 when the bearer token is missing', async () => {
      await request(testApp.app.getHttpServer())
        .get('/flow/events')
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow runtime permission', async () => {
      await request(testApp.app.getHttpServer())
        .get('/flow/events')
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:read:runtime');
        });
    });
  });
});
