import { execFile } from 'node:child_process';
import { createPublicKey, generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { createClient } from 'redis';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { StynxDataModule } from '@stynx/data';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { InMemorySessionStore } from '../../src/in-memory-session-store';
import { RedisSessionStore } from '../../src/redis-session-store';
import { StynxSessionsModule } from '../../src/sessions.module';
import { SessionService } from '../../src/session.service';
import { STYNX_SESSION_STORE } from '../../src/tokens';

const execFileAsync = promisify(execFile);

interface RedisDockerContainer {
  id: string;
  host: string;
  port: number;
}


function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'integration-key-1',
    keys: [
      {
        kid: 'integration-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

function decodeTokenSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

function verifyJwt(
  token: string,
  jwk: JsonWebKey,
  expectedIssuer: string,
  clockToleranceSeconds = 0,
): Record<string, unknown> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('JWT is malformed');
  }

  const payload = decodeTokenSegment(encodedPayload);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    key,
    Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedSignature.length / 4) * 4, '='),
      'base64',
    ),
  );
  expect(valid).toBe(true);
  expect(payload.iss).toBe(expectedIssuer);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === 'number') {
    expect(payload.nbf - nowSeconds).toBeLessThanOrEqual(clockToleranceSeconds);
  }
  if (typeof payload.exp === 'number') {
    expect(payload.exp).toBeGreaterThan(nowSeconds - clockToleranceSeconds);
  }

  return payload;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startRedisDockerContainer(): Promise<RedisDockerContainer> {
  if (process.env.CI_LOCAL_HOST_DOCKER === '1') {
    throw new Error('Use in-memory session store when local CI is already using host Docker');
  }
  const publish = process.env.TESTCONTAINERS_HOST_OVERRIDE ? '6379' : '127.0.0.1::6379';
  const { stdout } = await execFileAsync('docker', ['run', '-d', '-p', publish, 'redis:7-alpine']);
  const id = stdout.trim();
  const host = process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1';

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const portResult = await execFileAsync('docker', ['port', id, '6379/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)$/u);
    if (match) {
      const port = Number(match[1]);
      const client = createClient({ url: `redis://${host}:${port}` });
      try {
        await client.connect();
        await client.ping();
        await client.quit();
        return { id, host, port };
      } catch {
        if (client.isOpen) {
          await client.quit();
        }
      }
    }
    await sleep(500);
  }

  await execFileAsync('docker', ['rm', '-f', id]);
  throw new Error('Redis container did not become ready');
}

async function stopRedisDockerContainer(container: RedisDockerContainer | undefined): Promise<void> {
  if (!container) {
    return;
  }
  await execFileAsync('docker', ['rm', '-f', container.id]);
}

async function seedTenantAndUser(client: Client, tenantId: string, userId: string): Promise<void> {
  await client.query(
    `
      insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
      values ($1, 'tenant-one', 'Tenant One', true, clock_timestamp(), clock_timestamp())
    `,
    [tenantId],
  );
  await client.query(
    `
      insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
      values ($1, 'user@example.com', 'cognito-sub-1', 'en', clock_timestamp(), clock_timestamp())
    `,
    [userId],
  );
}

describe('StynxSessionsModule integration', () => {
  let database: PostgresTestDatabase;
  let redisContainer: RedisDockerContainer | undefined;
  let app: INestApplication;
  let sessionService: SessionService;
  let store: InMemorySessionStore | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_sessions');
    let redisUrl = 'redis://127.0.0.1:6379';
    try {
      redisContainer = await startRedisDockerContainer();
      redisUrl = `redis://${redisContainer.host}:${redisContainer.port}`;
    } catch {
      store = new InMemorySessionStore();
    }

    const testingModule = Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx/sessions:owner') },
            app: { connectionString: database.connectionString('@stynx/sessions:app') },
            reader: { connectionString: database.connectionString('@stynx/sessions:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxSessionsModule.forRoot({
          issuer: 'http://127.0.0.1',
          redis: { url: redisUrl, keyPrefix: 'stynx:test:sessions' },
          jwt: { keySet: buildKeySet() },
          timeouts: { accessNotBeforeDelaySeconds: 2 },
        }),
      ],
    });

    if (store) {
      testingModule
        .overrideProvider(RedisSessionStore)
        .useValue(store)
        .overrideProvider(STYNX_SESSION_STORE)
        .useValue(store);
    }

    const moduleRef = await testingModule.compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
    sessionService = moduleRef.get(SessionService);

    const admin = await database.connectAsAdmin();
    try {
      await seedTenantAndUser(
        admin,
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
      );
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await app?.close();
    await stopRedisDockerContainer(redisContainer);
    await database?.dispose();
  });

  it('publishes JWKS publicly and mirrors create/revoke events into auth.sessions', async () => {
    const tenantId = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
    const userId = '0197481e-7294-7c53-8b03-5c36d7c2831a';
    const created = await sessionService.create(userId, tenantId, 'cognito-sub-1', {
      platform: 'integration-test',
    });

    const response = await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200);
    expect(Array.isArray(response.body.keys)).toBe(true);

    const payload = verifyJwt(
      created.accessToken,
      response.body.keys[0] as JsonWebKey,
      'http://127.0.0.1',
      5,
    );
    expect(new URL(`${baseUrl}/.well-known/jwks.json`).pathname).toBe('/.well-known/jwks.json');
    expect(payload.sid).toBe(created.sid);
    expect(payload.tenant_id).toBe(tenantId);

    await expect(sessionService.revoke(created.sid)).resolves.toBe(true);

    const admin = await database.connectAsAdmin();
    try {
      const rows = await admin.query<{ sid: string; status: string }>(
        `
          select sid, status
          from auth.sessions
          where sid = $1
          order by created_at asc
        `,
        [created.sid],
      );
      expect(rows.rows.map((row) => row.status)).toEqual(['active', 'revoked']);
    } finally {
      await admin.end();
    }
  });

  it('propagates tenant revocation over Redis pubsub', async () => {
    const created = await sessionService.create(
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      'cognito-sub-1',
    );

    let received: Promise<string>;
    let cleanup: (() => Promise<void>) | undefined;

    if (redisContainer) {
      const redisUrl = `redis://${redisContainer.host}:${redisContainer.port}`;
      const subscriber = createClient({ url: redisUrl });
      await subscriber.connect();
      received = new Promise<string>((resolve) => {
        void subscriber.subscribe('perms:invalidate', (message) => {
          resolve(message);
        });
      });
      cleanup = async () => {
        await subscriber.quit();
      };
    } else if (store) {
      received = new Promise<string>((resolve) => {
        store.invalidationEvents.once('invalidate', (message: string) => {
          resolve(message);
        });
      });
    } else {
      throw new Error('No session store available for integration test');
    }

    try {
      await sessionService.revokeAllForTenant('0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
      const message = await received;

      expect(created.sid.length).toBeGreaterThan(0);
      expect(message).toBe('*:0197481e-6f84-77e4-8d6d-41f0b6fca9c1');
    } finally {
      await cleanup?.();
    }
  });
});
