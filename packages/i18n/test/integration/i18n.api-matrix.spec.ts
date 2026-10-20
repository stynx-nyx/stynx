import { generateRequestId } from '@stynx-nyx/core';
import request from '../../../core/test/support/request-with-id.js';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import { LocaleService } from '../../src/locale.service.js';
import { CatalogService } from '../../src/catalog.service.js';
import { RequestContext } from '@stynx-nyx/core';

import {
  AuthenticatedI18nApp,
  TENANT_ID,
  OTHER_TENANT_ID,
  ACTOR_ID,
} from '../support/authenticated-app.js';

let fixture: AuthenticatedI18nApp;

function authorizedHeaders(tenantId = TENANT_ID): Record<string, string> {
  const requestId = generateRequestId();
  return {
    authorization: `Bearer ${fixture.token(tenantId === OTHER_TENANT_ID ? 'other' : 'writer')}`,
    'x-request-id': requestId,
    'x-tenant-id': tenantId,
  };
}

describe('I18nController API error matrix', () => {
  let testApp: AuthenticatedI18nApp;

  beforeAll(async () => {
    fixture = new AuthenticatedI18nApp();
    testApp = fixture;
    await fixture.initialize();
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

    it('returns 401 before tenant processing when authentication is missing', async () => {
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .expect(401)
        .expect(({ body }) => {
          expect(String(body.message)).toContain('Missing STYNX bearer token');
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
  describe('real authentication, roles and tenant isolation', () => {
    it('uses direct restricted application and reader pool logins', async () => {
      expect(await fixture.poolIdentities()).toEqual([
        {
          current_user: 'stynx_app',
          session_user: 'stynx_app',
          rolsuper: false,
          rolbypassrls: false,
        },
        {
          current_user: 'stynx_reader',
          session_user: 'stynx_reader',
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
    });

    it('records tenant and actor on actual reader/app SQL without owner elevation', async () => {
      fixture.observations.length = 0;
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(authorizedHeaders())
        .expect(200);
      await request(testApp.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(authorizedHeaders())
        .send({ locale: 'pt-BR', catalog: { roleWitness: 'Committed' } })
        .expect(200);
      expect(
        fixture.observations.some(
          (row) =>
            row.current_user === 'stynx_reader' &&
            row.session_user === 'stynx_reader' &&
            row.tenant === TENANT_ID &&
            row.actor === ACTOR_ID &&
            row.readonly === 'on',
        ),
      ).toBe(true);
      expect(
        fixture.observations.some(
          (row) =>
            row.current_user === 'stynx_app' &&
            row.session_user === 'stynx_app' &&
            row.tenant === TENANT_ID &&
            row.actor === ACTOR_ID &&
            row.readonly === 'off',
        ),
      ).toBe(true);
      expect(
        fixture.observations.every(
          (row) => row.requestedRole !== 'owner' && row.current_user !== 'stynx_owner',
        ),
      ).toBe(true);
      const admin = await fixture.adminClient();
      try {
        const row = await admin.query(
          'select settings from tenancy.tenant_settings where tenant_id=$1',
          [TENANT_ID],
        );
        expect(row.rows[0].settings.existing).toBe(true);
        expect(row.rows[0].settings['i18n.override.pt-BR.roleWitness']).toBe('Committed');
        const other = await admin.query(
          'select settings from tenancy.tenant_settings where tenant_id=$1',
          [OTHER_TENANT_ID],
        );
        expect(other.rows[0].settings).toEqual({
          'i18n.override.pt-BR.title': 'Other tenant secret',
        });
      } finally {
        await admin.end();
      }
    });

    it('refuses an unsigned synthetic bearer with a valid tenant header', async () => {
      const encoded = Buffer.from(JSON.stringify({ sub: ACTOR_ID, tenant_id: TENANT_ID })).toString(
        'base64url',
      );
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set('x-tenant-id', TENANT_ID)
        .set('authorization', `Bearer eyJhbGciOiJub25lIn0.${encoded}.signature`)
        .expect(401);
    });

    it('refuses an authenticated member without the required permission', async () => {
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set('x-tenant-id', TENANT_ID)
        .set('authorization', `Bearer ${fixture.token('denied')}`)
        .expect(403)
        .expect(({ body }) => expect(body.message).toBe('Missing permission i18n:read'));
    });

    it('allows read permission without granting write permission', async () => {
      const headers = {
        'x-tenant-id': TENANT_ID,
        authorization: `Bearer ${fixture.token('reader')}`,
      };
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(headers)
        .expect(200);
      await request(testApp.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(headers)
        .send({ locale: 'pt-BR', catalog: { title: 'Forbidden' } })
        .expect(403)
        .expect(({ body }) => expect(body.message).toBe('Missing permission i18n:write'));
    });

    it('refuses missing tenant or actor before SQL and warmed tenant cache access', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService);
      const catalog = fixture.moduleRef.get(CatalogService);
      const run = (
        tenantId: string | undefined,
        actorId: string | undefined,
        fn: () => Promise<void>,
      ) =>
        fixture.requestContextMutator.runWithRequestContext(
          {
            requestId: generateRequestId(),
            startedAt: new Date(),
            ...(tenantId ? { tenantId } : {}),
            ...(actorId ? { actorId } : {}),
          },
          fn,
        );
      const before = fixture.observations.length;
      await run(undefined, ACTOR_ID, async () => {
        await expect(admin.listTenantOverrides(TENANT_ID)).rejects.toMatchObject({
          code: 'TENANT_CONTEXT_MISSING',
        });
      });
      await run(TENANT_ID, undefined, async () => {
        await expect(admin.listTenantOverrides(TENANT_ID)).rejects.toMatchObject({
          code: 'ACTOR_CONTEXT_MISSING',
        });
        expect(() => catalog.translate('title', 'pt-BR', {}, TENANT_ID)).toThrow();
        await expect(catalog.primeTenantOverrides(TENANT_ID)).rejects.toThrow();
      });
      await run(OTHER_TENANT_ID, ACTOR_ID, async () => {
        await expect(admin.listTenantOverrides(TENANT_ID)).rejects.toThrow('I18n tenant differs');
        expect(() => catalog.setTenantOverrides(TENANT_ID, {})).toThrow('I18n tenant differs');
      });
      expect(fixture.observations).toHaveLength(before);
    });

    it('keeps normal tenant SQL restricted inside an explicitly active system context', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService);
      fixture.observations.length = 0;
      await fixture.database.withSystemContext('explicit i18n internal test', async () => {
        fixture.requestContextMutator.patch({ tenantId: TENANT_ID, actorId: ACTOR_ID });
        expect(fixture.moduleRef.get(RequestContext).tenantId).toBe(TENANT_ID);
        await admin.listTenantOverrides(TENANT_ID);
        await admin.updateTenantOverrides(TENANT_ID, {
          locale: 'pt-BR',
          catalog: { nestedSystem: 'Restricted' },
        });
      });
      expect(fixture.observations.map((row) => row.current_user)).toEqual([
        'stynx_reader',
        'stynx_app',
      ]);
    });

    it('permits internal owner administration only with explicit caller system capability', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService);
      await expect(admin.listOverrides(TENANT_ID)).rejects.toThrow();
      fixture.observations.length = 0;
      await fixture.database.withSystemContext('explicit i18n owner administration', async () => {
        await expect(admin.listOverrides(OTHER_TENANT_ID)).resolves.toEqual({
          'i18n.override.pt-BR.title': 'Other tenant secret',
        });
      });
      expect(fixture.observations.map((row) => row.current_user)).toEqual(['stynx_owner']);
    });

    it('does not publish updates made inside an outer transaction that later rolls back', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService),
        catalog = fixture.moduleRef.get(CatalogService);
      await fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          startedAt: new Date(),
        },
        async () => {
          await admin.updateTenantOverrides(TENANT_ID, {
            locale: 'pt-BR',
            catalog: { rollbackWitness: 'Before' },
          });
          await expect(
            fixture.database.tx(
              async () => {
                await admin.updateTenantOverrides(TENANT_ID, {
                  locale: 'pt-BR',
                  catalog: { rollbackWitness: 'Rolled back' },
                });
                throw new Error('outer rollback');
              },
              { role: 'app', readonly: false, retry: false },
            ),
          ).rejects.toMatchObject({ code: 'INDEPENDENT_TRANSACTION_CONNECTION' });
          expect(catalog.translate('rollbackWitness', 'pt-BR', {}, TENANT_ID)).toBe('Before');
          await expect(admin.listTenantOverrides(TENANT_ID)).resolves.toMatchObject({
            'i18n.override.pt-BR.rollbackWitness': 'Before',
          });
        },
      );
    });

    it('does not prime the cache from a held uncommitted transaction', async () => {
      const catalog = fixture.moduleRef.get(CatalogService);
      await fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: OTHER_TENANT_ID,
          actorId: ACTOR_ID,
          startedAt: new Date(),
        },
        async () => {
          await expect(
            fixture.database.tx(
              async (trx) => {
                await trx.query(
                  "update tenancy.tenant_settings set settings=jsonb_build_object('i18n.override.pt-BR.title','Uncommitted') where tenant_id=$1",
                  [OTHER_TENANT_ID],
                );
                await catalog.primeTenantOverrides(OTHER_TENANT_ID);
                throw new Error('prime outer rollback');
              },
              { role: 'app', readonly: false, retry: false },
            ),
          ).rejects.toMatchObject({ code: 'INDEPENDENT_TRANSACTION_CONNECTION' });
          expect(catalog.translate('title', 'pt-BR', {}, OTHER_TENANT_ID)).not.toBe('Uncommitted');
        },
      );
    });

    it('refuses nested tenant listing and cold locale SQL but permits a committed warm cache', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService),
        catalog = fixture.moduleRef.get(CatalogService),
        locale = fixture.moduleRef.get(LocaleService);
      await fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          startedAt: new Date(),
        },
        async () => {
          await fixture.database.tx(
            async () => {
              await expect(admin.listTenantOverrides(TENANT_ID)).rejects.toMatchObject({
                code: 'INDEPENDENT_TRANSACTION_CONNECTION',
              });
              const before = fixture.settingsQueries.length;
              await expect(
                catalog
                  .primeTenantOverrides(TENANT_ID)
                  .then(() => catalog.translate('title', 'pt-BR', {}, TENANT_ID)),
              ).resolves.toBe('Titulo atualizado');
              expect(catalog.translate('title', 'pt-BR', {}, TENANT_ID)).toBe('Titulo atualizado');
              expect(fixture.settingsQueries).toHaveLength(before);
            },
            { role: 'app', readonly: false, retry: false },
          );
        },
      );
      await fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: OTHER_TENANT_ID,
          actorId: ACTOR_ID,
          startedAt: new Date(),
        },
        async () => {
          await fixture.database.tx(
            async () => {
              await expect(locale.resolve()).rejects.toMatchObject({
                code: 'INDEPENDENT_TRANSACTION_CONNECTION',
              });
            },
            { role: 'app', readonly: false, retry: false },
          );
        },
      );
    });

    it('keeps a nominal public actor out of tenant locale SQL and warmed translations', async () => {
      await fixture.database.withSystemContext('explicit seed public cache witness', async () =>
        fixture.moduleRef.get(CatalogService).primeTenantOverrides(TENANT_ID),
      );
      fixture.observations.length = 0;
      fixture.settingsQueries.length = 0;
      const response = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/nominal')
        .expect(200);
      expect(response.body).toMatchObject({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        mode: 'nominal',
        translated: 'title',
      });
      // Tenancy's host resolution is separate; i18n must perform no settings lookup.
      expect(fixture.settingsQueries.some((row) => row.current_user === 'stynx_owner')).toBe(false);
      expect(fixture.settingsQueries).toEqual([]);
    });

    it('refuses direct tenant service and warm cache access from an actual nominal public request', async () => {
      fixture.settingsQueries.length = 0;
      for (const route of ['cache', 'tenant-admin']) {
        await request(fixture.app.getHttpServer())
          .get(`/_i18n-public/${route}`)
          .expect(403)
          .expect(({ body }) =>
            expect(body.message).toBe('I18n requires verified tenant admission'),
          );
      }
      expect(fixture.settingsQueries).toEqual([]);
    });
    it('uses tenant translations only for verified optional public authentication', async () => {
      const nominal = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/optional')
        .expect(200);
      expect(nominal.body).toMatchObject({ mode: 'nominal', translated: 'title' });
      const verified = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/optional')
        .set('authorization', `Bearer ${fixture.token()}`)
        .expect(200);
      expect(verified.body).toMatchObject({
        mode: 'verified',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        translated: 'Titulo atualizado',
      });
      const ignored = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/nominal')
        .set('authorization', `Bearer ${fixture.token()}`)
        .expect(200);
      expect(ignored.body).toMatchObject({ mode: 'nominal', translated: 'title' });
    });

    it('cannot turn an authenticated HTTP request into internal owner administration', async () => {
      fixture.observations.length = 0;
      await request(fixture.app.getHttpServer())
        .get('/_i18n-public/system')
        .set(authorizedHeaders())
        .expect(403)
        .expect(({ body }) =>
          expect(body.message).toBe('I18n internal administration is unavailable to HTTP requests'),
        );
      expect(fixture.observations.some((row) => row.requestedRole === 'owner')).toBe(false);
    });

    it('keeps nominal provenance through localized HTTP error handling', async () => {
      fixture.settingsQueries.length = 0;
      const response = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/error')
        .expect(400);
      expect(response.body).toEqual({ code: 'I18N_PUBLIC_TEST', message: 'title' });
      expect(fixture.settingsQueries).toEqual([]);
    });

    it('keeps concurrent nominal and verified HTTP subscriptions isolated', async () => {
      const [nominal, verified] = await Promise.all([
        request(fixture.app.getHttpServer()).get('/_i18n-public/concurrent-nominal').expect(200),
        request(fixture.app.getHttpServer())
          .get('/_i18n-public/concurrent-verified')
          .set('authorization', `Bearer ${fixture.token()}`)
          .expect(200),
      ]);
      expect(nominal.body).toMatchObject({ mode: 'nominal', translated: 'title' });
      expect(verified.body).toMatchObject({ mode: 'verified', translated: 'Titulo atualizado' });
    });

    it('keeps independent authenticated tenant caches and settings isolated', async () => {
      const otherHeaders = {
        authorization: `Bearer ${fixture.token('otherWriter')}`,
        'x-tenant-id': OTHER_TENANT_ID,
      };
      await request(fixture.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(otherHeaders)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toEqual({ 'i18n.override.pt-BR.title': 'Other tenant secret' }),
        );
      await request(fixture.app.getHttpServer())
        .put('/_tenancy/i18n/overrides')
        .set(otherHeaders)
        .send({ locale: 'pt-BR', catalog: { title: 'Other tenant updated' } })
        .expect(200);
      await request(fixture.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(authorizedHeaders())
        .expect(200)
        .expect(({ body }) => expect(body['i18n.override.pt-BR.title']).toBe('Titulo atualizado'));
      await request(fixture.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set(otherHeaders)
        .expect(200)
        .expect(({ body }) =>
          expect(body['i18n.override.pt-BR.title']).toBe('Other tenant updated'),
        );
    });

    it('preserves protected tenant translations in concurrent localized errors', async () => {
      const [first, second] = await Promise.all([
        request(fixture.app.getHttpServer())
          .get('/_i18n-public/concurrent-error')
          .set(authorizedHeaders())
          .expect(400),
        request(fixture.app.getHttpServer())
          .get('/_i18n-public/concurrent-error')
          .set('authorization', `Bearer ${fixture.token('otherWriter')}`)
          .set('x-tenant-id', OTHER_TENANT_ID)
          .expect(400),
      ]);
      expect(first.body).toEqual({ code: 'I18N_PUBLIC_TEST', message: 'Titulo atualizado' });
      expect(second.body).toEqual({ code: 'I18N_PUBLIC_TEST', message: 'Other tenant updated' });
      const isolated = await request(fixture.app.getHttpServer())
        .get('/_i18n-public/protected-error')
        .set(authorizedHeaders())
        .expect(400);
      expect(isolated.body).toEqual({ code: 'I18N_PUBLIC_TEST', message: 'Titulo atualizado' });
    });

    it('refuses incompatible internal system tenant frames before owner SQL or mutation', async () => {
      const admin = fixture.moduleRef.get(I18nAdminService);
      for (const patch of [
        { tenantId: OTHER_TENANT_ID, actorId: ACTOR_ID },
        { tenantId: TENANT_ID, actorId: undefined },
      ]) {
        fixture.observations.length = 0;
        await fixture.database.withSystemContext(
          'explicit system frame rejection witness',
          async () => {
            fixture.requestContextMutator.patch(patch);
            await expect(admin.listOverrides(TENANT_ID)).rejects.toThrow();
            await expect(
              admin.updateOverrides(TENANT_ID, { locale: 'pt-BR', catalog: { frameLeak: 'No' } }),
            ).rejects.toThrow();
          },
        );
        expect(fixture.observations).toEqual([]);
      }
      await fixture.database.withSystemContext(
        'explicit compatible system frame witness',
        async () => {
          fixture.requestContextMutator.patch({ tenantId: TENANT_ID, actorId: ACTOR_ID });
          await expect(admin.listOverrides(TENANT_ID)).resolves.toMatchObject({
            'i18n.override.pt-BR.title': 'Titulo atualizado',
          });
        },
      );
    });

    it('shows FORCE RLS filters a direct restricted reader even without a tenant WHERE clause', async () => {
      await fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          startedAt: new Date(),
        },
        async () => {
          await fixture.database.tx(
            async (trx) => {
              const rows = await trx.query(
                'select tenant_id from tenancy.tenant_settings order by tenant_id',
              );
              expect(rows.rows).toEqual([{ tenant_id: TENANT_ID }]);
              const roles = await trx.query(
                "select current_user,session_user,row_security_active('tenancy.tenant_settings'::regclass) active",
              );
              expect(roles.rows[0]).toEqual({
                current_user: 'stynx_reader',
                session_user: 'stynx_reader',
                active: true,
              });
            },
            { role: 'reader', readonly: true, replica: false },
          );
        },
      );
    });

    it('refuses a revoked genuine session', async () => {
      await fixture.store.revokeSession('reader', new Date().toISOString(), 'revoked');
      await request(testApp.app.getHttpServer())
        .get('/_tenancy/i18n/overrides')
        .set('x-tenant-id', TENANT_ID)
        .set('authorization', `Bearer ${fixture.token('reader')}`)
        .expect(401);
    });
  });
});
