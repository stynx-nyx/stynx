import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateKeyPairSync } from 'node:crypto';
import { Client } from 'pg';
import { generateRequestId, RequestContextMutator } from '@stynx/core';
import { Database, StynxDataModule } from '@stynx/data';
import {
  InMemorySessionStore,
  RedisSessionStore,
  StynxSessionsModule,
  STYNX_SESSION_STORE,
} from '@stynx/sessions';
import { CognitoJwtValidator } from '../../src/cognito-jwt.validator';
import { EffectiveHashComputer } from '../../src/effective-hash-computer';
import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';
import { PermissionCache } from '../../src/permission-cache';
import { PermissionGuard } from '../../src/permission.guard';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { StynxAuthModule } from '../../src/auth.module';
import { StynxAuthService } from '../../src/auth.service';
import { Permission } from '../../src/decorators';
import { STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

jest.setTimeout(30000);

@Controller()
class ProtectedController {
  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('document:read:*')
  @Get('/docs/read')
  read() {
    return { status: 'ok' };
  }

  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('document:write:*')
  @Get('/docs/write')
  write() {
    return { status: 'ok' };
  }

  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('document:delete:*')
  @Get('/docs/delete')
  remove() {
    return { status: 'ok' };
  }
}

class FakeCognitoJwtValidator {
  async validateAccessToken(): Promise<{ sub: string; email: string; claims: Record<string, unknown> }> {
    return {
      sub: '0197481e-7294-7c53-8b03-5c36d7c2831a',
      email: 'user@example.com',
      claims: {},
    };
  }
}

function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'auth-test-key-1',
    keys: [
      {
        kid: 'auth-test-key-1',
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
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'tenant-one', 'Tenant One', true, clock_timestamp(), clock_timestamp()),
      ('0197481e-6f84-77e4-8d6d-41f0b6fca9c2', 'tenant-two', 'Tenant Two', true, clock_timestamp(), clock_timestamp())
  `);
  await client.query(`
    insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2831a', 'user@example.com', '0197481e-7294-7c53-8b03-5c36d7c2831a', 'en', clock_timestamp(), clock_timestamp()),
      ('0197481e-7294-7c53-8b03-5c36d7c2831b', 'other@example.com', '0197481e-7294-7c53-8b03-5c36d7c2831b', 'en', clock_timestamp(), clock_timestamp())
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
      ('0197481e-7294-7c53-8b03-5c36d7c28411', 'document:write:*', 'write docs'),
      ('0197481e-7294-7c53-8b03-5c36d7c28412', 'document:delete:*', 'delete docs'),
      ('0197481e-7294-7c53-8b03-5c36d7c28413', 'document:*:*', 'wildcard docs'),
      ('0197481e-7294-7c53-8b03-5c36d7c28414', 'platform:perms:inspect:*', 'inspect perms'),
      ('0197481e-7294-7c53-8b03-5c36d7c28415', 'platform:perms:invalidate:*', 'invalidate perms')
  `);
  await client.query(`
    insert into auth.roles (id, tenant_id, key, name)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c28510', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'reader', 'Reader'),
      ('0197481e-7294-7c53-8b03-5c36d7c28511', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'writer', 'Writer'),
      ('0197481e-7294-7c53-8b03-5c36d7c28512', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'deleter', 'Deleter'),
      ('0197481e-7294-7c53-8b03-5c36d7c28513', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', 'wildcard', 'Wildcard'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', null, 'platform-ops', 'Platform Ops'),
      ('0197481e-7294-7c53-8b03-5c36d7c28515', '0197481e-6f84-77e4-8d6d-41f0b6fca9c2', 'tenant-two-reader', 'Tenant Two Reader')
  `);
  await client.query(`
    insert into auth.role_perms (role_id, perm_id)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c28510', '0197481e-7294-7c53-8b03-5c36d7c28410'),
      ('0197481e-7294-7c53-8b03-5c36d7c28511', '0197481e-7294-7c53-8b03-5c36d7c28411'),
      ('0197481e-7294-7c53-8b03-5c36d7c28512', '0197481e-7294-7c53-8b03-5c36d7c28412'),
      ('0197481e-7294-7c53-8b03-5c36d7c28513', '0197481e-7294-7c53-8b03-5c36d7c28413'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', '0197481e-7294-7c53-8b03-5c36d7c28414'),
      ('0197481e-7294-7c53-8b03-5c36d7c28514', '0197481e-7294-7c53-8b03-5c36d7c28415'),
      ('0197481e-7294-7c53-8b03-5c36d7c28515', '0197481e-7294-7c53-8b03-5c36d7c28410')
  `);
  await client.query(`
    insert into auth.membership_roles (membership_id, role_id)
    values
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28510'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28514'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832b', '0197481e-7294-7c53-8b03-5c36d7c28515'),
      ('0197481e-7294-7c53-8b03-5c36d7c2832c', '0197481e-7294-7c53-8b03-5c36d7c28510')
  `);
}

function tokenPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) {
    throw new Error('Malformed JWT');
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('StynxAuthModule integration', () => {
  let app: INestApplication;
  let databaseRef: Database;
  let authService: StynxAuthService;
  let permissionCache: PermissionCache;
  let effectiveHashComputer: EffectiveHashComputer;
  let requestContextMutator: RequestContextMutator;
  let database: PostgresTestDatabase;
  const sessionStore = new InMemorySessionStore();
  const permissionBackend = new InMemoryPermissionCacheBackend();

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_auth');

    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx/auth:owner') },
            app: { connectionString: database.connectionString('@stynx/auth:app') },
            reader: { connectionString: database.connectionString('@stynx/auth:reader') },
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
      controllers: [ProtectedController],
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
    databaseRef = moduleRef.get(Database);
    authService = moduleRef.get(StynxAuthService);
    permissionCache = moduleRef.get(PermissionCache);
    effectiveHashComputer = moduleRef.get(EffectiveHashComputer);
    requestContextMutator = moduleRef.get(RequestContextMutator);

    const admin = await database.connectAsAdmin();
    try {
      await seedBaseState(admin);
    } finally {
      await admin.end();
    }
  });

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

  it('exchanges a Cognito token for a STYNX session and enforces route permissions', async () => {
    const response = await request(app.getHttpServer())
      .post('/sessions')
      .set('x-tenant-id', '0197481e-6f84-77e4-8d6d-41f0b6fca9c1')
      .send({ cognitoToken: 'cognito-access-token' })
      .expect(201);

    const payload = tokenPayload(response.body.accessToken);
    expect(typeof payload.perms_hash).toBe('string');

    await request(app.getHttpServer())
      .get('/docs/read')
      .set('authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/docs/write')
      .set('authorization', `Bearer ${response.body.accessToken}`)
      .expect(403);
  });

  it('refreshes permissions through pubsub invalidation within 2 seconds', async () => {
    const session = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      ),
    );

    await request(app.getHttpServer())
      .get('/docs/write')
      .set('authorization', `Bearer ${session.accessToken}`)
      .expect(403);

    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831a', () =>
      databaseRef.tx(async (trx) => {
        await trx.query(
          `
            insert into auth.membership_roles (membership_id, role_id)
            values ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28511')
            on conflict do nothing
          `,
        );
        await effectiveHashComputer.afterMembershipRoleMutation(trx, ['0197481e-7294-7c53-8b03-5c36d7c2832a']);
      }),
    );
    await permissionCache.publishInvalidation('0197481e-7294-7c53-8b03-5c36d7c2831a:0197481e-6f84-77e4-8d6d-41f0b6fca9c1');

    await request(app.getHttpServer())
      .get('/docs/write')
      .set('authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('detects hash drift when pubsub invalidation is missed', async () => {
    const session = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      ),
    );

    await request(app.getHttpServer())
      .get('/docs/delete')
      .set('authorization', `Bearer ${session.accessToken}`)
      .expect(403);

    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831a', () =>
      databaseRef.tx(async (trx) => {
        await trx.query(
          `
            insert into auth.membership_roles (membership_id, role_id)
            values ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28512')
            on conflict do nothing
          `,
        );
        await effectiveHashComputer.afterMembershipRoleMutation(trx, ['0197481e-7294-7c53-8b03-5c36d7c2832a']);
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    await request(app.getHttpServer())
      .get('/docs/delete')
      .set('authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('maintains generation ordering across concurrent mutations', async () => {
    await Promise.all([
      runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831b', () =>
        databaseRef.tx(async (trx) => {
          await trx.query(
            `
              insert into auth.membership_roles (membership_id, role_id)
              values ('0197481e-7294-7c53-8b03-5c36d7c2832c', '0197481e-7294-7c53-8b03-5c36d7c28511')
              on conflict do nothing
            `,
          );
          await effectiveHashComputer.afterMembershipRoleMutation(trx, ['0197481e-7294-7c53-8b03-5c36d7c2832c']);
          await trx.query('select pg_sleep(0.2)');
        }),
      ),
      runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831b', () =>
        databaseRef.tx(async (trx) => {
          await trx.query(
            `
              insert into auth.membership_roles (membership_id, role_id)
              values ('0197481e-7294-7c53-8b03-5c36d7c2832c', '0197481e-7294-7c53-8b03-5c36d7c28512')
              on conflict do nothing
            `,
          );
          await effectiveHashComputer.afterMembershipRoleMutation(trx, ['0197481e-7294-7c53-8b03-5c36d7c2832c']);
        }),
      ),
    ]);

    const admin = await database.connectAsAdmin();
    try {
      const result = await admin.query<{ effective_hash_generation: number }>(
        `
          select effective_hash_generation
          from auth.memberships
          where id = '0197481e-7294-7c53-8b03-5c36d7c2832c'
        `,
      );
      expect(Number(result.rows[0]?.effective_hash_generation)).toBe(2);
    } finally {
      await admin.end();
    }
  });

  it('keeps session caches isolated for impersonation-style parallel sessions', async () => {
    const first = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
        { impersonation: true },
      ),
    );
    const second = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
        { impersonation: false },
      ),
    );

    expect(first.sid).not.toBe(second.sid);
    await authService.logout(first.sid);

    await request(app.getHttpServer())
      .get('/docs/read')
      .set('authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/docs/read')
      .set('authorization', `Bearer ${first.accessToken}`)
      .expect(401);
  });

  it('rotates session state when switching tenants', async () => {
    const session = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      ),
    );

    const switched = await request(app.getHttpServer())
      .post('/sessions/switch')
      .set('authorization', `Bearer ${session.accessToken}`)
      .send({ tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c2' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/docs/read')
      .set('authorization', `Bearer ${session.accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/docs/read')
      .set('authorization', `Bearer ${switched.body.accessToken}`)
      .expect(200);
  });

  it('expands wildcard permissions into the concrete cache set', async () => {
    await runWithRequestContext('0197481e-6f84-77e4-8d6d-41f0b6fca9c1', '0197481e-7294-7c53-8b03-5c36d7c2831a', () =>
      databaseRef.tx(async (trx) => {
        await trx.query(
          `
            insert into auth.membership_roles (membership_id, role_id)
            values ('0197481e-7294-7c53-8b03-5c36d7c2832a', '0197481e-7294-7c53-8b03-5c36d7c28513')
            on conflict do nothing
          `,
        );
        await effectiveHashComputer.afterMembershipRoleMutation(trx, ['0197481e-7294-7c53-8b03-5c36d7c2832a']);
      }),
    );

    const session = await runWithRequestContext(
      '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      '0197481e-7294-7c53-8b03-5c36d7c2831a',
      () => authService.exchangeExistingIdentity(
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-7294-7c53-8b03-5c36d7c2831a',
        '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
      ),
    );
    const cached = await authService.inspectPermissions(session.sid);

    expect(cached?.permissions).toEqual(
      expect.arrayContaining(['document:*:*', 'document:read:*', 'document:write:*', 'document:delete:*']),
    );
  });
});
