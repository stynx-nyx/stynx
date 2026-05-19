import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StynxHealthModule } from '../../src/health.module';
import type { StynxHealthModuleOptions } from '../../src/tokens';

async function createHealthApp(options: StynxHealthModuleOptions = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [StynxHealthModule.forRoot(options)],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('StynxHealthController API error matrix', () => {
  let previousInfoFlag: string | undefined;

  beforeEach(() => {
    previousInfoFlag = process.env.STYNX_PLATFORM_INFO_ENABLED;
  });

  afterEach(() => {
    if (previousInfoFlag === undefined) {
      delete process.env.STYNX_PLATFORM_INFO_ENABLED;
    } else {
      process.env.STYNX_PLATFORM_INFO_ENABLED = previousInfoFlag;
    }
  });

  describe('GET /healthz', () => {
    let app: INestApplication;

    beforeEach(async () => {
      app = await createHealthApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 200 for liveness', async () => {
      await request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
    });
  });

  describe('GET /info', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app.close();
    });

    it('returns 200 when platform info is enabled', async () => {
      process.env.STYNX_PLATFORM_INFO_ENABLED = 'true';
      app = await createHealthApp({ appInfo: { app: 'api-matrix' } });

      await request(app.getHttpServer())
        .get('/info')
        .expect(200)
        .expect({ status: 'ok', app: 'api-matrix' });
    });

    it('returns 403 when platform info is disabled', async () => {
      delete process.env.STYNX_PLATFORM_INFO_ENABLED;
      app = await createHealthApp({ appInfo: { app: 'api-matrix' } });

      await request(app.getHttpServer())
        .get('/info')
        .expect(403)
        .expect((response) => {
          expect(response.body).toMatchObject({
            statusCode: 403,
            message: 'Platform info endpoint is disabled',
          });
        });
    });
  });

  describe('GET /metrics', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app.close();
    });

    it('returns 200 with Prometheus metrics when no IP allowlist is configured', async () => {
      app = await createHealthApp();

      await request(app.getHttpServer())
        .get('/metrics')
        .expect(200)
        .expect('content-type', /text\/plain/)
        .expect((response) => {
          expect(response.text).toContain('http_request_total');
        });
    });

    it('returns 403 when the client IP is outside the metrics allowlist', async () => {
      app = await createHealthApp({ metricsIpAllowlist: ['203.0.113.1'] });

      await request(app.getHttpServer())
        .get('/metrics')
        .expect(403)
        .expect((response) => {
          expect(response.body).toMatchObject({
            statusCode: 403,
            message: 'Metrics endpoint is restricted',
          });
        });
    });
  });

  describe('GET /readyz', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app.close();
    });

    it('returns 200 when downstream checks are healthy', async () => {
      app = await createHealthApp({
        pgCheck: async () => undefined,
        redisCheck: async () => undefined,
      });

      await request(app.getHttpServer())
        .get('/readyz')
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            status: 'ok',
            info: {
              postgres: { status: 'up' },
              redis: { status: 'up' },
            },
          });
        });
    });

    it('returns 503 when a downstream readiness check is unhealthy', async () => {
      app = await createHealthApp({
        pgCheck: async () => {
          throw new Error('postgres unavailable');
        },
      });

      await request(app.getHttpServer())
        .get('/readyz')
        .expect(503)
        .expect((response) => {
          expect(response.body).toMatchObject({
            status: 'error',
            error: {
              postgres: { error: 'postgres unavailable' },
            },
            details: {
              postgres: { status: 'down', error: 'postgres unavailable' },
            },
          });
        });
    });
  });
});
