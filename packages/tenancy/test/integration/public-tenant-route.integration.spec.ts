import { Controller, Get, Module, Req, UseGuards } from '@nestjs/common';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestContext } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import request from 'supertest';
import { PublicTenantRoute, StynxAuthModule } from '@stynx-nyx/auth';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { StynxTenancyModule } from '../../src/tenancy.module';

const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const TENANT_B = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const SUSPENDED_TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c3';
const NOMINAL_ACTOR = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VERIFIED_MEMBER_A = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const VERIFIED_WITHOUT_MEMBERSHIP = '0197481e-7294-7c53-8b03-5c36d7c2831b';

type PublicRequest = {
  headers: Record<string, string | undefined>;
  tenantId?: string;
  principal?: { id: string; roles: string[]; permissions: string[] };
  stynxClaims?: { sub: string; tenantId: string; sid?: string };
};

class VerifiedOptionalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PublicRequest>();
    const token = request.headers.authorization;
    if (token === 'Bearer verified-a') {
      request.stynxClaims = { sub: VERIFIED_MEMBER_A, tenantId: TENANT_A, sid: 'session-a' };
      request.principal = { id: VERIFIED_MEMBER_A, roles: ['member'], permissions: ['records:read'] };
    }
    if (token === 'Bearer verified-b') {
      request.stynxClaims = { sub: VERIFIED_MEMBER_A, tenantId: TENANT_B, sid: 'session-b' };
      request.principal = { id: VERIFIED_MEMBER_A, roles: ['member'], permissions: ['records:read'] };
    }
    if (token === 'Bearer verified-no-membership') {
      request.stynxClaims = { sub: VERIFIED_WITHOUT_MEMBERSHIP, tenantId: TENANT_A, sid: 'session-none' };
      request.principal = { id: VERIFIED_WITHOUT_MEMBERSHIP, roles: ['member'], permissions: ['records:read'] };
    }
    // Any forged or malformed text intentionally provides no verified identity.
    return true;
  }
}

@Controller('/portal')
@UseGuards(VerifiedOptionalAuthGuard)
class PublicTenantController {
  constructor(
    private readonly context: RequestContext,
    private readonly database: Database,
  ) {}

  @Get('/anonymous')
  @PublicTenantRoute()
  anonymous(@Req() request: PublicRequest) {
    return {
      requestTenantId: request.tenantId,
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      roles: request.principal?.roles ?? [],
      permissions: request.principal?.permissions ?? [],
    };
  }

  @Get('/optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() request: PublicRequest) {
    return {
      requestTenantId: request.tenantId,
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      sessionId: this.context.sessionId,
      roles: request.principal?.roles ?? [],
      permissions: request.principal?.permissions ?? [],
    };
  }

  @Get('/audit-write')
  @PublicTenantRoute()
  async auditedWrite() {
    const event = await this.database.tx(async (trx) => {
      await trx.query(
        `select audit.write(
          p_tenant_id => current_setting('app.tenant_id', true)::uuid,
          p_actor_id => current_setting('app.actor_id', true)::uuid,
          p_actor_role => 'public-tenant',
          p_operation => 'INSERT',
          p_entity => 'portal.public_record',
          p_entity_id => 'public-write',
          p_metadata => '{"source":"public-tenant-route"}'::jsonb,
          p_old_data => null,
          p_new_data => '{"created":true}'::jsonb
        )`,
      );
      return trx.query<{ event_id: string; tenancy_id: string; actor_id: string }>(
        `select event_id::text, tenancy_id::text, actor_id::text
         from audit.events
         where tenancy_id = current_setting('app.tenant_id', true)::uuid
         order by occurred_at desc, event_id desc
         limit 1`,
      );
    });
    return event.rows[0];
  }

  @Get('/audit-read')
  @PublicTenantRoute()
  async auditedRead() {
    return this.database.tx(async (trx) => {
      await trx.query('set local role stynx_app');
      const identity = await trx.query<{ current_user: string }>('select current_user');
      const result = await trx.query<{ event_id: string }>(
        `select event_id::text from audit.events where entity = 'portal.public_record' order by occurred_at`,
      );
      return { currentUser: identity.rows[0]?.current_user, rows: result.rows };
    });
  }
}

@Module({ controllers: [PublicTenantController], providers: [VerifiedOptionalAuthGuard] })
class PublicTenantRoutesModule {}

@Controller('/bootstrap')
class MissingTenancyController {
  @Get('/public')
  @PublicTenantRoute()
  publicRoute() {
    return { status: 'unreachable' };
  }
}

