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

const demoTenantA = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
const demoTenantB = '01978f4a-32bf-7c27-a131-fd73a9e001a2';
const adminAEmail = 'profile-admin@sample-demo.test';
const adminBEmail = 'profile-admin@sample-ops.test';

interface DevLoginResponse {
  accessToken: string;
  tenantId: string;
  email: string;
  permissions: string[];
}

interface UserProfileRow extends Record<string, unknown> {
  id: string;
  email: string;
  external_subject: string | null;
  locale: string | null;
}

interface TenantSettingsRow extends Record<string, unknown> {
  tenant_id: string;
  locale: string | null;
  timezone: string | null;
  settings: Record<string, unknown>;
}

type Overrides = Record<string, string>;

function referenceRequest(context: ReferenceApiE2eContext) {
  return request(context.app.getHttpServer());
}

function i18nRequest(context: ReferenceApiE2eContext, token: string, tenantId: string) {
  const authenticated = (method: 'get' | 'put') =>
    referenceRequest(context)
      [method]('/_tenancy/i18n/overrides')
      .set('authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);

  return {
    get: () => authenticated('get'),
    put: () => authenticated('put'),
  };
}

async function readUserByEmail(context: ReferenceApiE2eContext, email: string): Promise<UserProfileRow> {
  return context.database.withSystemContext('profile e2e user read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<UserProfileRow>(
          `
            select id::text, email::text, external_subject, locale
            from auth.users
            where email = $1::citext
            limit 1
          `,
          [email],
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error(`Missing auth user for ${email}`);
        }
        return row;
      },
      { role: 'owner', readonly: true },
    ),
  );
}

async function readTenantSettings(context: ReferenceApiE2eContext, tenantId: string): Promise<TenantSettingsRow> {
  return context.database.withSystemContext('profile e2e tenant settings read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<TenantSettingsRow>(
          `
            select tenant_id::text, locale, timezone, settings
            from tenancy.tenant_settings
            where tenant_id = $1::uuid
            limit 1
          `,
          [tenantId],
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error(`Missing tenant settings for ${tenantId}`);
        }
        return row;
      },
      { role: 'owner', readonly: true },
    ),
  );
}

async function setTenantLocale(context: ReferenceApiE2eContext, tenantId: string, locale: string): Promise<void> {
  await context.database.withSystemContext('profile e2e tenant locale update', async () =>
    context.database.tx(
      async (trx) => {
        await trx.query(
          `
            update tenancy.tenant_settings
               set locale = $2,
                   updated_at = clock_timestamp()
             where tenant_id = $1::uuid
          `,
          [tenantId, locale],
        );
      },
      { role: 'owner', readonly: false },
    ),
  );
}

async function login(context: ReferenceApiE2eContext, email: string, tenantSlug: string): Promise<DevLoginResponse> {
  const response = await referenceRequest(context)
    .post('/_reference/dev-login')
    .send({ email, tenantSlug })
    .expect(201);
  return response.body as DevLoginResponse;
}

