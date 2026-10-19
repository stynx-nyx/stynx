import { generateKeyPairSync, sign } from 'node:crypto';
import { StynxAuthModule } from '@stynx-nyx/auth';
import { StynxDataModule } from '@stynx-nyx/data';
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
import type { PostgresTestDatabase } from '../../../data/test/support/postgres.js';

/** Native JWTs, real owned guards/services, and the same restricted database as the upgrade. */
export async function realOfflineHttpAuthentication(pg: PostgresTestDatabase, tenantId: string) {
  const actorId = '0198d132-0000-7000-8000-000000000010';
  const unprivilegedActorId = '0198d132-0000-7000-8000-000000000011';
  const issuer = 'https://ctg9-upgrade.test';
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const store = new InMemorySessionStore();
  const options = resolveSessionsOptions({
    issuer,
    redis: { url: 'redis://unused.test:6379' },
    jwt: {
      keySet: {
        currentKid: 'ctg9-test',
        keys: [
          {
            kid: 'ctg9-test',
            publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            privateKeyPem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
          },
        ],
      },
    },
  });
  const admin = await pg.connectAsAdmin();
  try {
    await admin.query(
      "insert into auth.users(id,email) values ($1,'ctg9-http@stynx.test'),($2,'ctg9-unprivileged@stynx.test')",
      [actorId, unprivilegedActorId],
    );
    await admin.query(
      'insert into auth.memberships(tenant_id,user_id,is_active) values ($1,$2,true),($1,$3,true)',
      [tenantId, actorId, unprivilegedActorId],
    );
    await admin.query(
      "insert into auth.perms(key,description) values ('offline-sync:batches:submit','CTG9 submit') on conflict(key) do nothing",
    );
    await admin.query(
      "insert into auth.direct_perms(membership_id,perm_id,effect) select m.id,p.id,'allow' from auth.memberships m cross join auth.perms p where m.tenant_id=$1 and m.user_id=$2 and p.key='offline-sync:batches:submit'",
      [tenantId, actorId],
    );
  } finally {
    await admin.end();
  }
  const tokens: string[] = [];
  for (const userId of [actorId, unprivilegedActorId]) {
    const sid = userId;
    const now = new Date().toISOString(),
      future = new Date(Date.now() + 3_600_000).toISOString();
    await store.createSession({
      sid,
      userId,
      tenantId,
      cognitoSub: userId,
      refreshFamilyId: sid,
      refreshTokenHash: sid,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      expiresAt: future,
      idleExpiresAt: future,
    });
    const input =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'ctg9-test', typ: 'JWT' })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(
        JSON.stringify({
          iss: issuer,
          sub: userId,
          sid,
          tenant_id: tenantId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
    tokens.push(
      input + '.' + sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url'),
    );
  }
  return {
    actorId,
    accessToken: tokens[0]!,
    unprivilegedToken: tokens[1]!,
    authModule: StynxAuthModule.forRoot({ stynx: { issuer } }),
    dataModule: StynxDataModule.forRoot({
      connections: {
        owner: { connectionString: pg.connectionString('ctg9-http-owner') },
        app: { connectionString: pg.appConnectionString('ctg9-http-app') },
        reader: { connectionString: pg.appConnectionString('ctg9-http-reader', 'stynx_reader') },
      },
      migrations: { enabled: false },
      retry: false,
    }),
    providers: [
      { provide: STYNX_SESSIONS_OPTIONS, useValue: options },
      { provide: STYNX_SESSION_STORE, useValue: store },
      { provide: STYNX_SESSION_MIRROR, useClass: SessionMirrorWriter },
      SessionJwtSigningService,
      SessionService,
    ],
  };
}
