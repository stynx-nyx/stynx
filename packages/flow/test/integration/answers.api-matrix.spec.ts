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
} from '@stynx-nyx/auth';
import { AuditInterceptor, StynxAuditModule } from '@stynx-nyx/backend';
import { generateRequestId, StynxCoreModule } from '@stynx-nyx/core';
import type { AuditEventEnvelope, AuditSink } from '@stynx-nyx/contracts';
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

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9d1';
const ADMIN_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2891a';
const VIEWER_USER_ID = '0197481e-7294-7c53-8b03-5c36d7c2891b';
const ADMIN_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2892a';
const VIEWER_MEMBERSHIP_ID = '0197481e-7294-7c53-8b03-5c36d7c2892b';
const FLOW_EXECUTE_PERMISSION_ID = '0197481e-7294-7c53-8b03-5c36d7c28940';
const FLOW_EXECUTE_ROLE_ID = '0197481e-7294-7c53-8b03-5c36d7c28950';
const SCOPE_ID = '0197481e-7294-7c53-8b03-5c36d7c28960';
const FORM_ID = '0197481e-7294-7c53-8b03-5c36d7c28961';
const UPDATE_FILL_ID = '0197481e-7294-7c53-8b03-5c36d7c28962';
const DELETE_FILL_ID = '0197481e-7294-7c53-8b03-5c36d7c28963';
const UPDATE_QUESTION_ID = '0197481e-7294-7c53-8b03-5c36d7c28964';
const DELETE_QUESTION_ID = '0197481e-7294-7c53-8b03-5c36d7c28965';
const UPDATE_ANSWER_ID = '0197481e-7294-7c53-8b03-5c36d7c28966';
const DELETE_ANSWER_ID = '0197481e-7294-7c53-8b03-5c36d7c28967';
const UNKNOWN_ANSWER_ID = '0197481e-7294-7c53-8b03-5c36d7c28968';

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
class FlowAnswersApiMatrixAuthModule {}

