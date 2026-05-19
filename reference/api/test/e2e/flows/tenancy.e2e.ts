import { auditExpect, expectRLSIsolated } from '@stynx/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { actors, tenants } from '../fixtures/seed';

const lifecycleTenants = {
  update: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
  suspend: '01978f4a-32bf-7c27-a131-fd73a9e201a2',
  archive: '01978f4a-32bf-7c27-a131-fd73a9e201a3',
  purge: '01978f4a-32bf-7c27-a131-fd73a9e201a4',
  unknown: '01978f4a-32bf-7c27-a131-fd73a9e201ff',
} as const;

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  state: 'active' | 'provisioning' | 'suspended' | 'archived' | 'purged';
  isActive: boolean;
}

interface TenantDetail extends TenantSummary {
  timezone: string | null;
  locale: string | null;
  settings: Record<string, unknown>;
  suspendedReason: string | null;
  archivedAt: string | null;
}

interface ProvisionTenantBody {
  tenant: TenantDetail;
  invitationToken: string;
  ownerUserId: string;
}

interface SuspendTenantBody {
  tenant: TenantDetail;
  activeSessionCount: number;
}

interface ArchiveTenantBody {
  tenant: TenantDetail;
  exportKey: string;
}

interface PurgeTenantBody {
  tenant: TenantDetail;
}

async function seedLifecycleTenants(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    await client.query(
      `
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values
          ($1::uuid, 'e2e-tenant-update', 'E2E Tenant Update', 'active', true, clock_timestamp(), clock_timestamp()),
          ($2::uuid, 'e2e-tenant-suspend', 'E2E Tenant Suspend', 'active', true, clock_timestamp(), clock_timestamp()),
          ($3::uuid, 'e2e-tenant-archive', 'E2E Tenant Archive', 'active', true, clock_timestamp(), clock_timestamp()),
          ($4::uuid, 'e2e-tenant-purge', 'E2E Tenant Purge', 'active', true, clock_timestamp(), clock_timestamp())
      `,
      [
        lifecycleTenants.update,
        lifecycleTenants.suspend,
        lifecycleTenants.archive,
        lifecycleTenants.purge,
      ],
    );
  } finally {
    await client.end();
  }
}

async function queryTenantsForRls(context: ReferenceApiE2eContext, tenantId: string) {
  return queryRowsAsTenant<{ id: string; tenant_id: string }>(
    context,
    tenantId,
    actors.adminA.userId,
    'select id::text, id::text as tenant_id from tenancy.tenants order by created_at asc',
  );
}

