import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PermissionGuard } from '../../src/permission.guard';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { StynxAuthController } from '../../src/auth.controller';
import { StynxAuthService } from '../../src/auth.service';

describe('StynxAuthController E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StynxAuthController],
      providers: [{ provide: StynxAuthService, useValue: {} }],
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
    await app?.close();
  });

  it('rejects session exchange requests without a tenant header', async () => {
    await request(app.getHttpServer())
      .post('/sessions')
      .send({ cognitoToken: 'token' })
      .expect(403);
  });

  it('rejects tenant-scoped session exchange requests without a Cognito token', async () => {
    await request(app.getHttpServer())
      .post('/sessions')
      .set('x-tenant-id', 'tenant-1')
      .send({})
      .expect(401);
  });
});
