import { generateRequestId } from '@stynx/core';
import { LocaleService } from '@stynx/i18n';
import { auditExpect, expectRLSIsolated } from '@stynx/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { actors, tenants } from '../fixtures/seed';

interface TenantSettingsRow extends Record<string, unknown> {
  tenant_id: string;
  locale: string | null;
  settings: Record<string, unknown> | null;
}

type Overrides = Record<string, string>;

function i18nRequest(context: ReferenceApiE2eContext, token: string, tenantId: string) {
  const authenticated = (method: 'get' | 'put') =>
    request(context.app.getHttpServer())
      [method]('/_tenancy/i18n/overrides')
      .set('authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);

  return {
    get: () => authenticated('get'),
    put: () => authenticated('put'),
  };
}

async function seedTenantSettings(context: ReferenceApiE2eContext): Promise<void> {
  await context.database.withSystemContext('i18n e2e tenant settings seed', async () =>
    context.database.tx(
      async (trx) => {
        await trx.query(
          `
            insert into tenancy.tenant_settings (tenant_id, locale, settings, updated_at)
            values
              ($1::uuid, 'pt-BR', $3::jsonb, clock_timestamp()),
              ($2::uuid, 'en-US', $4::jsonb, clock_timestamp())
            on conflict (tenant_id)
            do update set
              locale = excluded.locale,
              settings = excluded.settings,
              updated_at = clock_timestamp()
          `,
          [
            tenants.tenantA,
            tenants.tenantB,
            JSON.stringify({
              'i18n.override.en-US.dashboard.title': 'Existing dashboard',
            }),
            JSON.stringify({
              'i18n.override.pt-BR.dashboard.title': 'Tenant B dashboard',
            }),
          ],
        );
      },
      { role: 'owner', readonly: false, replica: false },
    ),
  );
}

async function readSettings(context: ReferenceApiE2eContext, tenantId: string): Promise<TenantSettingsRow> {
  return context.database.withSystemContext('i18n e2e settings read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<TenantSettingsRow>(
          `
            select tenant_id::text, locale, settings
            from tenancy.tenant_settings
            where tenant_id = $1::uuid
          `,
          [tenantId],
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error(`Missing tenant settings for ${tenantId}`);
        }
        return row;
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

describe('@stynx/reference-api e2e i18n', () => {
  let context: ReferenceApiE2eContext;

  beforeAll(async () => {
    context = await setupReferenceApiE2e({
      databaseName: 'reference_api_i18n',
      includeI18n: true,
    });
    await seedTenantSettings(context);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('updates tenant locale overrides over HTTP and persists them in tenant settings', async () => {
    const response = await i18nRequest(context, context.tokens.adminA, tenants.tenantA)
      .put()
      .send({
        locale: 'pt-BR',
        catalog: {
          'dashboard.title': 'Painel E2E',
          'dashboard.subtitle': 'Resumo localizado',
        },
      })
      .expect(200);

    expect(response.body as Overrides).toMatchObject({
      'i18n.override.en-US.dashboard.title': 'Existing dashboard',
      'i18n.override.pt-BR.dashboard.title': 'Painel E2E',
      'i18n.override.pt-BR.dashboard.subtitle': 'Resumo localizado',
    });

    await expect(readSettings(context, tenants.tenantA)).resolves.toMatchObject({
      tenant_id: tenants.tenantA,
      locale: 'pt-BR',
      settings: expect.objectContaining({
        'i18n.override.pt-BR.dashboard.title': 'Painel E2E',
      }),
    });
    await auditExpect(context.database, 'tenant_settings', 'UPDATE', {
      schema: 'tenancy',
      rowId: tenants.tenantA,
    });
  });

  it('uses the tenant settings locale when no supported Accept-Language header is present', async () => {
    const localeService = context.app.get(LocaleService);

    const result = await context.requestContextMutator.runWithRequestContext(
      {
        requestId: generateRequestId(),
        tenantId: tenants.tenantA,
        actorId: actors.adminA.userId,
        startedAt: new Date(),
      },
      async () => {
        const locale = await localeService.resolve(undefined);
        return {
          locale,
          translated: localeService.t('dashboard.title'),
        };
      },
    );

    expect(result).toEqual({
      locale: 'pt-BR',
      translated: 'Painel E2E',
    });
  });

  it('returns a validation error for malformed override JSON', async () => {
    await i18nRequest(context, context.tokens.adminA, tenants.tenantA)
      .put()
      .set('content-type', 'application/json')
      .send('{"locale":')
      .expect(400);
  });

  it('keeps tenant override reads scoped by tenant and RLS', async () => {
    await i18nRequest(context, context.tokens.adminB, tenants.tenantA)
      .get()
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('TENANT_ACCESS_DENIED');
      });

    await i18nRequest(context, context.tokens.adminB, tenants.tenantB)
      .get()
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          'i18n.override.pt-BR.dashboard.title': 'Tenant B dashboard',
        });
      });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<TenantSettingsRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select tenant_id::text, locale, settings from tenancy.tenant_settings',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });
});
