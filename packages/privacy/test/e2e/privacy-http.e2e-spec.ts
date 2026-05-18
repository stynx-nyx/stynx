import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrivacyController } from '../../src/privacy.controller';
import { PrivacyService } from '../../src/privacy.service';

describe('PrivacyController E2E', () => {
  let app: INestApplication;
  const privacyService = {
    applyRetention: vi.fn((dryRun: boolean) => ({ dryRun, actions: [] })),
    eraseSubject: vi.fn(() => ({ erased: true })),
    exportData: vi.fn(() => ({ files: [] })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [{ provide: PrivacyService, useValue: privacyService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves retention dry-run requests through HTTP', async () => {
    const response = await request(app.getHttpServer()).get('/privacy/retention').expect(200);

    expect(response.body).toEqual({ dryRun: true, actions: [] });
    expect(privacyService.applyRetention).toHaveBeenCalledWith(true);
  });
});
