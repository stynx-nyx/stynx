import { CanActivate, Controller, Get, Injectable, Req, UseGuards } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicTenantRoute } from '@stynx-nyx/auth';
import { RequestContext, StynxCoreModule } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import request from 'supertest';
import { z } from 'zod';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { StynxTenancyModule } from '../../src/tenancy.module';

const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const MEMBER_A = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const NOMINAL_ACTOR = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

type ProbeRequest = { headers: Record<string, unknown>; principal?: { id: string }; tenantId?: string };

@Injectable()
class PreInterceptorProbeGuard implements CanActivate {
  seenRequestId: string | undefined;

  constructor(private readonly context: RequestContext) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProbeRequest>();
    if (request.headers['x-probe-member'] === 'true') request.principal = { id: MEMBER_A };
    // This read is the proof that CLS middleware seeded before every guard.
    this.seenRequestId = this.context.requestId;
    return true;
  }
}

@Controller('/order')
@UseGuards(PreInterceptorProbeGuard)
class OrderProbeController {
  constructor(private readonly context: RequestContext) {}

  @Get('/protected')
  protected(@Req() request: ProbeRequest) {
    return { requestId: this.context.requestId, tenantId: request.tenantId };
  }

  @Get('/public')
  @PublicTenantRoute()
  public(@Req() request: ProbeRequest) {
    return { requestId: this.context.requestId, tenantId: request.tenantId };
  }
}

type GlobalInterceptor = { constructor: { name: string } };
type BuiltApp = { app: INestApplication; guard: PreInterceptorProbeGuard; interceptorNames: string[] };

function forceGlobalInterceptorOrder(app: INestApplication, order: 'core-first' | 'tenancy-first'): string[] {
  // Tenancy imports core itself, so import order alone leaves core registered first.
  // The fixture orders Nest's already-registered, real interceptor instances before serving requests.
  const runtime = app as unknown as { config: { getGlobalInterceptors(): GlobalInterceptor[] } };
  const interceptors = runtime.config.getGlobalInterceptors();
  const core = interceptors.find((interceptor) => interceptor.constructor.name === 'RequestContextInterceptor');
  const tenancy = interceptors.find((interceptor) => interceptor.constructor.name === 'TenantContextInterceptor');
  if (!core || !tenancy) throw new Error('Expected core and tenancy APP_INTERCEPTOR registrations');
  const remaining = interceptors.filter((interceptor) => interceptor !== core && interceptor !== tenancy);
  interceptors.splice(0, interceptors.length, ...(order === 'core-first' ? [core, tenancy] : [tenancy, core]), ...remaining);
  return interceptors.map((interceptor) => interceptor.constructor.name);
}

async function buildApp(postgres: PostgresTestDatabase, order: 'core-first' | 'tenancy-first'): Promise<BuiltApp> {
  const core = StynxCoreModule.forRoot({ appName: `order-${order}`, schema: z.object({}) });
  const tenancy = StynxTenancyModule.forRoot({
    publicTenant: {
      resolveHost: ({ host }: { host?: string }) => host === 'a.order.test' ? TENANT_A : undefined,
      actorId: NOMINAL_ACTOR,
    },
  });
  const imports = order === 'core-first' ? [core, tenancy] : [tenancy, core];
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: postgres.connectionString(`order-${order}-owner`) },
          app: { connectionString: postgres.connectionString(`order-${order}-app`) },
          reader: { connectionString: postgres.connectionString(`order-${order}-reader`) },
        },
        migrations: { enabled: true },
      }),
      ...imports,
    ],
    controllers: [OrderProbeController],
    providers: [PreInterceptorProbeGuard],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return {
    app,
    guard: moduleRef.get(PreInterceptorProbeGuard),
    interceptorNames: forceGlobalInterceptorOrder(app, order),
  };
}

describe('core and tenancy interceptor registration order', () => {
  let postgres: PostgresTestDatabase;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_tenancy_order');
    const bootstrap = await buildApp(postgres, 'core-first');
    await bootstrap.app.close();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values ($1::uuid, 'order-a', 'Order A', 'active', true, clock_timestamp(), clock_timestamp())`, [TENANT_A]);
      await admin.query(`insert into auth.users (id, email, created_at, updated_at)
        values ($1::uuid, 'order-member@example.test', clock_timestamp(), clock_timestamp())`, [MEMBER_A]);
      await admin.query(`insert into auth.memberships (id, tenant_id, user_id, is_active, created_at)
        values ('0197481e-7294-7c53-8b03-5c36d7c2832a'::uuid, $1::uuid, $2::uuid, true, clock_timestamp())`, [TENANT_A, MEMBER_A]);
    } finally { await admin.end(); }
  });

  afterAll(async () => postgres?.dispose());

  it.each(['core-first', 'tenancy-first'] as const)('serves protected and public routes with one pre-guard request context when %s', async (order) => {
    const built = await buildApp(postgres, order);
    try {
      const coreIndex = built.interceptorNames.indexOf('RequestContextInterceptor');
      const tenancyIndex = built.interceptorNames.indexOf('TenantContextInterceptor');
      expect(coreIndex).toBeGreaterThanOrEqual(0);
      expect(tenancyIndex).toBeGreaterThanOrEqual(0);
      expect(coreIndex < tenancyIndex).toBe(order === 'core-first');

      for (const path of ['/order/protected', '/order/public']) {
        built.guard.seenRequestId = undefined;
        const call = request(built.app.getHttpServer()).get(path);
        if (path.endsWith('protected')) call.set('x-probe-member', 'true').set('x-tenant-id', TENANT_A);
        else call.set('host', 'a.order.test');
        await call.expect(200).expect(({ body, headers }) => {
          const generatedId = headers['x-request-id'];
          expect(generatedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
          expect(built.guard.seenRequestId).toBe(generatedId);
          expect(body).toMatchObject({ requestId: generatedId, tenantId: TENANT_A });
        });
      }
    } finally { await built.app.close(); }
  });
});
