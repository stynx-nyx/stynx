import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { StynxHealthController } from '../../src/health.controller';
import type { StynxHealthService } from '../../src/health.service';
import type { StynxMetricsService } from '../../src/metrics.service';

describe('StynxHealthController API contract', () => {
  function createController(readiness: () => Promise<unknown>, allowlist: string[] = []) {
    const healthService = { readiness } as unknown as StynxHealthService;
    const metrics = {
      registry: { contentType: 'text/plain; version=0.0.4' },
      render: jest.fn(async () => 'metric 1\n'),
    } as unknown as StynxMetricsService;
    return {
      controller: new StynxHealthController(healthService, metrics, {
        metricsIpAllowlist: allowlist,
        appInfo: { name: 'stynx-test' },
      }),
      metrics,
    };
  }

  it('returns liveness and app info payloads', () => {
    const { controller } = createController(async () => ({ status: 'ok' }));

    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(controller.info()).toEqual({ status: 'ok', name: 'stynx-test' });
  });

  it('maps terminus readiness failures to 503 responses', async () => {
    const { controller } = createController(async () => {
      throw new HealthCheckError('stynx readiness failed', { postgres: { status: 'down' } });
    });

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('restricts metrics by configured IP allowlist', async () => {
    const { controller, metrics } = createController(async () => ({ status: 'ok' }), ['127.0.0.1']);
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await expect(controller.metricsEndpoint({ ip: '10.0.0.1' }, response)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await controller.metricsEndpoint({ ip: '127.0.0.1' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; version=0.0.4');
    expect(response.send).toHaveBeenCalledWith('metric 1\n');
    expect(metrics.render).toHaveBeenCalledTimes(1);
  });
});
