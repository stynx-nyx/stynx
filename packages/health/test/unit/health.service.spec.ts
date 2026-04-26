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
