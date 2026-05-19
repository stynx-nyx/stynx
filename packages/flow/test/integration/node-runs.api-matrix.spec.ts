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
} from '@stynx/auth';
import { generateRequestId, StynxCoreModule } from '@stynx/core';
import { SessionJwtSigningService, SessionService, type StynxSessionSigningKeySet } from '@stynx/sessions';
import request from 'supertest';
import { z } from 'zod';
import { StynxFlowModule } from '../../src/flow.module';
import {
  createStynxFixtures,
  createTestApp,
  mintTestSession,
  type TestAppContext,
} from '../../../testing/src';

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2871a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2871b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2872a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2872b';
const FLOW_RUNTIME_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28740';
const FLOW_RUNTIME_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28750';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28760';
const GRAPH_ID = '0197481e-7294-7c53-8b03-5c36d7c28761';
const RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28762';
const NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28763';
const NODE_RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28764';
const UNKNOWN_NODE_RUN_ID = '0197481e-7294-7c53-8b03-5c36d7c28765';

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
class FlowNodeRunsApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-node-runs-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-node-runs-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowNodeRunsRuntime(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({ id: TENANT_ID, slug: 'flow-node-runs-api-matrix', name: 'Flow Node Runs API Matrix' });
  await fixtures.createUser({ id: ADMIN_USER_ID, email: 'flow-node-runs-api-matrix-admin@example.com' });
  await fixtures.createUser({ id: VIEWER_USER_ID, email: 'flow-node-runs-api-matrix-viewer@example.com' });
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
        values ($1::uuid, $2::uuid, 'flow-node-runs-reader', 'Flow Node Runs Reader')
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
          'flow-node-runs-api-matrix',
          'Flow Node Runs API Matrix',
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
          'node-run-approval',
          'v1',
          true,
          'Node Run Approval',
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
          'case-node-runs-1',
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
        insert into flow.node_runs (id, tenant_id, run_id, node_id, status, opened_at, closed_at, meta)
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          'in_progress',
          clock_timestamp(),
          null,
          '{"source":"api-matrix"}'::jsonb
        )
      `,
      [NODE_RUN_ID, TENANT_ID, RUN_ID, NODE_ID],
    );
  } finally {
    await admin.end();
  }
}

describe('FlowNodeRunsController API error matrix', () => {
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
            appName: 'flow-node-runs-api-matrix',
            schema: z.object({}),
          }),
          FlowNodeRunsApiMatrixAuthModule,
          StynxFlowModule,
        ],
      },
    });

    await seedFlowNodeRunsRuntime(testApp);
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

  describe('GET /flow/node-runs', () => {
    it('returns 200 with node runs for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .get(`/flow/node-runs?runId=${RUN_ID}&status=in_progress&page=1&pageSize=5`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            data: [
              expect.objectContaining({
                id: NODE_RUN_ID,
                tenantId: TENANT_ID,
                runId: RUN_ID,
                nodeId: NODE_ID,
                status: 'in_progress',
                nodeCode: 'review',
                nodeName: 'Review',
                kind: 'human',
                meta: {
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
        .get('/flow/node-runs')
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
        .get('/flow/node-runs')
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow runtime permission', async () => {
      await request(testApp.app.getHttpServer())
        .get('/flow/node-runs')
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:read:runtime');
        });
    });
  });

  describe('GET /flow/node-runs/:id', () => {
    it('returns 200 with the selected node run for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .get(`/flow/node-runs/${NODE_RUN_ID}`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: NODE_RUN_ID,
            tenantId: TENANT_ID,
            runId: RUN_ID,
            nodeId: NODE_ID,
            status: 'in_progress',
            nodeCode: 'review',
            nodeName: 'Review',
            kind: 'human',
            meta: {
              source: 'api-matrix',
            },
          });
        });
    });

    it('returns 400 when the request id header is malformed', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/node-runs/${NODE_RUN_ID}`)
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
        .get(`/flow/node-runs/${NODE_RUN_ID}`)
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow runtime permission', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/node-runs/${NODE_RUN_ID}`)
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:read:runtime');
        });
    });

    it('returns 404 when the node run does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/node-runs/${UNKNOWN_NODE_RUN_ID}`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Node run not found');
        });
    });
  });
});
