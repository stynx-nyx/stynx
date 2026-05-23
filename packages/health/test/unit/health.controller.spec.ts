import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { StynxHealthController } from '../../src/health.controller';
import type { StynxHealthService } from '../../src/health.service';
import type { StynxMetricsService } from '../../src/metrics.service';

describe('StynxHealthController API contract', () => {
  function createController(readiness: () => Promise<unknown>, allowlist?: string[]) {
    const healthService = { readiness } as unknown as StynxHealthService;
    const metrics = {
      registry: { contentType: 'text/plain; version=0.0.4' },
      render: vi.fn(async () => 'metric 1\n'),
    } as unknown as StynxMetricsService;
    return {
      controller: new StynxHealthController(healthService, metrics, {
        ...(allowlist ? { metricsIpAllowlist: allowlist } : {}),
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

  it('rethrows non-terminus readiness failures', async () => {
    const error = new Error('unexpected');
    const { controller } = createController(async () => {
      throw error;
    });

    await expect(controller.readiness()).rejects.toBe(error);
  });

  it('restricts metrics by configured IP allowlist', async () => {
    const { controller, metrics } = createController(async () => ({ status: 'ok' }), ['127.0.0.1']);
    const response = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await expect(controller.metricsEndpoint({ ip: '10.0.0.1' }, response)).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Metrics endpoint is restricted' }),
    });
    await controller.metricsEndpoint({ ip: '127.0.0.1' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; version=0.0.4');
    expect(response.send).toHaveBeenCalledWith('metric 1\n');
    expect(metrics.render).toHaveBeenCalledTimes(1);
  });

  it('allows metrics without an allowlist and falls back to empty client IP', async () => {
    const { controller } = createController(async () => ({ status: 'ok' }));
    const emptyIpAllowed = createController(async () => ({ status: 'ok' }), ['']);
    const response = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.metricsEndpoint({}, response);

    expect(response.send).toHaveBeenCalledWith('metric 1\n');
    await expect(emptyIpAllowed.controller.metricsEndpoint({}, response)).resolves.toBe(undefined);
  });

  it('returns base info when app info is omitted', () => {
    const healthService = { readiness: vi.fn() } as unknown as StynxHealthService;
    const metrics = {
      registry: { contentType: 'text/plain' },
      render: vi.fn(async () => ''),
    } as unknown as StynxMetricsService;
    const controller = new StynxHealthController(healthService, metrics, {});

    expect(controller.info()).toEqual({ status: 'ok' });
  });
});
