import { generateKeyPairSync } from 'node:crypto';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { generateRequestId, RequestContextMutator } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import {
  InMemorySessionStore,
  RedisSessionStore,
  StynxSessionsModule,
  STYNX_SESSION_STORE,
} from '@stynx-nyx/sessions';
import { CognitoJwtValidator } from '../../src/cognito-jwt.validator';
import { EffectiveHashComputer } from '../../src/effective-hash-computer';
import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';
import { Permission } from '../../src/decorators';
import { PermissionGuard } from '../../src/permission.guard';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { StynxAuthModule } from '../../src/auth.module';
import { StynxAuthService } from '../../src/auth.service';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';
import { STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const TENANT_ONE = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const TENANT_TWO = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const PLATFORM_USER = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const VIEWER_USER = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const VIEWER_MEMBERSHIP = '0197481e-7294-7c53-8b03-5c36d7c2832c';

@Controller()
class AuthMatrixProbeController {
  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('document:read:*')
  @Get('/matrix/protected/read')
  read() {
    return { status: 'ok' };
  }
}

class FakeCognitoJwtValidator {
  async validateAccessToken(): Promise<{ sub: string; email: string; claims: Record<string, unknown> }> {
    return {
      sub: PLATFORM_USER,
      email: 'api-matrix@example.com',
      claims: {},
    };
  }
}

function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'auth-api-matrix-key-1',
    keys: [
      {
        kid: 'auth-api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

async function seedBaseState(client: Client): Promise<void> {
  await client.query(`
    insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
    values
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'auth-matrix-one', 'Auth Matrix One', true, clock_timestamp(), clock_timestamp()),
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c2', 'auth-matrix-two', 'Auth Matrix Two', true, clock_timestamp(), clock_timestamp())
  `);
  await client.query(`
    insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2831a', 'api-matrix@example.com', '0197481e-7294-7c53-8b03-5c36d7c2831a', 'en', clock_timestamp(), clock_timestamp()),
      ('0197481e-7294-7c53-8b03-5c36d7c2831b', 'api-matrix-viewer@example.com', '0197481e-7294-7c53-8b03-5c36d7c2831b', 'en', clock_timestamp(), clock_timestamp())
  `);
  await client.query(`
    insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831a', null, 0, true, clock_timestamp()),
      ('0197481e-7294-7c53-8b03-5c36d7c2832b', '0197481e-6f84-77e4-8d6d-41f0b6fca9c2', '0197481e-7294-7c53-8b03-5c36d7c2831a', null, 0, true, clock_timestamp()),
      ('0197481e-7294-7c53-8b03-5c36d7c2832c', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831b', null, 0, true, clock_timestamp())
  `);
  await client.query(`
    insert into auth.perms (id, key, description)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c28410', 'document:read:*', 'read docs'),
      ('0197481e-7294-7c53-8b03-5c36d7c28414', 'platform:perms:inspect:*', 'inspect perms'),
      ('0197481e-7294-7c53-8b03-5c36d7c28415', 'platform:perms:invalidate:*', 'invalidate perms')
  `);
  await client.query(`
    insert into auth.roles (id, tenant_id, key, name)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c28510', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'reader', 'Reader'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', null, 'platform-ops', 'Platform Ops')
  `);
  await client.query(`
    insert into auth.role_perms (role_id, perm_id)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c28510', '0197481e-7294-7c53-8b03-5c36d7c28410'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', '0197481e-7294-7c53-8b03-5c36d7c28414'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', '0197481e-7294-7c53-8b03-5c36d7c28415')
  `);
  await client.query(`
    insert into auth.membership_roles (membership_id, role_id)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28510'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28514'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832b', '0197481e-7294-7c53-8b03-5c36d7c28510'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832c', '0197481e-7294-7c53-8b03-5c36d7c28510')
  `);
}

describe('StynxAuthController API error matrix', () => {
  let app: INestApplication;
  let authService: StynxAuthService;
  let requestContextMutator: RequestContextMutator;
  let effectiveHashComputer: EffectiveHashComputer;
  let databaseRef: Database;
  let database: PostgresTestDatabase;
  const sessionStore = new InMemorySessionStore();
  const permissionBackend = new InMemoryPermissionCacheBackend();

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_auth_matrix');

    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx-nyx/auth-matrix:owner') },
            app: { connectionString: database.connectionString('@stynx-nyx/auth-matrix:app') },
            reader: { connectionString: database.connectionString('@stynx-nyx/auth-matrix:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxSessionsModule.forRoot({
          issuer: 'https://stynx.test',
          redis: { url: 'redis://127.0.0.1:6379' },
          jwt: { keySet: buildKeySet() },
        }),
        StynxAuthModule.forRoot({
          stynx: { issuer: 'https://stynx.test' },
          redis: { url: 'redis://127.0.0.1:6379' },
        }),
      ],
      controllers: [AuthMatrixProbeController],
    })
      .overrideProvider(RedisSessionStore)
      .useValue(sessionStore)
      .overrideProvider(STYNX_SESSION_STORE)
      .useValue(sessionStore)
      .overrideProvider(RedisPermissionCacheBackend)
      .useValue(permissionBackend)
      .overrideProvider(STYNX_PERMISSION_CACHE_BACKEND)
      .useValue(permissionBackend)
      .overrideProvider(CognitoJwtValidator)
      .useValue(new FakeCognitoJwtValidator())
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    authService = moduleRef.get(StynxAuthService);
    requestContextMutator = moduleRef.get(RequestContextMutator);
    effectiveHashComputer = moduleRef.get(EffectiveHashComputer);
    databaseRef = moduleRef.get(Database);

    const admin = await database.connectAsAdmin();
    try {
      await seedBaseState(admin);
    } finally {
      await admin.end();
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.dispose();
  });

  async function runWithRequestContext<T>(tenantId: string, actorId: string, fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        fn,
      ),
    );
  }

  async function sessionFor(userId = PLATFORM_USER, tenantId = TENANT_ONE) {
    await runWithRequestContext(tenantId, userId, () =>
      databaseRef.tx(async (trx) => {
        const membershipId = userId === VIEWER_USER ? VIEWER_MEMBERSHIP : undefined;
        await effectiveHashComputer.afterMembershipRoleMutation(trx, membershipId ? [membershipId] : []);
      }),
    );
    return runWithRequestContext(tenantId, userId, () =>
      authService.exchangeExistingIdentity(userId, userId, tenantId),
    );
  }

  describe('GET /_platform/perms/:sid', () => {
    it('returns 200/201 with cached permission state for an existing session', async () => {
      const session = await sessionFor();

      await request(app.getHttpServer())
        .get(`/_platform/perms/${session.sid}`)
        .set('authorization', `Bearer ${session.accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            sid: session.sid,
            userId: PLATFORM_USER,
            tenantId: TENANT_ONE,
            permissions: expect.arrayContaining([
              'document:read:*',
              'platform:perms:inspect:*',
              'platform:perms:invalidate:*',
            ]),
          });
        });
    });

    it('returns 401 when the STYNX bearer token is missing', async () => {
      const session = await sessionFor();

      await request(app.getHttpServer())
        .get(`/_platform/perms/${session.sid}`)
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks platform inspect permission', async () => {
      const platformSession = await sessionFor();
      const viewerSession = await sessionFor(VIEWER_USER);

      await request(app.getHttpServer())
        .get(`/_platform/perms/${platformSession.sid}`)
        .set('authorization', `Bearer ${viewerSession.accessToken}`)
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission platform:perms:inspect:*');
        });
    });
  });

  describe('POST /_platform/perms/:sid/invalidate', () => {
    it('returns 200/201 after invalidating an existing permission cache entry', async () => {
      const targetSession = await sessionFor(VIEWER_USER);
      const platformSession = await sessionFor();

      await request(app.getHttpServer())
        .post(`/_platform/perms/${targetSession.sid}/invalidate`)
        .set('authorization', `Bearer ${platformSession.accessToken}`)
        .expect(201)
        .expect(({ body }) => {
          expect(body).toEqual({ status: 'ok' });
        });

      await expect(authService.inspectPermissions(targetSession.sid)).resolves.toBe(null);
    });

    it('returns 401 when the STYNX bearer token is missing', async () => {
      const targetSession = await sessionFor(VIEWER_USER);

      await request(app.getHttpServer())
        .post(`/_platform/perms/${targetSession.sid}/invalidate`)
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the authenticated actor lacks platform invalidate permission', async () => {
      const platformSession = await sessionFor();
      const viewerSession = await sessionFor(VIEWER_USER);

      await request(app.getHttpServer())
        .post(`/_platform/perms/${platformSession.sid}/invalidate`)
        .set('authorization', `Bearer ${viewerSession.accessToken}`)
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing permission platform:perms:invalidate:*');
        });
    });
  });

  describe('POST /sessions', () => {
    it('returns 200/201 after exchanging a Cognito token for a STYNX session', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .set('x-tenant-id', TENANT_ONE)
        .send({ cognitoToken: 'cognito-access-token', deviceMeta: { ua: 'api-matrix' } })
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            sid: expect.any(String),
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
          });
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .set('content-type', 'application/json')
        .set('x-tenant-id', TENANT_ONE)
        .send('{"cognitoToken":')
        .expect(400);
    });

    it('returns 401 when the Cognito token is missing', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .set('x-tenant-id', TENANT_ONE)
        .send({})
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing Cognito bearer token');
        });
    });

    it('returns 403 when tenant context is missing', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .send({ cognitoToken: 'cognito-access-token' })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('TENANT_ACCESS_DENIED');
        });
    });
  });

  describe('POST /sessions/logout', () => {
    it('returns 200/201 after revoking the current session', async () => {
      const session = await sessionFor();

      await request(app.getHttpServer())
        .post('/sessions/logout')
        .set('authorization', `Bearer ${session.accessToken}`)
        .expect(201)
        .expect(({ body }) => {
          expect(body).toEqual({ status: 'ok' });
        });

      await request(app.getHttpServer())
        .get('/matrix/protected/read')
        .set('authorization', `Bearer ${session.accessToken}`)
        .expect(401);
    });

    it('returns 401 when the STYNX bearer token is missing', async () => {
      await request(app.getHttpServer())
        .post('/sessions/logout')
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });
  });

  describe('POST /sessions/switch', () => {
    it('returns 200/201 after rotating into the requested tenant', async () => {
      const session = await sessionFor();

      const switched = await request(app.getHttpServer())
        .post('/sessions/switch')
        .set('authorization', `Bearer ${session.accessToken}`)
        .send({ tenantId: TENANT_TWO, deviceMeta: { ua: 'api-matrix' } })
        .expect(201);

      expect(switched.body).toMatchObject({
        sid: expect.any(String),
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      await request(app.getHttpServer())
        .get('/matrix/protected/read')
        .set('authorization', `Bearer ${session.accessToken}`)
        .expect(401);
    });

    it('returns 400 for malformed JSON', async () => {
      const session = await sessionFor();

      await request(app.getHttpServer())
        .post('/sessions/switch')
        .set('authorization', `Bearer ${session.accessToken}`)
        .set('content-type', 'application/json')
        .send('{"tenantId":')
        .expect(400);
    });

    it('returns 401 when the STYNX bearer token is missing', async () => {
      await request(app.getHttpServer())
        .post('/sessions/switch')
        .send({ tenantId: TENANT_TWO })
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });

    it('returns 403 when the target tenant is missing', async () => {
      const session = await sessionFor();

      await request(app.getHttpServer())
        .post('/sessions/switch')
        .set('authorization', `Bearer ${session.accessToken}`)
        .send({})
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe('TENANT_ACCESS_DENIED');
        });
    });
  });
});