describe('@stynx/reference-api e2e profile and preferences', () => {
  let context: ReferenceApiE2eContext;
  let adminA: DevLoginResponse;
  let adminB: DevLoginResponse;
  let adminAUserId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e({
      databaseName: 'reference_api_profile_preferences',
      includeI18n: true,
    });
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('creates the user profile through dev login, verifies the session, and persists preferences', async () => {
    adminA = await login(context, adminAEmail, 'sample-demo');
    expect(adminA).toEqual(expect.objectContaining({
      tenantId: demoTenantA,
      email: adminAEmail,
      permissions: expect.arrayContaining(['sample:record:read', 'sample:record:write']),
    }));

    await referenceRequest(context)
      .get('/_reference/auth-verify')
      .set('authorization', `Bearer ${adminA.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ status: 'ok' });
      });

    const profile = await readUserByEmail(context, adminAEmail);
    adminAUserId = profile.id;
    expect(profile).toMatchObject({
      email: adminAEmail,
      external_subject: `reference-dev:${adminAEmail}`,
      locale: 'en-US',
    });
    await auditExpect(context.database, 'users', 'INSERT', {
      schema: 'auth',
      rowId: adminAUserId,
    });

    await expect(readTenantSettings(context, demoTenantA)).resolves.toMatchObject({
      tenant_id: demoTenantA,
      locale: 'en-US',
      settings: {},
    });
    await auditExpect(context.database, 'tenant_settings', 'INSERT', {
      schema: 'tenancy',
      rowId: demoTenantA,
    });

    const preferences = (await i18nRequest(context, adminA.accessToken, demoTenantA)
      .put()
      .send({
        locale: 'pt-BR',
        catalog: {
          'profile.preference.locale': 'pt-BR',
          'profile.preference.notifications': 'enabled',
        },
      })
      .expect(200)).body as Overrides;

    expect(preferences).toMatchObject({
      'i18n.override.pt-BR.profile.preference.locale': 'pt-BR',
      'i18n.override.pt-BR.profile.preference.notifications': 'enabled',
    });
    await expect(readTenantSettings(context, demoTenantA)).resolves.toMatchObject({
      tenant_id: demoTenantA,
      settings: expect.objectContaining({
        'i18n.override.pt-BR.profile.preference.locale': 'pt-BR',
      }),
    });
    await auditExpect(context.database, 'tenant_settings', 'UPDATE', {
      schema: 'tenancy',
      rowId: demoTenantA,
    });
  });

  it('rejects blank profile identity input before creating a user', async () => {
    await referenceRequest(context)
      .post('/_reference/dev-login')
      .send({ email: '   ', tenantSlug: 'sample-demo' })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Email is required');
      });
  });

  it('keeps preference reads and writes scoped to the active tenant', async () => {
    adminB = await login(context, adminBEmail, 'sample-ops');

    await i18nRequest(context, adminB.accessToken, demoTenantB)
      .put()
      .send({
        locale: 'pt-BR',
        catalog: {
          'profile.preference.locale': 'en-US',
          'profile.preference.notifications': 'disabled',
        },
      })
      .expect(200);
    await auditExpect(context.database, 'tenant_settings', 'UPDATE', {
      schema: 'tenancy',
      rowId: demoTenantB,
    });

    await i18nRequest(context, adminB.accessToken, demoTenantA)
      .get()
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('TENANT_ACCESS_DENIED');
      });

    await i18nRequest(context, adminA.accessToken, demoTenantA)
      .get()
      .expect(200)
      .expect(({ body }: { body: Overrides }) => {
        expect(body).toMatchObject({
          'i18n.override.pt-BR.profile.preference.notifications': 'enabled',
        });
        expect(body['i18n.override.pt-BR.profile.preference.notifications']).not.toBe('disabled');
      });

    await i18nRequest(context, adminB.accessToken, demoTenantB)
      .get()
      .expect(200)
      .expect(({ body }: { body: Overrides }) => {
        expect(body).toMatchObject({
          'i18n.override.pt-BR.profile.preference.notifications': 'disabled',
        });
      });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<TenantSettingsRow>(
          context,
          tenantId,
          adminAUserId,
          'select tenant_id::text, locale, timezone, settings from tenancy.tenant_settings',
        ),
      { tenantA: demoTenantA, tenantB: demoTenantB },
    );
  });

  it('uses the stored locale preference when resolving localized profile copy', async () => {
    await setTenantLocale(context, demoTenantA, 'pt-BR');
    await auditExpect(context.database, 'tenant_settings', 'UPDATE', {
      schema: 'tenancy',
      rowId: demoTenantA,
    });

    const localeService = context.app.get(LocaleService);
    const result = await context.requestContextMutator.runWithRequestContext(
      {
        requestId: generateRequestId(),
        tenantId: demoTenantA,
        actorId: adminAUserId,
        startedAt: new Date(),
      },
      async () => {
        const locale = await localeService.resolve(undefined);
        return {
          locale,
          translated: localeService.t('profile.preference.locale'),
        };
      },
    );

    expect(result).toEqual({
      locale: 'pt-BR',
      translated: 'pt-BR',
    });
  });
});