describe('@stynx/reference-api e2e tenancy', () => {
  let context: ReferenceApiE2eContext;
  let previousPlatformAdminFlag: string | undefined;
  let authorization = '';
  let provisionedTenantId = '';

  beforeAll(async () => {
    previousPlatformAdminFlag = process.env.STYNX_TENANCY_PLATFORM_ADMIN;
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';

    context = await setupReferenceApiE2e({ databaseName: 'reference_api_tenancy' });
    authorization = `Bearer ${context.tokens.adminA}`;
    await seedLifecycleTenants(context);
  }, 180_000);

  afterEach(() => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';
  });

  afterAll(async () => {
    if (previousPlatformAdminFlag === undefined) {
      delete process.env.STYNX_TENANCY_PLATFORM_ADMIN;
    } else {
      process.env.STYNX_TENANCY_PLATFORM_ADMIN = previousPlatformAdminFlag;
    }
    await closeReferenceApiE2e(context);
  });

  function api() {
    return {
      get: (path: string) =>
        request(context.app.getHttpServer()).get(path).set('authorization', authorization),
      post: (path: string) =>
        request(context.app.getHttpServer()).post(path).set('authorization', authorization),
      patch: (path: string) =>
        request(context.app.getHttpServer()).patch(path).set('authorization', authorization),
    };
  }

  it('lists, provisions, reads, and updates tenants with audit rows', async () => {
    await api()
      .get('/tenants')
      .expect(200)
      .expect(({ body }: { body: TenantSummary[] }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: tenants.tenantA,
              slug: 'e2e-tenant-a',
              state: 'active',
            }),
            expect.objectContaining({
              id: lifecycleTenants.update,
              slug: 'e2e-tenant-update',
              state: 'active',
            }),
          ]),
        );
      });

    const provisioned = (await api()
      .post('/tenants')
      .send({
        slug: 'e2e-tenant-created',
        name: 'E2E Tenant Created',
        ownerEmail: 'e2e-tenant-created-owner@example.com',
        ownerLocale: 'pt-BR',
      })
      .expect(201)).body as ProvisionTenantBody;
    provisionedTenantId = provisioned.tenant.id;
    expect(provisioned).toMatchObject({
      tenant: {
        slug: 'e2e-tenant-created',
        name: 'E2E Tenant Created',
        state: 'active',
        isActive: true,
      },
      invitationToken: expect.any(String),
      ownerUserId: expect.any(String),
    });
    await auditExpect(context.database, 'tenants', 'INSERT', {
      schema: 'tenancy',
      rowId: provisionedTenantId,
    });

    await api()
      .get(`/tenants/${provisionedTenantId}`)
      .expect(200)
      .expect(({ body }: { body: TenantDetail }) => {
        expect(body).toEqual(
          expect.objectContaining({
            id: provisionedTenantId,
            slug: 'e2e-tenant-created',
            settings: {},
          }),
        );
      });

    await api()
      .patch(`/tenants/${lifecycleTenants.update}`)
      .send({
        name: 'E2E Tenant Updated',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        settings: { billing: 'manual', wave: '04' },
      })
      .expect(200)
      .expect(({ body }: { body: TenantDetail }) => {
        expect(body).toEqual(
          expect.objectContaining({
            id: lifecycleTenants.update,
            slug: 'e2e-tenant-update',
            name: 'E2E Tenant Updated',
            timezone: 'America/Sao_Paulo',
            locale: 'pt-BR',
            settings: { billing: 'manual', wave: '04' },
          }),
        );
      });
    await auditExpect(context.database, 'tenants', 'UPDATE', {
      schema: 'tenancy',
      rowId: lifecycleTenants.update,
    });
    await auditExpect(context.database, 'tenant_settings', 'INSERT', {
      schema: 'tenancy',
      rowId: lifecycleTenants.update,
    });
  });

  it('suspends, archives, and purges tenants with lifecycle audit rows', async () => {
    const suspended = (await api()
      .post(`/tenants/${lifecycleTenants.suspend}/suspend`)
      .send({ reason: 'manual policy review' })
      .expect(201)).body as SuspendTenantBody;
    expect(suspended).toMatchObject({
      tenant: {
        id: lifecycleTenants.suspend,
        state: 'suspended',
        isActive: false,
        suspendedReason: 'manual policy review',
      },
      activeSessionCount: 0,
    });
    await auditExpect(context.database, 'tenants', 'UPDATE', {
      schema: 'tenancy',
      rowId: lifecycleTenants.suspend,
    });

    const archived = (await api()
      .post(`/tenants/${lifecycleTenants.archive}/archive`)
      .expect(201)).body as ArchiveTenantBody;
    expect(archived).toMatchObject({
      tenant: {
        id: lifecycleTenants.archive,
        state: 'archived',
        isActive: false,
        archivedAt: expect.any(String),
      },
      exportKey: `tenants/${lifecycleTenants.archive}/exports/placeholder.json`,
    });
    await auditExpect(context.database, 'tenants', 'UPDATE', {
      schema: 'tenancy',
      rowId: lifecycleTenants.archive,
    });

    const purged = (await api()
      .post(`/tenants/${lifecycleTenants.purge}/purge`)
      .expect(201)).body as PurgeTenantBody;
    expect(purged).toMatchObject({
      tenant: {
        id: lifecycleTenants.purge,
        state: 'purged',
        isActive: false,
      },
    });
    await auditExpect(context.database, 'tenants', 'UPDATE', {
      schema: 'tenancy',
      rowId: lifecycleTenants.purge,
    });
  });

  it('denies platform tenant operations when the platform-admin guard is disabled', async () => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'false';

    await api()
      .post('/tenants')
      .send({
        slug: 'e2e-tenant-forbidden',
        name: 'E2E Tenant Forbidden',
        ownerEmail: 'e2e-tenant-forbidden-owner@example.com',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          statusCode: 403,
          message: 'PLATFORM_ADMIN_DISABLED',
        });
      });
  });

  it('keeps tenant rows isolated under tenant-scoped RLS reads', async () => {
    await api()
      .get(`/tenants/${lifecycleTenants.unknown}`)
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          statusCode: 404,
          message: 'TENANT_NOT_FOUND',
        });
      });

    await expectRLSIsolated(
      (tenantId) => queryTenantsForRls(context, tenantId),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expect(queryTenantsForRls(context, tenants.tenantA)).resolves.toEqual([
      expect.objectContaining({
        id: tenants.tenantA,
        tenant_id: tenants.tenantA,
      }),
    ]);
  });
});
