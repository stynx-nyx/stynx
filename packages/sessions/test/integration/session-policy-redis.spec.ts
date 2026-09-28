import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { RedisSessionStore } from '../../src/redis-session-store';
import { RefreshTokenReuseDetectedError, SessionConflictError } from '../../src/errors';
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

  async function service(
    mode: 'revoke-existing' | 'reject-new',
    prefix: string,
    clock?: () => Date,
    idleSeconds = 2,
  ) {
    const options = resolveSessionsOptions({
      issuer: 'https://sessions.test',
      redis: { url, keyPrefix: prefix },
      jwt: { keySet },
      singleSession: { mode },
      ...(clock ? { clock } : {}),
      ...(clock ? { timeouts: { idleSeconds } } : {}),
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

  it.each(['revoke-existing', 'reject-new'] as const)(
    '%s excludes the prior session during a same-tenant exchange and rejects its refresh token after commit',
    async (mode) => {
      const prefix = `stynx:ctg3:${randomUUID()}`;
      const a = await service(mode, prefix);
      const b = await service(mode, prefix);
      const prior = await a.session.create('u', 'tenant', 'c');

      const switched = await b.session.exchange({
        sessionId: prior.sid,
        actorUserId: 'u',
        newTenantId: 'tenant',
      });

      expect(switched.revokedSessionId).toBe(prior.sid);
      await expect(a.session.get(prior.sid)).resolves.toBe(null);
      await expect(a.session.refresh(prior.refreshToken)).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);
      await expect(a.session.get(switched.bundle.sid)).resolves.toMatchObject({ status: 'active' });
      await expect(a.session.refresh(switched.bundle.refreshToken)).resolves.toMatchObject({ sid: switched.bundle.sid });
    },
  );

  it('reject-new target conflict leaves the prior session active and refreshable', async () => {
    const prefix = `stynx:ctg3:${randomUUID()}`;
    const a = await service('reject-new', prefix);
    const b = await service('reject-new', prefix);
    const prior = await a.session.create('u', 'source', 'c');
    const target = await b.session.create('u', 'target', 'c');

    await expect(b.session.exchange({
      sessionId: prior.sid,
      actorUserId: 'u',
      newTenantId: 'target',
    })).rejects.toBeInstanceOf(SessionConflictError);
    await expect(a.session.get(prior.sid)).resolves.toMatchObject({ status: 'active' });
    await expect(a.session.refresh(prior.refreshToken)).resolves.toMatchObject({ sid: prior.sid });
    await expect(a.session.get(target.sid)).resolves.toMatchObject({ status: 'active' });
  });

  it.each(['revoke-existing', 'reject-new'] as const)(
    '%s ignores idle-expired target records during exchange using the controlled clock',
    async (mode) => {
      const initialTime = new Date(Date.now() + 60_000);
      let now = initialTime;
      const prefix = `stynx:ctg3:${randomUUID()}`;
      const a = await service(mode, prefix, () => now, 10);
      const b = await service(mode, prefix, () => now, 2);
      const prior = await a.session.create('u', 'source', 'c');
      const expiredTarget = await b.session.create('u', 'target', 'c');
      now = new Date(initialTime.getTime() + 3_000);

      const switched = await b.session.exchange({
        sessionId: prior.sid,
        actorUserId: 'u',
        newTenantId: 'target',
      });

      expect(switched.revokedSessionId).toBe(prior.sid);
      if (mode === 'revoke-existing') {
        expect(switched.bundle.revokedSessionIds).not.toContain(expiredTarget.sid);
      }
      expect(switched.bundle.sid).not.toBe(expiredTarget.sid);
      await expect(a.session.get(switched.bundle.sid)).resolves.toMatchObject({ status: 'active' });
    },
  );

  it.each(['revoke-existing', 'reject-new'] as const)(
    '%s leaves a session in another tenant active and refreshable after exchange',
    async (mode) => {
      const prefix = `stynx:ctg3:${randomUUID()}`;
      const a = await service(mode, prefix);
      const b = await service(mode, prefix);
      const prior = await a.session.create('u', 'source', 'c');
      const otherTenant = await b.session.create('u', 'other', 'c');

      const switched = await b.session.exchange({
        sessionId: prior.sid,
        actorUserId: 'u',
        newTenantId: 'target',
      });

      expect(switched.revokedSessionId).toBe(prior.sid);
      await expect(a.session.get(otherTenant.sid)).resolves.toMatchObject({ status: 'active' });
      await expect(a.session.refresh(otherTenant.refreshToken)).resolves.toMatchObject({ sid: otherTenant.sid });
    },
  );

  it.each(['revoke-existing', 'reject-new'] as const)(
    '%s serializes a same-tenant exchange racing a create across two Redis clients',
    async (mode) => {
      const prefix = `stynx:ctg3:${randomUUID()}`;
      const a = await service(mode, prefix);
      const b = await service(mode, prefix);
      const prior = await a.session.create('u', 'tenant', 'c');
      const outcomes = await Promise.allSettled([
        a.session.exchange({ sessionId: prior.sid, actorUserId: 'u', newTenantId: 'tenant' }),
        b.session.create('u', 'tenant', 'c'),
      ]);

      const ids = await a.store.listSessionIdsByUser('u');
      const active = (await Promise.all(ids.map((sid) => b.session.get(sid)))).filter(Boolean);
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ tenantId: 'tenant', status: 'active' });
      expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
      await expect(b.session.refresh(prior.refreshToken)).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);
      if (mode === 'reject-new') {
        expect(outcomes[0]?.status).toBe('fulfilled');
        expect(outcomes[1]?.status).toBe('rejected');
      }
    },
  );
});
