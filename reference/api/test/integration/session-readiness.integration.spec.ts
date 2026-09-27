import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Test } from '@nestjs/testing';
import { StynxHealthModule, StynxHealthService } from '@stynx-nyx/health';
import { createSessionStoreReadinessIndicator, RedisSessionStore } from '@stynx-nyx/sessions';
import { resolveSessionsOptions } from '@stynx-nyx/sessions';

// UPS-SES-03: the existing health composition sees Redis reconnect state promptly.
describe('session store readiness composition', () => {
  const execFileAsync = promisify(execFile);
  let container: StartedTestContainer;
  let store: RedisSessionStore;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    store = new RedisSessionStore(resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url: `redis://${container.getHost()}:${container.getMappedPort(6379)}` },
      jwt: { keySet: { currentKid: 'unused', keys: [] } },
    }));
    await store.onModuleInit();
  }, 60_000);

  afterAll(async () => {
    if (container) {
      await execFileAsync('docker', ['unpause', container.getId()]).catch(() => undefined);
    }
    await store?.onModuleDestroy();
    await container?.stop();
  });

  it('reports up, down within the timeout while reconnecting, then up after recovery', async () => {
    const timeoutMs = 250;
    const indicator = createSessionStoreReadinessIndicator(store, { timeoutMs });
    const moduleRef = await Test.createTestingModule({
      imports: [StynxHealthModule.forRoot({}, [indicator])],
    }).compile();
    const health = moduleRef.get(StynxHealthService);

    expect((await health.readiness()).details['stynx-session-store']?.status).toBe('up');

    await execFileAsync('docker', ['pause', container.getId()]);
    try {
      const started = performance.now();
      await expect(health.readiness()).rejects.toMatchObject({
        causes: expect.objectContaining({
          details: expect.objectContaining({
            'stynx-session-store': expect.objectContaining({ status: 'down' }),
          }),
        }),
      });
      expect(performance.now() - started).toBeLessThan(timeoutMs + 400);
    } finally {
      await execFileAsync('docker', ['unpause', container.getId()]);
    }

    await vi.waitFor(async () => {
      expect((await health.readiness()).details['stynx-session-store']?.status).toBe('up');
    }, { timeout: 10_000, interval: 100 });
  });
});
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
