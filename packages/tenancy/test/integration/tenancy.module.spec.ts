import { CanActivate, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateRequestId, RequestContext } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { StynxTenancyModule } from '../../src/tenancy.module';
import { TenancyService } from '../../src/tenancy.service';


interface TestRequest {
  headers: Record<string, unknown>;
  principal?: { id?: string };
  stynxClaims?: { sub: string; tenantId: string };
  tenantId?: string;
}

class FakePrincipalGuard implements CanActivate {
  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TestRequest>();
    const userIdHeader = request.headers['x-test-user-id'];
    const userId = typeof userIdHeader === 'string' ? userIdHeader : undefined;
    if (userId) {
      request.principal = { id: userId };
    }
    const claimTenantId = request.headers['x-test-claim-tenant-id'];
    if (userId && typeof claimTenantId === 'string') {
      request.stynxClaims = { sub: userId, tenantId: claimTenantId };
    }
    return true;
  }
}

@Controller()
@UseGuards(FakePrincipalGuard)
class ProtectedController {
  constructor(private readonly requestContext: RequestContext) {}

  @Get('/protected')
  protected(@Req() request: TestRequest) {
    return {
      tenantId: this.requestContext.tenantId,
      requestTenantId: request.tenantId,
    };
  }
}

async function seedBaseState(client: import('pg').Client): Promise<void> {
  await client.query(`
    insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
    values
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'tenant-one', 'Tenant One', 'active', true, clock_timestamp(), clock_timestamp()),
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c2', 'tenant-two', 'Tenant Two', 'active', true, clock_timestamp(), clock_timestamp())
  `);
  await client.query(`
    insert into auth.users (id, email, created_at, updated_at)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2831a', 'owner@example.com', clock_timestamp(), clock_timestamp())
  `);
  await client.query(`
    insert into auth.memberships (id, tenant_id, user_id, is_active, created_at)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831a', true, clock_timestamp())
  `);
}

describe('StynxTenancyModule integration', () => {
  let database: PostgresTestDatabase;
  let app: INestApplication;
  let service: TenancyService;

  beforeAll(async () => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';
    database = await createPostgresTestDatabase('stynx_tenancy');

    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx-nyx/tenancy:owner') },
            app: { connectionString: database.connectionString('@stynx-nyx/tenancy:app') },
            reader: { connectionString: database.connectionString('@stynx-nyx/tenancy:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxTenancyModule.forRoot({
          headerName: 'X-Tenant-Id',
          allowSubdomain: true,
        }),
      ],
      controllers: [ProtectedController],
      providers: [FakePrincipalGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    service = moduleRef.get(TenancyService);

    const admin = await database.connectAsAdmin();
    try {
      await seedBaseState(admin);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    delete process.env.STYNX_TENANCY_PLATFORM_ADMIN;
    await app?.close();
    await database?.dispose();
  });

  it('resolves tenant from header, bearer claim, and subdomain', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('x-request-id', generateRequestId())
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .set('x-tenant-id', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1')
      .expect(200)
      .expect(({ body }) => {
        expect(body.requestTenantId).toBe('0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
      });

    await request(app.getHttpServer())
      .get('/protected')
      .set('x-request-id', generateRequestId())
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .set('x-test-claim-tenant-id', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1')
      .expect(200)
      .expect(({ body }) => {
        expect(body.requestTenantId).toBe('0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
      });

    await request(app.getHttpServer())
      .get('/protected')
      .set('x-request-id', generateRequestId())
      .set('host', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1.example.test')
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.requestTenantId).toBe('0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
      });
  });

  it('rejects missing or invalid tenant context and wrong tenant access', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .expect(400)
      .expect(({ body }) => {
        expect(String(body.message)).toContain('Tenant context is required');
      });

    await request(app.getHttpServer())
      .get('/protected')
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .set('x-tenant-id', 'not-a-uuidv7')
      .expect(400);

    await request(app.getHttpServer())
      .get('/protected')
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .set('x-tenant-id', '0197481e-6f84-77e4-8d6d-41f0b6fca9c2')
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('TENANT_ACCESS_DENIED');
      });
  });

  it('provisions tenants idempotently under concurrent retries', async () => {
    const [first, second] = await Promise.all([
      service.provisionTenant({
        slug: 'tenant-three',
        name: 'Tenant Three',
        ownerEmail: 'tenant-three@example.com',
      }),
      service.provisionTenant({
        slug: 'tenant-three',
        name: 'Tenant Three',
        ownerEmail: 'tenant-three@example.com',
      }),
    ]);

    expect(first.tenant.id).toBe(second.tenant.id);
    expect(first.tenant.state).toBe('active');

    const admin = await database.connectAsAdmin();
    try {
      const tenants = await admin.query<{ count: string }>(
        `select count(*)::text as count from tenancy.tenants where slug = 'tenant-three'`,
      );
      const roles = await admin.query<{ count: string }>(
        `select count(*)::text as count from auth.roles where tenant_id = $1::uuid`,
        [first.tenant.id],
      );
      expect(Number(tenants.rows[0]?.count ?? '0')).toBe(1);
      expect(Number(roles.rows[0]?.count ?? '0')).toBe(4);
    } finally {
      await admin.end();
    }
  });

  it('suspends a tenant and blocks subsequent access', async () => {
    const suspended = await service.suspendTenant('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', {
      reason: 'manual policy review',
    });
    expect(suspended.tenant.isActive).toBe(false);
    expect(suspended.tenant.state).toBe('suspended');

    await request(app.getHttpServer())
      .get('/protected')
      .set('x-test-user-id', '0197481e-7294-7c53-8b03-5c36d7c2831a')
      .set('x-tenant-id', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1')
      .expect(403);
  });
});
