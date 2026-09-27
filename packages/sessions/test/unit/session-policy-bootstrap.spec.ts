import { generateKeyPairSync } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { RedisSessionStore } from '../../src/redis-session-store';
import { StynxSessionsModule } from '../../src/sessions.module';
import { STYNX_SESSION_STORE } from '../../src/tokens';
import type { StynxSessionsModuleOptions } from '../../src/types';

// UPS-SES-01/02: invalid opt-in policy must fail while Nest constructs the module.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const base: StynxSessionsModuleOptions = {
  issuer: 'https://sessions.test',
  redis: { url: 'redis://127.0.0.1:6379' },
  jwt: { keySet: { currentKid: 'boot', keys: [{
    kid: 'boot',
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }] } },
};

describe('UPS-SES-01/02 module boot validation', () => {
  it('rejects an enabled policy when a legacy custom store lacks the atomic operation', async () => {
    const store = new InMemorySessionStore();
    const legacyStore = Object.fromEntries(
      Object.getOwnPropertyNames(Object.getPrototypeOf(store))
        .filter((name) => name !== 'constructor' && name !== 'createWithPolicy')
        .map((name) => [name, (...args: unknown[]) => (store as unknown as Record<string, (...args: unknown[]) => unknown>)[name](...args)]),
    );
    await expect(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [StynxSessionsModule.forRoot({ ...base, singleSession: { mode: 'reject-new' } } as StynxSessionsModuleOptions)],
      }).overrideProvider(RedisSessionStore).useValue(legacyStore)
        .overrideProvider(STYNX_SESSION_STORE).useValue(legacyStore)
        .compile();
      const app = moduleRef.createNestApplication();
      try { await app.init(); } finally { await app.close(); }
    }).rejects.toBeDefined();
  });

  it.each([[], ['  ']])('rejects empty accepted factor values %s', async (acceptedValues) => {
    await expect(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [StynxSessionsModule.forRoot({ ...base, strongFactor: { acceptedValues } } as StynxSessionsModuleOptions)],
      }).overrideProvider(RedisSessionStore).useValue(new InMemorySessionStore())
        .overrideProvider(STYNX_SESSION_STORE).useValue(new InMemorySessionStore())
        .compile();
      const app = moduleRef.createNestApplication();
      try { await app.init(); } finally { await app.close(); }
    }).rejects.toBeDefined();
  });
});
