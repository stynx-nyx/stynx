import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StynxHealthModule } from '../../src/health.module';

describe('StynxHealthModule E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STYNX_PLATFORM_INFO_ENABLED = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxHealthModule.forRoot({
          appInfo: { app: 'e2e' },
          pgCheck: async () => undefined,
          redisCheck: async () => undefined,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness, readiness, metrics, and platform info endpoints', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
    await request(app.getHttpServer()).get('/readyz').expect(200);
    await request(app.getHttpServer()).get('/metrics').expect(200);
    await request(app.getHttpServer())
      .get('/info')
      .expect(200)
      .expect({ status: 'ok', app: 'e2e' });
  });
});
