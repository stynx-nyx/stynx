import { StynxHealthService } from '../../src/health.service';

describe('StynxHealthService', () => {
  it('fails readiness when a dependency is down', async () => {
    const service = new StynxHealthService(
      {
        pgCheck: async () => {
          throw new Error('db down');
        },
      },
      [],
    );

    await expect(service.readiness()).rejects.toThrow('stynx readiness failed');
  });

  it('captures non-Error dependency failures and down indicators without details', async () => {
    const service = new StynxHealthService(
      {
        redisCheck: async () => {
          throw 'cache down';
        },
      },
      [
        {
          name: 'custom',
          check: async () => ({ status: 'down' as const }),
        },
      ],
    );

    await expect(service.readiness()).rejects.toMatchObject({
      causes: expect.objectContaining({
        error: expect.objectContaining({
          redis: { error: 'cache down' },
          custom: { status: 'down' },
        }),
      }),
    });
  });

  it('returns a structured success payload when dependencies are healthy', async () => {
    const service = new StynxHealthService(
      {
        pgCheck: async () => undefined,
      },
      [],
    );

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ok',
      info: {
        postgres: { status: 'up' },
      },
    });
  });

  it('reports skipped built-in checks when callbacks are omitted', async () => {
    const service = new StynxHealthService({}, []);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      info: {
        postgres: { status: 'up', skipped: true },
        redis: { status: 'up', skipped: true },
        jwks: { status: 'up', skipped: true },
        s3: { status: 'up', skipped: true },
      },
      error: {},
      details: {
        postgres: { status: 'up', skipped: true },
        redis: { status: 'up', skipped: true },
        jwks: { status: 'up', skipped: true },
        s3: { status: 'up', skipped: true },
      },
    });
  });

  it('keeps custom indicator details and marks any down indicator as a readiness error', async () => {
    const service = new StynxHealthService(
      {
        pgCheck: async () => undefined,
      },
      [
        {
          name: 'search',
          check: async () => ({
            status: 'down' as const,
            details: { latencyMs: 250, reason: 'timeout' },
          }),
        },
      ],
    );

    await expect(service.readiness()).rejects.toMatchObject({
      causes: {
        status: 'error',
        info: expect.objectContaining({
          postgres: { status: 'up' },
          search: { status: 'down', latencyMs: 250, reason: 'timeout' },
        }),
        error: {
          search: { latencyMs: 250, reason: 'timeout' },
        },
        details: expect.objectContaining({
          search: { status: 'down', latencyMs: 250, reason: 'timeout' },
        }),
      },
    });
  });
});
