import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { RedisSessionStore } from '../../src/redis-session-store';
import { RefreshTokenReuseDetectedError } from '../../src/errors';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionService } from '../../src/session.service';
import { resolveSessionsOptions, type SessionMirror, type StynxSessionsModuleOptions } from '../../src/types';

// UPS-SES-01: separate clients share one Redis script/transaction boundary.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keySet = { currentKid: 'redis-policy', keys: [{
  kid: 'redis-policy',
  publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}] };

describe('UPS-SES-01 Redis atomic single-session policy', () => {
  let container: StartedTestContainer;
  const stores: RedisSessionStore[] = [];
  let url: string;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  }, 60_000);

  afterAll(async () => {
    await Promise.all(stores.map((store) => store.onModuleDestroy()));
    await container?.stop();
  });

  async function service(mode: 'revoke-existing' | 'reject-new', prefix: string) {
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url, keyPrefix: prefix },
      jwt: { keySet },
      singleSession: { mode },
    } as StynxSessionsModuleOptions);
    const store = new RedisSessionStore(options);
    await store.onModuleInit();
    stores.push(store);
    const mirror: SessionMirror = { append: async () => undefined };
    return { session: new SessionService(options, store, new SessionJwtSigningService(options), mirror), store };
  }

  it.each(['revoke-existing', 'reject-new'] as const)('%s is atomic under simultaneous creates from two clients', async (mode) => {
    const prefix = `stynx:ctg3:${randomUUID()}`;
    const a = await service(mode, prefix);
    const b = await service(mode, prefix);
    const attempts = await Promise.allSettled([
      a.session.create('u', 't', 'c'),
      b.session.create('u', 't', 'c'),
    ]);
    const fulfilled = attempts.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<SessionService['create']>>> => item.status === 'fulfilled');
    const ids = await a.store.listSessionIdsByUser('u');
    const active = (await Promise.all(ids.map((sid) => b.session.get(sid)))).filter(Boolean);
    expect(active).toHaveLength(1);
    expect(await b.store.listSessionIdsByTenant('t')).toEqual([active[0]?.sid]);
    if (mode === 'reject-new') {
      expect(fulfilled).toHaveLength(1);
      expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(1);
    } else {
      expect(fulfilled).toHaveLength(2);
      const revoked = fulfilled.find((item) => item.value.sid !== active[0]?.sid);
      expect(revoked?.value).toMatchObject({ sid: expect.any(String), refreshToken: expect.any(String) });
      expect(revoked!.value.sid).not.toBe(active[0]?.sid);
      await expect(b.session.refresh(revoked!.value.refreshToken)).rejects.toThrow(RefreshTokenReuseDetectedError);
    }
  });
});
