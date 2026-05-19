import { generateRequestId } from '@stynx/core';
import { createStynxFixtures, createTestApp, type TestAppContext } from '@stynx/testing';
import request from 'supertest';
import { StynxI18nModule } from '../../src/i18n.module';
import { StynxTenancyModule } from '../../../tenancy/src/tenancy.module';

const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const OTHER_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const ACTOR_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';

function bearerToken(tenantId = TENANT_ID): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: ACTOR_ID, tenant_id: tenantId })).toString('base64url');
  return `Bearer ${header}.${payload}.signature`;
}

function authorizedHeaders(tenantId = TENANT_ID): Record<string, string> {
  const requestId = generateRequestId();
  return {
    authorization: bearerToken(tenantId),
    'x-request-id': requestId,
    'x-tenant-id': tenantId,
  };
}

describe('I18nController API error matrix', () => {
  let testApp: TestAppContext;

  beforeAll(async () => {
    testApp = await createTestApp({
      localstack: { enabled: false },
      overrides: {
        imports: [
          StynxTenancyModule.forRoot({
            headerName: 'X-Tenant-Id',
          }),
          StynxI18nModule.forRoot(),
        ],
      },
    });

    const fixtures = createStynxFixtures(testApp.adminClient);
    await fixtures.createTenant({ id: TENANT_ID, slug: 'i18n-matrix', name: 'I18n Matrix' });
    await fixtures.createTenant({ id: OTHER_TENANT_ID, slug: 'i18n-matrix-other', name: 'I18n Matrix Other' });
    await fixtures.createUser({ id: ACTOR_ID, email: 'i18n-matrix@example.com' });
    await fixtures.createMembership({
      id: '0197481e-7294-7c53-8b03-5c36d7c2832a',
      tenantId: TENANT_ID,
      userId: ACTOR_ID,
    });

    const admin = await testApp.adminClient();
    try {
      await admin.query(
        `
          insert into tenancy.tenant_settings (tenant_id, locale, settings, updated_at)
          values ($1::uuid, 'pt-BR', $2::jsonb, clock_timestamp())
          on conflict (tenant_id)
          do update set locale = excluded.locale, settings = excluded.settings, updated_at = excluded.updated_at
        `,
        [
          TENANT_ID,
          JSON.stringify({
            existing: true,
            'i18n.override.en-US.title': 'Title',
            'i18n.override.pt-BR.title': 'Titulo',
          }),
        ],
      );
    } finally {
      await admin.end();
    }
  }, 60_000);

  afterAll(async () => {
    await testApp?.teardown();
  });

  describe('GET /_tenancy/i18n/overrides', () => {
    it('returns 200 with tenant overrides and request id propagation', async () => {
      const headers = authorizedHeaders();

      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(headers)
        .expect(200)
        .expect(({ body, headers: responseHeaders }) => {
          expect(body).toEqual({
            'i18n.override.en-US.title': 'Title',
            'i18n.override.pt-BR.title': 'Titulo',
          });
          expect(responseHeaders['x-request-id']).toBe(headers['x-request-id']);
        });
    });

    it('returns 400 when tenant context is missing', async () => {
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .expect(400)
        .expect(({ body }) => {
          expect(String(body.message)).toContain('Tenant context is required');
        });
    });

    it('returns 403 when the actor is not a member of the requested tenant', async () => {
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(authorizedHeaders(OTHER_TENANT_ID))
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('TENANT_ACCESS_DENIED');
        });
    });
  });

  describe('PUT /_tenancy/i18n/overrides', () => {
    it('returns 200 after updating tenant overrides', async () => {
      await request(testApp.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(authorizedHeaders())
        .send({
          locale: 'pt-BR',
          catalog: {
            title: 'Titulo atualizado',
            subtitle: 'Subtitulo',
          },
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            'i18n.override.en-US.title': 'Title',
            'i18n.override.pt-BR.title': 'Titulo atualizado',
            'i18n.override.pt-BR.subtitle': 'Subtitulo',
          });
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await request(testApp.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(authorizedHeaders())
        .set('content-type', 'application/json')
        .send('{"locale":')
        .expect(400);
    });

    it('returns 403 when the actor is not a member of the requested tenant', async () => {
      await request(testApp.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(authorizedHeaders(OTHER_TENANT_ID))
        .send({
          locale: 'pt-BR',
          catalog: {
            title: 'Bloqueado',
          },
        })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('TENANT_ACCESS_DENIED');
        });
    });
  });
});
