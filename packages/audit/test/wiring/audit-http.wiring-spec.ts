import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { StynxAuditController } from '../../src/audit.controller';
import { StynxAuditService } from '../../src/audit.service';

describe('StynxAuditController E2E', () => {
  let app: INestApplication;
  const auditService = {
    listLog: vi.fn(() => [{ id: 'audit-1', operation: 'read' }]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StynxAuditController],
      providers: [{ provide: StynxAuditService, useValue: auditService }],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves audit log queries through the HTTP route', async () => {
    const response = await request(app.getHttpServer()).get('/_audit/log?limit=1').expect(200);

    expect(response.body).toEqual([{ id: 'audit-1', operation: 'read' }]);
    expect(auditService.listLog).toHaveBeenCalledWith(expect.objectContaining({ limit: '1' }));
  });
});
