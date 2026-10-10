import { generateKeyPairSync, sign } from 'node:crypto';
import { StynxAuthModule } from '@stynx-nyx/auth';
import { StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import {
  InMemorySessionStore,
  SessionService,
  SessionJwtSigningService,
  SessionMirrorWriter,
  STYNX_SESSIONS_OPTIONS,
  STYNX_SESSION_STORE,
  STYNX_SESSION_MIRROR,
  resolveSessionsOptions,
} from '@stynx-nyx/sessions';
import { Test } from '@nestjs/testing';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

/** Real owned authentication services, a published session adapter and restricted PostgreSQL. */
export class RealAuthenticationFixture {
  readonly actorId = '0197481e-7294-7c53-8b03-5c36d7c2831a';
  readonly tenantId = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
  readonly issuer = 'https://authorization-app-guard.test';
  readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly store = new InMemorySessionStore();
  readonly claims = {
    iss: this.issuer,
    sub: this.actorId,
    sid: 'sid-1',
    tenant_id: this.tenantId,
    custom: 'claim-kept',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  readonly options = resolveSessionsOptions({
    issuer: this.issuer,
    redis: { url: 'redis://unused.test:6379' },
    jwt: {
      keySet: {
        currentKid: 'authz-test',
        keys: [
          {
            kid: 'authz-test',
            publicKeyPem: this.keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            privateKeyPem: this.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
          },
        ],
      },
    },
  });
  readonly authModule = StynxAuthModule.forRoot({ stynx: { issuer: this.issuer } });
  readonly providers = [
    { provide: STYNX_SESSIONS_OPTIONS, useValue: this.options },
    { provide: STYNX_SESSION_STORE, useValue: this.store },
    { provide: STYNX_SESSION_MIRROR, useClass: SessionMirrorWriter },
    SessionJwtSigningService,
    SessionService,
  ];
  database?: PostgresTestDatabase;
  private readonly signingInput =
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'authz-test', typ: 'JWT' })).toString(
      'base64url',
    ) +
    '.' +
    Buffer.from(JSON.stringify(this.claims)).toString('base64url');
  readonly accessToken =
    this.signingInput +
    '.' +
    sign('RSA-SHA256', Buffer.from(this.signingInput), this.keys.privateKey).toString('base64url');

  dataModule(migrations = false) {
    if (!this.database) throw new Error('Authentication fixture must initialize first');
    return StynxDataModule.forRoot({
      connections: {
        owner: { connectionString: this.database.connectionString('authz-owner') },
        app: { connectionString: this.database.appConnectionString('authz-app') },
        reader: {
          connectionString: this.database.appConnectionString('authz-reader', 'stynx_reader'),
        },
      },
      migrations: { enabled: migrations },
      retry: false,
    });
  }

  async initialize() {
    this.database = await createPostgresTestDatabase('stynx_authz_app_guard', {
      useTemplate: false,
    });
    const module = await Test.createTestingModule({ imports: [this.dataModule(true)] }).compile();
    try {
      await module.init();
      const identity = await module
        .get(StynxPoolRegistry)
        .pools.app.query(
          'select current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user',
        );
      const admin = await this.database.connectAsAdmin();
      try {
        await admin.query(
          "insert into tenancy.tenants(id,slug,name) values ($1,'authz-stynx','Authorization STYNX')",
          [this.tenantId],
        );
        await admin.query("insert into auth.users(id,email) values ($1,'authz@stynx.test')", [
          this.actorId,
        ]);
        await admin.query(
          'insert into auth.memberships(tenant_id,user_id,is_active) values ($1,$2,true)',
          [this.tenantId, this.actorId],
        );
        await admin.query(
          "insert into auth.perms(key,description) values ('records:read','Authz read') on conflict(key) do nothing",
        );
        await admin.query(
          "insert into auth.direct_perms(membership_id,perm_id,effect) select m.id,p.id,'allow' from auth.memberships m cross join auth.perms p where m.user_id=$1 and p.key='records:read'",
          [this.actorId],
        );
      } finally {
        await admin.end();
      }
      const now = new Date().toISOString(),
        future = new Date(Date.now() + 3_600_000).toISOString();
      await this.store.createSession({
        sid: 'sid-1',
        userId: this.actorId,
        tenantId: this.tenantId,
        cognitoSub: this.actorId,
        refreshFamilyId: 'authz-test',
        refreshTokenHash: 'authz-test',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        expiresAt: future,
        idleExpiresAt: future,
      });
      return identity.rows;
    } finally {
      await module.close();
    }
  }

  async dispose() {
    await this.database?.dispose();
  }
}
