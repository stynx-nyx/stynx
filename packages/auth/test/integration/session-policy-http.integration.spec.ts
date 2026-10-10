import { generateKeyPairSync } from 'node:crypto';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StynxDataModule } from '@stynx-nyx/data';
import {
  InMemorySessionStore,
  RedisSessionStore,
  StynxSessionsModule,
  STYNX_SESSION_STORE,
  type StynxSessionsModuleOptions,
} from '@stynx-nyx/sessions';
import { CognitoJwtValidator } from '../../src/cognito-jwt.validator';
import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { StynxAuthModule } from '../../src/auth.module';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';
import { STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9d1';
const USER = '0197481e-7294-7c53-8b03-5c36d7c2841a';
const MEMBERSHIP = '0197481e-7294-7c53-8b03-5c36d7c2842a';
const MFA_TOKEN = 'cognito-mfa-token';
const PASSWORD_TOKEN = 'cognito-password-token';

@Controller()
class SessionPolicyProbeController {
  @UseGuards(StynxAuthGuard)
  @Get('/session-policy/probe')
  probe() {
    return { status: 'ok' };
  }
}

// The token text selects the verified `amr` claim so each request controls its factor proof.
class FactorCognitoJwtValidator {
  async validateAccessToken(token: string): Promise<{ sub: string; email: string; claims: Record<string, unknown> }> {
    return {
      sub: USER,
      email: 'session-policy@example.com',
      claims: { amr: token === MFA_TOKEN ? ['pwd', 'mfa'] : ['pwd'] },
    };
  }
}

function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'auth-session-policy-key-1',
    keys: [
      {
        kid: 'auth-session-policy-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

interface PolicyApp {
  app: INestApplication;
  database: PostgresTestDatabase;
}

async function createPolicyApp(
  name: string,
  policy: Pick<StynxSessionsModuleOptions, 'singleSession' | 'strongFactor'>,
): Promise<PolicyApp> {
  const database = await createPostgresTestDatabase(name);
  const sessionStore = new InMemorySessionStore();
  const permissionBackend = new InMemoryPermissionCacheBackend();
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: database.connectionString(`@stynx-nyx/${name}:owner`) },
          app: { connectionString: database.appConnectionString(`@stynx-nyx/${name}:app`) },
          reader: { connectionString: database.connectionString(`@stynx-nyx/${name}:reader`) },
        },
        migrations: { enabled: true },
      }),
      StynxSessionsModule.forRoot({
        issuer: 'https://stynx.test',
        redis: { url: 'redis://127.0.0.1:6379' },
        jwt: { keySet: buildKeySet() },
        ...policy,
      }),
      StynxAuthModule.forRoot({
        stynx: { issuer: 'https://stynx.test' },
        redis: { url: 'redis://127.0.0.1:6379' },
      }),
    ],
    controllers: [SessionPolicyProbeController],
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
    .useValue(new FactorCognitoJwtValidator())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.listen(0);

  const admin = await database.connectAsAdmin();
  try {
    await admin.query(
      `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
       values ($1, 'session-policy', 'Session Policy', true, clock_timestamp(), clock_timestamp())`,
      [TENANT],
    );
    await admin.query(
      `insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
       values ($1, 'session-policy@example.com', $2, 'en', clock_timestamp(), clock_timestamp())`,
      [USER, USER],
    );
    await admin.query(
      `insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
       values ($1, $2, $3, null, 0, true, clock_timestamp())`,
      [MEMBERSHIP, TENANT, USER],
    );
  } finally {
    await admin.end();
  }

  return { app, database };
}

function exchange(app: INestApplication, cognitoToken: string) {
  return request(app.getHttpServer())
    .post('/sessions')
    .set('x-tenant-id', TENANT)
    .send({ cognitoToken });
}

describe('StynxAuthController session policy over HTTP', () => {
  describe('singleSession reject-new with strongFactor', () => {
    let subject: PolicyApp;

    beforeAll(async () => {
      subject = await createPolicyApp('stynx_auth_session_reject', {
        singleSession: { mode: 'reject-new' },
        strongFactor: { claimName: 'amr', acceptedValues: ['mfa'] },
      });
    }, 60_000);

    afterAll(async () => {
      await subject?.app.close();
      await subject?.database.dispose();
    });

    it('returns 403 STRONG_FACTOR_REQUIRED when the verified token lacks an accepted factor', async () => {
      await exchange(subject.app, PASSWORD_TOKEN)
        .expect(403)
        .expect(({ body }) => {
          expect(body).toEqual({ code: 'STRONG_FACTOR_REQUIRED', message: 'STRONG_FACTOR_REQUIRED' });
        });
    });

    it('returns 409 SESSION_CONFLICT for a second session while the first is active', async () => {
      const first = await exchange(subject.app, MFA_TOKEN).expect(201);

      await exchange(subject.app, MFA_TOKEN)
        .expect(409)
        .expect(({ body }) => {
          expect(body).toEqual({ code: 'SESSION_CONFLICT', message: 'SESSION_CONFLICT' });
        });

      await request(subject.app.getHttpServer())
        .get('/session-policy/probe')
        .set('authorization', `Bearer ${first.body.accessToken}`)
        .expect(200);
    });
  });

  describe('singleSession revoke-existing', () => {
    let subject: PolicyApp;

    beforeAll(async () => {
      subject = await createPolicyApp('stynx_auth_session_revoke', {
        singleSession: { mode: 'revoke-existing' },
      });
    }, 60_000);

    afterAll(async () => {
      await subject?.app.close();
      await subject?.database.dispose();
    });

    it('revokes the earlier session when a new one is created', async () => {
      const first = await exchange(subject.app, PASSWORD_TOKEN).expect(201);
      const second = await exchange(subject.app, PASSWORD_TOKEN).expect(201);
      expect(second.body.sid).not.toBe(first.body.sid);

      await request(subject.app.getHttpServer())
        .get('/session-policy/probe')
        .set('authorization', `Bearer ${first.body.accessToken}`)
        .expect(401);
      await request(subject.app.getHttpServer())
        .get('/session-policy/probe')
        .set('authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);
    });
  });
});
