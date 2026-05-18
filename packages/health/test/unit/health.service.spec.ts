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
});
