import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenancyController } from '../../src/tenancy.controller';
import { TenancyPlatformAdminGuard } from '../../src/tenancy-platform-admin.guard';
import { TenancyService } from '../../src/tenancy.service';

describe('TenancyController E2E', () => {
  let app: INestApplication;
  const tenancyService = {
    listTenants: vi.fn(() => [{ id: 'tenant-1', slug: 'tenant-one' }]),
    getTenant: vi.fn((id: string) => ({ id })),
    provisionTenant: vi.fn(),
    updateTenant: vi.fn(),
    suspendTenant: vi.fn(),
    archiveTenant: vi.fn(),
    purgeTenant: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenancyController],
      providers: [{ provide: TenancyService, useValue: tenancyService }],
    })
      .overrideGuard(TenancyPlatformAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves tenant inventory through the HTTP route', async () => {
    await request(app.getHttpServer())
      .get('/tenants')
      .expect(200)
      .expect([{ id: 'tenant-1', slug: 'tenant-one' }]);
  });
});
