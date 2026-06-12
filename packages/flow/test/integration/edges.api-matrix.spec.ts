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
import { AuditInterceptor, StynxAuditModule } from '@stynx/backend';
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

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9e1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c28e1a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c28e1b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c28e2a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c28e2b';
const FLOW_READ_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28e40';
const FLOW_WRITE_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28e41';
const FLOW_DESIGNER_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e50';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e60';
const GRAPH_ID = '0197481e-7294-7c53-8b03-5c36d7c28e61';
const START_NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e62';
const REVIEW_NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e63';
const END_NODE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e64';
const GET_EDGE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e65';
const UPDATE_EDGE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e66';
const DELETE_EDGE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e67';
const UNKNOWN_EDGE_ID = '0197481e-7294-7c53-8b03-5c36d7c28e68';

let activeJwks: unknown = { keys: [] };

class RecordingAuditSink implements AuditSink {
  readonly events: AuditEventEnvelope[] = [];

  async write(event: AuditEventEnvelope): Promise<void> {
    this.events.push(event);
  }

  reset(): void {
    this.events.length = 0;
  }
}

const auditSink = new RecordingAuditSink();

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
class FlowEdgesApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-edges-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-edges-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowEdgesDesign(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({
    id: TENANT_ID,
    slug: 'flow-edges-api-matrix',
    name: 'Flow Edges API Matrix',
  });
  await fixtures.createUser({
    id: ADMIN_USER_ID,
    email: 'flow-edges-api-matrix-admin@example.com',
  });
  await fixtures.createUser({
    id: VIEWER_USER_ID,
    email: 'flow-edges-api-matrix-viewer@example.com',
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
        values
          ($1::uuid, 'flow:read:design', 'Read flow design'),
          ($2::uuid, 'flow:write:design', 'Write flow design')
      `,
      [FLOW_READ_PERMISSION_ID, FLOW_WRITE_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.roles (id, tenant_id, key, name)
        values ($1::uuid, $2::uuid, 'flow-edge-designer', 'Flow Edge Designer')
      `,
      [FLOW_DESIGNER_ROLE_ID, TENANT_ID],
    );
    await admin.query(
      `
        insert into auth.role_perms (role_id, perm_id)
        values
          ($1::uuid, $2::uuid),
          ($1::uuid, $3::uuid)
      `,
      [FLOW_DESIGNER_ROLE_ID, FLOW_READ_PERMISSION_ID, FLOW_WRITE_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.membership_roles (membership_id, role_id)
        values ($1::uuid, $2::uuid)
      `,
      [ADMIN_MEMBERSHIP_ID, FLOW_DESIGNER_ROLE_ID],
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
          'flow-edges-api-matrix',
          'Flow Edges API Matrix',
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
          'edge-review',
          'v1',
          true,
          'Edge Review',
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
          sort_order,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values
          ($1::uuid, $4::uuid, $5::uuid, 'start', 'Start', 'start', 1, $6::uuid, $6::uuid, clock_timestamp(), clock_timestamp()),
          ($2::uuid, $4::uuid, $5::uuid, 'review', 'Review', 'human', 2, $6::uuid, $6::uuid, clock_timestamp(), clock_timestamp()),
          ($3::uuid, $4::uuid, $5::uuid, 'end', 'End', 'end', 3, $6::uuid, $6::uuid, clock_timestamp(), clock_timestamp())
      `,
      [START_NODE_ID, REVIEW_NODE_ID, END_NODE_ID, TENANT_ID, GRAPH_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.edges (
          id,
          tenant_id,
          graph_id,
          from_node_id,
          to_node_id,
          action,
          rule,
          spawn,
          sort_order,
          meta,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values
          ($1::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, 'submit', 'payload.ready', false, 1, '{"source":"api-matrix"}'::jsonb, $8::uuid, $8::uuid, clock_timestamp(), clock_timestamp()),
          ($2::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, 'approve', 'approval.allowed', false, 2, '{"source":"api-matrix"}'::jsonb, $8::uuid, $8::uuid, clock_timestamp(), clock_timestamp()),
          ($3::uuid, $4::uuid, $5::uuid, $7::uuid, $9::uuid, 'archive', 'done', false, 3, '{"source":"api-matrix"}'::jsonb, $8::uuid, $8::uuid, clock_timestamp(), clock_timestamp())
      `,
      [
        GET_EDGE_ID,
        UPDATE_EDGE_ID,
        DELETE_EDGE_ID,
        TENANT_ID,
        GRAPH_ID,
        START_NODE_ID,
        REVIEW_NODE_ID,
        ADMIN_USER_ID,
        END_NODE_ID,
      ],
    );
  } finally {
    await admin.end();
  }
}

describe('FlowEdgesController API error matrix', () => {
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
            appName: 'flow-edges-api-matrix',
            schema: z.object({}),
          }),
          FlowEdgesApiMatrixAuthModule,
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

    await seedFlowEdgesDesign(testApp);
  }, 60_000);

  afterAll(async () => {
    await testApp?.teardown();
  });

  beforeEach(() => {
    auditSink.reset();
  });

  function headers(authorization = adminAuthorization): Record<string, string> {
    return {
      authorization,
      'x-request-id': generateRequestId(),
    };
  }

  describe('GET /flow/edges/:id', () => {
    it('returns 200 for an authorized design edge lookup', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .get(`/flow/edges/${GET_EDGE_ID}`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: GET_EDGE_ID,
            tenantId: TENANT_ID,
            graphId: GRAPH_ID,
            fromNodeId: START_NODE_ID,
            toNodeId: REVIEW_NODE_ID,
            action: 'submit',
            rule: 'payload.ready',
            spawn: false,
            sortOrder: 1,
            meta: {
              source: 'api-matrix',
            },
          });
        });
    });

    it('returns 401 when the bearer token is missing', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/edges/${GET_EDGE_ID}`)
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow design read permission', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/edges/${GET_EDGE_ID}`)
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:read:design');
        });
    });

    it('returns 404 when the edge does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/flow/edges/${UNKNOWN_EDGE_ID}`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Flow row not found');
        });
    });
  });

  describe('PATCH /flow/edges/:id', () => {
    it('returns 200 after updating an edge for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .patch(`/flow/edges/${UPDATE_EDGE_ID}`)
        .set(requestHeaders)
        .send({
          action: 'reject',
          rule: 'payload.rejected',
          spawn: true,
          sortOrder: 12,
          meta: {
            source: 'api-matrix',
            scenario: 'patch',
          },
        })
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: UPDATE_EDGE_ID,
            tenantId: TENANT_ID,
            graphId: GRAPH_ID,
            fromNodeId: START_NODE_ID,
            toNodeId: REVIEW_NODE_ID,
            action: 'reject',
            rule: 'payload.rejected',
            spawn: true,
            sortOrder: 12,
            meta: {
              source: 'api-matrix',
              scenario: 'patch',
            },
            updatedBy: ADMIN_USER_ID,
          });
        });

      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.edge.update',
          entity: 'flow.edges',
          entityId: UPDATE_EDGE_ID,
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 400 when the body fails edge validation', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/edges/${UPDATE_EDGE_ID}`)
        .set(headers())
        .send({
          fromNodeId: 'not-a-uuid',
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
        .patch(`/flow/edges/${UPDATE_EDGE_ID}`)
        .set('x-request-id', generateRequestId())
        .send({
          action: 'approve',
        })
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow design write permission', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/edges/${UPDATE_EDGE_ID}`)
        .set(headers(viewerAuthorization))
        .send({
          action: 'approve',
        })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:write:design');
        });
    });

    it('returns 404 when the edge does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/edges/${UNKNOWN_EDGE_ID}`)
        .set(headers())
        .send({
          action: 'approve',
        })
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Flow row not found');
        });
    });
  });

  describe('DELETE /flow/edges/:id', () => {
    it('returns 200 after soft-deleting an edge for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .delete(`/flow/edges/${DELETE_EDGE_ID}`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: DELETE_EDGE_ID,
            deleted: true,
          });
        });

      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.edge.delete',
          entity: 'flow.edges',
          entityId: DELETE_EDGE_ID,
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 400 when the request id header is malformed', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/edges/${GET_EDGE_ID}`)
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
        .delete(`/flow/edges/${GET_EDGE_ID}`)
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow design write permission', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/edges/${GET_EDGE_ID}`)
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:write:design');
        });
    });

    it('returns 404 when the edge does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/edges/${UNKNOWN_EDGE_ID}`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Flow row not found');
        });
    });
  });
});
