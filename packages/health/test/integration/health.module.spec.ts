import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { StynxHealthController } from '../../src/health.controller';
import { StynxHealthModule } from '../../src/health.module';

describe('StynxHealthModule integration', () => {
  it('exposes the expected health endpoints through the controller surface', async () => {
    process.env.STYNX_PLATFORM_INFO_ENABLED = 'true';
    let payload = '';
    let contentType = '';

    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxHealthModule.forRoot({
          appInfo: { app: 'demo' },
          metricsIpAllowlist: ['10.0.0.1'],
          pgCheck: async () => undefined,
          redisCheck: async () => undefined,
        }),
      ],
    }).compile();

    const controller = moduleRef.get(StynxHealthController);

    expect(controller.liveness()).toEqual({ status: 'ok' });
    await expect(controller.readiness()).resolves.toMatchObject({ status: 'ok' });

    await controller.metricsEndpoint(
      { ip: '10.0.0.1' },
      {
        setHeader(name: string, value: string) {
          if (name === 'content-type') {
            contentType = value;
          }
        },
        send(body: string) {
          payload = body;
        },
      },
    );

    expect(contentType).toContain('text/plain');
    expect(payload).toContain('http_request_total');
    expect(controller.info()).toMatchObject({ status: 'ok', app: 'demo' });
  });

  it('surfaces readiness failures as 503 errors', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxHealthModule.forRoot({
          pgCheck: async () => {
            throw new Error('db down');
          },
        }),
      ],
    }).compile();

    const controller = moduleRef.get(StynxHealthController);
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