function buildKeySet(): StynxSessionSigningKeySet {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'flow-answers-api-matrix-key-1',
    keys: [
      {
        kid: 'flow-answers-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedFlowAnswersRuntime(testApp: TestAppContext): Promise<void> {
  const fixtures = createStynxFixtures(testApp.adminClient);
  await fixtures.createTenant({
    id: TENANT_ID,
    slug: 'flow-answers-api-matrix',
    name: 'Flow Answers API Matrix',
  });
  await fixtures.createUser({
    id: ADMIN_USER_ID,
    email: 'flow-answers-api-matrix-admin@example.com',
  });
  await fixtures.createUser({
    id: VIEWER_USER_ID,
    email: 'flow-answers-api-matrix-viewer@example.com',
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
        values ($1::uuid, 'flow:execute:task', 'Execute flow task')
      `,
      [FLOW_EXECUTE_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.roles (id, tenant_id, key, name)
        values ($1::uuid, $2::uuid, 'flow-answer-executor', 'Flow Answer Executor')
      `,
      [FLOW_EXECUTE_ROLE_ID, TENANT_ID],
    );
    await admin.query(
      `
        insert into auth.role_perms (role_id, perm_id)
        values ($1::uuid, $2::uuid)
      `,
      [FLOW_EXECUTE_ROLE_ID, FLOW_EXECUTE_PERMISSION_ID],
    );
    await admin.query(
      `
        insert into auth.membership_roles (membership_id, role_id)
        values ($1::uuid, $2::uuid)
      `,
      [ADMIN_MEMBERSHIP_ID, FLOW_EXECUTE_ROLE_ID],
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
          'flow-answers-api-matrix',
          'Flow Answers API Matrix',
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
        insert into flow.forms (
          id,
          tenant_id,
          scope_id,
          code,
          title,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          'answers-review',
          'Answers Review',
          $4::uuid,
          $4::uuid,
          clock_timestamp(),
          clock_timestamp()
        )
      `,
      [FORM_ID, TENANT_ID, SCOPE_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.questions (
          id,
          tenant_id,
          form_id,
          key,
          label,
          field_type,
          required,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values
          ($1::uuid, $3::uuid, $4::uuid, 'approved', 'Approved', 'boolean', true, $5::uuid, $5::uuid, clock_timestamp(), clock_timestamp()),
          ($2::uuid, $3::uuid, $4::uuid, 'notes', 'Notes', 'text', false, $5::uuid, $5::uuid, clock_timestamp(), clock_timestamp())
      `,
      [UPDATE_QUESTION_ID, DELETE_QUESTION_ID, TENANT_ID, FORM_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.fills (
          id,
          tenant_id,
          form_id,
          scope_id,
          target_type,
          target_id,
          status,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values
          ($1::uuid, $3::uuid, $4::uuid, $5::uuid, 'case', 'answer-update', 'draft', $6::uuid, $6::uuid, clock_timestamp(), clock_timestamp()),
          ($2::uuid, $3::uuid, $4::uuid, $5::uuid, 'case', 'answer-delete', 'draft', $6::uuid, $6::uuid, clock_timestamp(), clock_timestamp())
      `,
      [UPDATE_FILL_ID, DELETE_FILL_ID, TENANT_ID, FORM_ID, SCOPE_ID, ADMIN_USER_ID],
    );
    await admin.query(
      `
        insert into flow.answers (
          id,
          tenant_id,
          fill_id,
          question_id,
          value,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values
          ($1::uuid, $3::uuid, $4::uuid, $6::uuid, '{"value": false}'::jsonb, $8::uuid, $8::uuid, clock_timestamp(), clock_timestamp()),
          ($2::uuid, $3::uuid, $5::uuid, $7::uuid, '{"value": "remove"}'::jsonb, $8::uuid, $8::uuid, clock_timestamp(), clock_timestamp())
      `,
      [
        UPDATE_ANSWER_ID,
        DELETE_ANSWER_ID,
        TENANT_ID,
        UPDATE_FILL_ID,
        DELETE_FILL_ID,
        UPDATE_QUESTION_ID,
        DELETE_QUESTION_ID,
        ADMIN_USER_ID,
      ],
    );
  } finally {
    await admin.end();
  }
}

describe('FlowAnswersController API error matrix', () => {
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
            appName: 'flow-answers-api-matrix',
            schema: z.object({}),
          }),
          FlowAnswersApiMatrixAuthModule,
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

    await seedFlowAnswersRuntime(testApp);
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

  describe('PATCH /flow/answers/:id', () => {
    it('returns 200 after updating an answer for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .patch(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set(requestHeaders)
        .send({
          questionId: UPDATE_QUESTION_ID,
          value: {
            value: true,
          },
        })
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: UPDATE_ANSWER_ID,
            tenantId: TENANT_ID,
            fillId: UPDATE_FILL_ID,
            questionId: UPDATE_QUESTION_ID,
            value: {
              value: true,
            },
            updatedBy: ADMIN_USER_ID,
          });
        });

      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.answer.update',
          entity: 'flow.answers',
          entityId: UPDATE_ANSWER_ID,
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 200 after updating only the answer value', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set(headers())
        .send({
          value: {
            value: false,
          },
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            id: UPDATE_ANSWER_ID,
            questionId: UPDATE_QUESTION_ID,
            value: {
              value: false,
            },
            updatedBy: ADMIN_USER_ID,
          });
        });
    });

    it('returns 400 when the body fails answer validation', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set(headers())
        .send({
          questionId: 'not-a-uuid',
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
        .patch(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set('x-request-id', generateRequestId())
        .send({
          questionId: UPDATE_QUESTION_ID,
          value: {
            value: true,
          },
        })
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow task execution permission', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set(headers(viewerAuthorization))
        .send({
          questionId: UPDATE_QUESTION_ID,
          value: {
            value: true,
          },
        })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:execute:task');
        });
    });

    it('returns 404 when the answer does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/flow/answers/${UNKNOWN_ANSWER_ID}`)
        .set(headers())
        .send({
          questionId: UPDATE_QUESTION_ID,
          value: {
            value: true,
          },
        })
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Flow row not found');
        });
    });
  });

  describe('DELETE /flow/answers/:id', () => {
    it('returns 200 after soft-deleting an answer for the authorized tenant', async () => {
      const requestHeaders = headers();

      await request(testApp.app.getHttpServer())
        .delete(`/flow/answers/${DELETE_ANSWER_ID}`)
        .set(requestHeaders)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(responseHeaders['x-request-id']).toBe(requestHeaders['x-request-id']);
          expect(body).toMatchObject({
            id: DELETE_ANSWER_ID,
            deleted: true,
          });
        });

      expect(auditSink.events).toEqual([
        expect.objectContaining({
          action: 'flow.answer.delete',
          entity: 'flow.answers',
          entityId: DELETE_ANSWER_ID,
          tenantId: TENANT_ID,
          actorId: ADMIN_USER_ID,
        }),
      ]);
    });

    it('returns 400 when the request id header is malformed', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/answers/${UPDATE_ANSWER_ID}`)
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
        .delete(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set('x-request-id', generateRequestId())
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks flow task execution permission', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/answers/${UPDATE_ANSWER_ID}`)
        .set(headers(viewerAuthorization))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission flow:execute:task');
        });
    });

    it('returns 404 when the answer does not exist', async () => {
      await request(testApp.app.getHttpServer())
        .delete(`/flow/answers/${UNKNOWN_ANSWER_ID}`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('Flow row not found');
        });
    });
  });
});
