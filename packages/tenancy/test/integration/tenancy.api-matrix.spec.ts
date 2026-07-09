import { generateRequestId } from '@stynx-nyx/core';
import {
  createStynxFixtures,
  createTestApp,
  mintTestSession,
  type TestAppContext,
} from '@stynx-nyx/testing';
import request from 'supertest';
import { StynxTenancyModule } from '../../src/tenancy.module';

const ACTOR_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const LIST_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const UPDATE_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const SUSPEND_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c3';
const ARCHIVE_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c4';
const PURGE_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c5';
const UNKNOWN_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca999';

describe('TenancyController API error matrix', () => {
  let testApp: TestAppContext;
  let previousPlatformAdminFlag: string | undefined;
  let authorization: string;

  beforeAll(async () => {
    previousPlatformAdminFlag = process.env.STYNX_TENANCY_PLATFORM_ADMIN;
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';

    testApp = await createTestApp({
      localstack: { enabled: false },
      overrides: {
        imports: [
          StynxTenancyModule.forRoot({
            headerName: 'X-Tenant-Id',
          }),
        ],
      },
    });

    const fixtures = createStynxFixtures(testApp.adminClient);
    await fixtures.createUser({ id: ACTOR_ID, email: 'tenancy-api-matrix@example.com' });
    for (const tenant of [
      { id: LIST_TENANT_ID, slug: 'tenant-matrix-list', name: 'Tenant Matrix List' },
      { id: UPDATE_TENANT_ID, slug: 'tenant-matrix-update', name: 'Tenant Matrix Update' },
      { id: SUSPEND_TENANT_ID, slug: 'tenant-matrix-suspend', name: 'Tenant Matrix Suspend' },
      { id: ARCHIVE_TENANT_ID, slug: 'tenant-matrix-archive', name: 'Tenant Matrix Archive' },
      { id: PURGE_TENANT_ID, slug: 'tenant-matrix-purge', name: 'Tenant Matrix Purge' },
    ]) {
      await fixtures.createTenant(tenant);
    }

    const session = await mintTestSession({
      userId: ACTOR_ID,
      tenantId: LIST_TENANT_ID,
    });
    authorization = `Bearer ${session.token}`;
  }, 60_000);

  afterAll(async () => {
    if (previousPlatformAdminFlag === undefined) {
      delete process.env.STYNX_TENANCY_PLATFORM_ADMIN;
    } else {
      process.env.STYNX_TENANCY_PLATFORM_ADMIN = previousPlatformAdminFlag;
    }
    await testApp?.teardown();
  });

  afterEach(() => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';
  });

  function headers(): Record<string, string> {
    return {
      authorization,
      'x-request-id': generateRequestId(),
    };
  }

  async function expectPlatformAdminDisabled(
    method: 'get' | 'patch' | 'post',
    path: string,
    body?: unknown,
  ): Promise<void> {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'false';
    const call = request(testApp.app.getHttpServer())[method](path).set(headers());
    if (body !== undefined) {
      call.send(body);
    }
    await call.expect(403).expect(({ body: responseBody }) => {
      expect(responseBody).toMatchObject({
        statusCode: 403,
        message: 'PLATFORM_ADMIN_DISABLED',
      });
    });
  }

  async function expectMalformedJson(method: 'patch' | 'post', path: string): Promise<void> {
    const call = request(testApp.app.getHttpServer())[method](path);
    await call
      .set(headers())
      .set('content-type', 'application/json')
      .send('{"invalid":')
      .expect(400);
  }

  describe('GET /tenants', () => {
    it('returns 200 with tenant summaries', async () => {
      await request(testApp.app.getHttpServer())
        .get('/tenants')
        .set(headers())
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: LIST_TENANT_ID,
                slug: 'tenant-matrix-list',
                state: 'active',
              }),
            ]),
          );
        });
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('get', '/tenants');
    });
  });

  describe('POST /tenants', () => {
    it('returns 201 after provisioning a tenant', async () => {
      await request(testApp.app.getHttpServer())
        .post('/tenants')
        .set(headers())
        .send({
          slug: 'tenant-matrix-created',
          name: 'Tenant Matrix Created',
          ownerEmail: 'tenant-matrix-created@example.com',
          ownerLocale: 'pt-BR',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            tenant: {
              slug: 'tenant-matrix-created',
              name: 'Tenant Matrix Created',
              state: 'active',
              isActive: true,
            },
            invitationToken: expect.any(String),
            ownerUserId: expect.any(String),
          });
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await expectMalformedJson('post', '/tenants');
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('post', '/tenants', {
        slug: 'tenant-matrix-forbidden',
        name: 'Tenant Matrix Forbidden',
        ownerEmail: 'tenant-matrix-forbidden@example.com',
      });
    });
  });

  describe('GET /tenants/:id', () => {
    it('returns 200 with tenant detail', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/tenants/${LIST_TENANT_ID}`)
        .set(headers())
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            id: LIST_TENANT_ID,
            slug: 'tenant-matrix-list',
            state: 'active',
            settings: {},
          });
        });
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('get', `/tenants/${LIST_TENANT_ID}`);
    });

    it('returns 404 for an unknown tenant id', async () => {
      await request(testApp.app.getHttpServer())
        .get(`/tenants/${UNKNOWN_TENANT_ID}`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 404,
            message: 'TENANT_NOT_FOUND',
          });
        });
    });
  });

  describe('PATCH /tenants/:id', () => {
    it('returns 200 after updating tenant metadata and settings', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/tenants/${UPDATE_TENANT_ID}`)
        .set(headers())
        .send({
          name: 'Tenant Matrix Updated',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          settings: { billing: 'manual' },
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            id: UPDATE_TENANT_ID,
            slug: 'tenant-matrix-update',
            name: 'Tenant Matrix Updated',
            timezone: 'America/Sao_Paulo',
            locale: 'pt-BR',
            settings: { billing: 'manual' },
          });
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await expectMalformedJson('patch', `/tenants/${UPDATE_TENANT_ID}`);
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('patch', `/tenants/${UPDATE_TENANT_ID}`, {
        name: 'Blocked Update',
      });
    });

    it('returns 404 for an unknown tenant id', async () => {
      await request(testApp.app.getHttpServer())
        .patch(`/tenants/${UNKNOWN_TENANT_ID}`)
        .set(headers())
        .send({ name: 'Missing Tenant' })
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 404,
            message: 'TENANT_NOT_FOUND',
          });
        });
    });
  });

  describe('POST /tenants/:id/suspend', () => {
    it('returns 201 after suspending a tenant', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${SUSPEND_TENANT_ID}/suspend`)
        .set(headers())
        .send({ reason: 'manual policy review' })
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            tenant: {
              id: SUSPEND_TENANT_ID,
              state: 'suspended',
              isActive: false,
              suspendedReason: 'manual policy review',
            },
            activeSessionCount: 0,
          });
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await expectMalformedJson('post', `/tenants/${SUSPEND_TENANT_ID}/suspend`);
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('post', `/tenants/${SUSPEND_TENANT_ID}/suspend`, {
        reason: 'blocked',
      });
    });

    it('returns 404 for an unknown tenant id', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${UNKNOWN_TENANT_ID}/suspend`)
        .set(headers())
        .send({ reason: 'missing' })
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 404,
            message: 'TENANT_NOT_FOUND',
          });
        });
    });
  });

  describe('POST /tenants/:id/archive', () => {
    it('returns 201 after archiving a tenant', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${ARCHIVE_TENANT_ID}/archive`)
        .set(headers())
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            tenant: {
              id: ARCHIVE_TENANT_ID,
              state: 'archived',
              isActive: false,
            },
            exportKey: `tenants/${ARCHIVE_TENANT_ID}/exports/placeholder.json`,
          });
          expect(body.tenant.archivedAt).toEqual(expect.any(String));
        });
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('post', `/tenants/${ARCHIVE_TENANT_ID}/archive`);
    });

    it('returns 404 for an unknown tenant id', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${UNKNOWN_TENANT_ID}/archive`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 404,
            message: 'TENANT_NOT_FOUND',
          });
        });
    });
  });

  describe('POST /tenants/:id/purge', () => {
    it('returns 201 after purging a tenant', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${PURGE_TENANT_ID}/purge`)
        .set(headers())
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            tenant: {
              id: PURGE_TENANT_ID,
              state: 'purged',
              isActive: false,
            },
          });
        });
    });

    it('returns 403 when the platform admin guard is disabled', async () => {
      await expectPlatformAdminDisabled('post', `/tenants/${PURGE_TENANT_ID}/purge`);
    });

    it('returns 404 for an unknown tenant id', async () => {
      await request(testApp.app.getHttpServer())
        .post(`/tenants/${UNKNOWN_TENANT_ID}/purge`)
        .set(headers())
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 404,
            message: 'TENANT_NOT_FOUND',
          });
        });
    });
  });
});