describe('public tenant route contract', () => {
  let app: INestApplication;
  let postgres: PostgresTestDatabase;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_public_tenant_route');
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('public-tenant-owner') },
            app: { connectionString: postgres.connectionString('public-tenant-app') },
            reader: { connectionString: postgres.connectionString('public-tenant-reader') },
          },
          migrations: { enabled: true },
        }),
        StynxTenancyModule.forRoot({
          headerName: 'X-Tenant-Id',
          publicTenant: {
            resolveHost: ({ host, path }: { host?: string; path: string }) => {
              if (!path.startsWith('/portal/')) return undefined;
              return host === 'a.portal.test'
                ? TENANT_A
                : host === 'b.portal.test'
                  ? TENANT_B
                  : host === 'suspended.portal.test'
                    ? SUSPENDED_TENANT
                    : undefined;
            },
            actorId: NOMINAL_ACTOR,
          },
        } as never),
        PublicTenantRoutesModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values
          ($1::uuid, 'public-a', 'Public A', 'active', true, clock_timestamp(), clock_timestamp()),
          ($2::uuid, 'public-b', 'Public B', 'active', true, clock_timestamp(), clock_timestamp()),
          ($3::uuid, 'public-suspended', 'Public Suspended', 'suspended', false, clock_timestamp(), clock_timestamp())
      `, [TENANT_A, TENANT_B, SUSPENDED_TENANT]);
      await admin.query(`
        insert into auth.users (id, email, created_at, updated_at)
        values
          ($1::uuid, 'verified-member-a@example.test', clock_timestamp(), clock_timestamp()),
          ($2::uuid, 'verified-no-membership@example.test', clock_timestamp(), clock_timestamp())
      `, [VERIFIED_MEMBER_A, VERIFIED_WITHOUT_MEMBERSHIP]);
      await admin.query(`
        insert into auth.memberships (id, tenant_id, user_id, is_active, created_at)
        values ($1::uuid, $2::uuid, $3::uuid, true, clock_timestamp())
      `, ['0197481e-7294-7c53-8b03-5c36d7c2832a', TENANT_A, VERIFIED_MEMBER_A]);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  });

  it('fails application initialization when a marked route has no tenancy module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StynxAuthModule.forRoot({} as never)],
      controllers: [MissingTenancyController],
    }).compile();
    const missingTenancyApp = moduleRef.createNestApplication();

    await expect(missingTenancyApp.init()).rejects.toThrow(/PublicTenantRoute.*StynxTenancyModule/i);
    await missingTenancyApp.close();
  });

  it('uses raw Host as the public selector, preserves the nominal actor, and ignores a forged token', async () => {
    await request(app.getHttpServer())
      .get('/portal/anonymous')
      .set('host', 'a.portal.test')
      .set('authorization', `Bearer forged.${Buffer.from(JSON.stringify({ sub: TENANT_B, tenantId: TENANT_B })).toString('base64url')}.token`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          requestTenantId: TENANT_A,
          tenantId: TENANT_A,
          actorId: NOMINAL_ACTOR,
          roles: [],
          permissions: [],
        });
      });
  });

  it('rejects a verified optional token whose actor has no Host-tenant membership without public downgrade', async () => {
    await request(app.getHttpServer())
      .get('/portal/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer verified-no-membership')
      .expect(403)
      .expect({
        message: 'TENANT_ACCESS_DENIED',
        error: 'Forbidden',
        statusCode: 403,
      });
  });

  it('rejects Host/header and Host/verified-claim conflicts with exact documented bodies', async () => {
    await request(app.getHttpServer())
      .get('/portal/anonymous')
      .set('host', 'a.portal.test')
      .set('x-tenant-id', TENANT_B)
      .expect(400)
      .expect({
        code: 'TENANCY:CONFLICT:host-header',
        message: 'Tenant source conflict: Host and X-Tenant-Id disagree',
      });

    await request(app.getHttpServer())
      .get('/portal/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer verified-b')
      .expect(400)
      .expect({
        code: 'TENANCY:CONFLICT:host-claim',
        message: 'Tenant source conflict: Host and authenticated claim disagree',
      });
  });

  it('allows absent or invalid optional tokens as public, but retains a verified same-tenant identity and session', async () => {
    for (const authorization of [undefined, 'Bearer invalid']) {
      const call = request(app.getHttpServer()).get('/portal/optional').set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(200).expect(({ body }) => {
        expect(body).toMatchObject({
          requestTenantId: TENANT_A,
          tenantId: TENANT_A,
          actorId: NOMINAL_ACTOR,
          roles: [],
          permissions: [],
        });
      });
    }

    await request(app.getHttpServer())
      .get('/portal/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer verified-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          requestTenantId: TENANT_A,
          tenantId: TENANT_A,
          actorId: VERIFIED_MEMBER_A,
          sessionId: 'session-a',
          roles: ['member'],
          permissions: ['records:read'],
        });
      });
  });

  it('uses the existing missing-tenant body when Host cannot resolve a tenant', async () => {
    await request(app.getHttpServer())
      .get('/portal/anonymous')
      .set('host', 'unknown.portal.test')
      .expect(400)
      .expect({
        message: 'Tenant context is required: provide X-Tenant-Id, a tenant bearer claim, or a matching subdomain',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it('rejects a suspended Host-selected public tenant before route access', async () => {
    await request(app.getHttpServer())
      .get('/portal/anonymous')
      .set('host', 'suspended.portal.test')
      .expect(403)
      .expect({
        message: 'TENANT_ACCESS_DENIED',
        error: 'Forbidden',
        statusCode: 403,
      });
  });

  it('writes the nominal UUID actor under Host tenant A and RLS never exposes that row to Host tenant B', async () => {
    await request(app.getHttpServer())
      .get('/portal/audit-write')
      .set('host', 'a.portal.test')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ tenancy_id: TENANT_A, actor_id: NOMINAL_ACTOR });
      });

    await request(app.getHttpServer())
      .get('/portal/audit-read')
      .set('host', 'b.portal.test')
      .expect(200)
      .expect({ currentUser: 'stynx_app', rows: [] });
  });
});
