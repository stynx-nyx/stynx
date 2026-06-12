import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RequestContext } from '@stynx/core';
import { I18nAdminService } from '../../src/i18n-admin.service';
import { I18nController } from '../../src/i18n.controller';

describe('I18nController E2E', () => {
  let app: INestApplication;
  const adminService = {
    listOverrides: vi.fn(() => [{ locale: 'pt-BR', key: 'hello', value: 'Ola' }]),
    updateOverrides: vi.fn((tenantId: string, input: unknown) => ({ tenantId, input })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [I18nController],
      providers: [
        { provide: I18nAdminService, useValue: adminService },
        { provide: RequestContext, useValue: { tenantId: 'tenant-1' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes tenant override reads through the HTTP controller', async () => {
    const response = await request(app.getHttpServer()).get('/_tenancy/i18n/overrides').expect(200);

    expect(response.body).toEqual([{ locale: 'pt-BR', key: 'hello', value: 'Ola' }]);
    expect(adminService.listOverrides).toHaveBeenCalledWith('tenant-1');
  });
});
