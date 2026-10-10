import { generateKeyPairSync, sign } from 'node:crypto';
import { Controller, Get, Module, Req, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Permission,
  PublicTenantRoute,
  StynxAuthModule as RuntimeAuthModule,
} from '@stynx-nyx/auth';
import {
  PermissionCache,
  PermissionGuard,
  StynxAuthGuard,
  StynxJwtValidator,
} from '@stynx-nyx/auth';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import { RequestContext } from '@stynx-nyx/core';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import {
  InMemorySessionStore,
  SessionService,
  SessionJwtSigningService,
  SessionMirrorWriter,
  STYNX_SESSIONS_OPTIONS,
  STYNX_SESSION_STORE,
  STYNX_SESSION_MIRROR,
  resolveSessionsOptions,
  type SessionRecord,
} from '@stynx-nyx/sessions';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import request from 'supertest';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { STYNX_TENANT_ENTITLEMENT_POLICY, STYNX_TOKEN_VERIFIER } from '../../src/auth/constants';

const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const TENANT_B = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const NOMINAL_ACTOR = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MEMBER = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const OUTSIDER = '0197481e-7294-7c53-8b03-5c36d7c2831b';

type RequestState = {
  principal?: { id: string; roles: string[]; permissions: string[] };
  tenantId?: string;
  verifiedTenantClaim?: string;
  headers: Record<string, unknown>;
};

@Controller('/backend-public')
@UseGuards(AuthContextGuard)
class BackendPublicController {
  constructor(private readonly context: RequestContext) {}

  @Get('/nominal')
  @PublicTenantRoute()
  nominal(@Req() req: RequestState) {
    return {
      tenantId: req.tenantId,
      actorId: this.context.actorId,
      roles: req.principal?.roles ?? [],
      permissions: req.principal?.permissions ?? [],
    };
  }

  @Get('/optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() req: RequestState) {
    return {
      tenantId: req.tenantId,
      actorId: this.context.actorId,
      sessionId: this.context.sessionId,
      principalId: req.principal?.id,
    };
  }

  @Get('/permissioned')
  @PublicTenantRoute({ optionalAuth: true })
  @Permission('records:read')
  @UseGuards(StynxAuthGuard, PermissionGuard)
  permissioned() {
    return { status: 'granted' };
  }

  @Get('/backend-permissioned')
  @PublicTenantRoute({ optionalAuth: true })
  @Permission('records:read')
  @UseGuards(PermissionGuard)
  backendPermissioned() {
    return { status: 'unreachable' };
  }
}

@Controller('/auth-public')
@UseGuards(StynxAuthGuard)
class AuthPublicController {
  constructor(private readonly context: RequestContext) {}

  @Get('/protected')
  protected() {
    return { status: 'authenticated' };
  }

  @Get('/optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() req: RequestState) {
    return {
      tenantId: req.tenantId,
      actorId: this.context.actorId,
      sessionId: this.context.sessionId,
      principalId: req.principal?.id,
    };
  }
}

// Use the published in-memory session adapter with the real service and signing/validation path.
// All key material is ephemeral TEST material generated in this process.
const issuer = 'https://public-tenant.test';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sessionOptions = resolveSessionsOptions({
  issuer,
  redis: { url: 'redis://unused.test:6379' },
  jwt: {
    keySet: {
      currentKid: 'public-tenant-test',
      keys: [
        {
          kid: 'public-tenant-test',
          publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          privateKeyPem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        },
      ],
    },
  },
});
const sessionStore = new InMemorySessionStore();
const signed = (
  sid: string,
  userId = MEMBER,
  tenantId = TENANT_A,
  privateKey = keys.privateKey,
): string => {
  const head = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'public-tenant-test' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      iss: issuer,
      sub: userId,
      sid,
      tenant_id: tenantId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const input = head + '.' + body;
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
};
const realTokens = new Map<string, string>();
const authHeader = (label: string): string => 'Bearer ' + (realTokens.get(label) ?? label);

const tokenVerifier = {
  verifyAuthorizationHeader: vi.fn(async (authorization: string | string[] | undefined) => {
    const token = Array.isArray(authorization) ? authorization[0] : authorization;
    if (token === 'Bearer member' || token === authHeader('member'))
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: ['records:read'],
          tenants: [TENANT_A],
          claims: { tenant_id: TENANT_A, sid: 'member-session' },
        },
      };
    if (token === 'Bearer conflict')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_B],
          claims: { tenant_id: TENANT_B, sid: 'conflict-session' },
        },
      };
    if (token === 'Bearer outsider')
      return {
        principal: {
          id: OUTSIDER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_A],
          claims: { tenant_id: TENANT_A, sid: 'outsider-session' },
        },
      };
    if (token === 'Bearer cognito-conflict')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_A],
          claims: { 'custom:tenant_id': TENANT_B },
        },
      };
    if (token === 'Bearer sole-list-conflict')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_B],
          claims: {},
        },
      };
    if (token === 'Bearer multi-list')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_A, TENANT_B],
          claims: {},
        },
      };
    if (token === 'Bearer typed-invalid') throw new InvalidCredentialError('bad signature');
    if (token === 'Bearer jwks-error') throw new Error('JWKS unavailable');
    if (token === 'Bearer entitlement-deny')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_A],
          claims: { tenant_id: TENANT_A, entitlement: 'deny' },
        },
      };
    if (token === 'Bearer entitlement-throw')
      return {
        principal: {
          id: MEMBER,
          roles: ['member'],
          permissions: [],
          tenants: [TENANT_A],
          claims: { tenant_id: TENANT_A, entitlement: 'throw' },
        },
      };
    return null;
  }),
};

@Module({
  imports: [RuntimeAuthModule.forRoot({ stynx: { issuer } })],
  controllers: [BackendPublicController, AuthPublicController],
  providers: [
    AuthContextGuard,
    StynxAuthGuard,
    PermissionGuard,
    { provide: STYNX_TOKEN_VERIFIER, useValue: tokenVerifier },
    {
      provide: STYNX_TENANT_ENTITLEMENT_POLICY,
      useValue: {
        isEntitled: async ({ principal }: { principal: { claims?: Record<string, unknown> } }) => {
          if (principal.claims?.entitlement === 'throw') throw new Error('policy unavailable');
          return principal.claims?.entitlement !== 'deny';
        },
      },
    },
    { provide: STYNX_SESSIONS_OPTIONS, useValue: sessionOptions },
    { provide: STYNX_SESSION_STORE, useValue: sessionStore },
    { provide: STYNX_SESSION_MIRROR, useClass: SessionMirrorWriter },
    SessionJwtSigningService,
    SessionService,
  ],
})
class BackendPublicModule {}

describe('AuthContextGuard public tenant HTTP contract', () => {
  let app: INestApplication;
  let postgres: PostgresTestDatabase;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_auth_public_tenant', { useTemplate: false });
    const testing = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('public-tenant-owner') },
            app: { connectionString: postgres.appConnectionString('public-tenant-app') },
            reader: {
              connectionString: postgres.appConnectionString(
                'public-tenant-reader',
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxTenancyModule.forRoot({
          publicTenant: {
            actorId: NOMINAL_ACTOR,
            resolveHost: ({ host }: { host?: string }) =>
              host === 'a.portal.test' ? TENANT_A : undefined,
          },
        } as never),
        BackendPublicModule,
      ],
    }).compile();
    app = testing.createNestApplication();
    await app.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        "insert into tenancy.tenants(id,slug,name) values ($1,'public-a','Public A'),($2,'public-b','Public B')",
        [TENANT_A, TENANT_B],
      );
      await admin.query(
        "insert into auth.users(id,email) values ($1,'member@public.test'),($2,'outsider@public.test'),($3,'nominal@public.test')",
        [MEMBER, OUTSIDER, NOMINAL_ACTOR],
      );
      await admin.query(
        'insert into auth.memberships(tenant_id,user_id,is_active) values ($1,$2,true)',
        [TENANT_A, MEMBER],
      );
    } finally {
      await admin.end();
    }
    const adminAuth = await postgres.connectAsAdmin();
    try {
      await adminAuth.query(
        'insert into auth.memberships(tenant_id,user_id,is_active) values ($1,$2,true),($1,$3,true)',
        [TENANT_B, MEMBER, OUTSIDER],
      );
      await adminAuth.query(
        "insert into auth.perms(key,description) values ('records:read','Public test read') on conflict(key) do nothing",
      );
      await adminAuth.query(
        "insert into auth.direct_perms(membership_id,perm_id,effect) select m.id,p.id,'allow' from auth.memberships m cross join auth.perms p where m.user_id=$1 and p.key='records:read'",
        [MEMBER],
      );
    } finally {
      await adminAuth.end();
    }
    for (const [label, userId, tenantId] of [
      ['member', MEMBER, TENANT_A],
      ['conflict', MEMBER, TENANT_B],
      ['outsider', OUTSIDER, TENANT_A],
      ['revoked', MEMBER, TENANT_A],
    ] as const) {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 3_600_000).toISOString();
      await sessionStore.createSession({
        sid: label + '-session',
        userId,
        tenantId,
        cognitoSub: userId,
        refreshFamilyId: label,
        refreshTokenHash: label,
        status: label === 'revoked' ? 'revoked' : 'active',
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        expiresAt: future,
        idleExpiresAt: future,
      } satisfies SessionRecord);
      realTokens.set(label, signed(label + '-session', userId, tenantId));
    }
    const jwtValidator = testing.get(StynxJwtValidator);
    expect(jwtValidator).toBeInstanceOf(StynxJwtValidator);
    expect(testing.get(PermissionCache)).toBeInstanceOf(PermissionCache);
    expect(testing.get(SessionService)).toBeInstanceOf(SessionService);
    const pools = testing.get(StynxPoolRegistry).pools;
    const role = await pools.app.query(
      'select current_user, session_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user',
    );
    expect(role.rows).toEqual([
      {
        current_user: 'stynx_app',
        session_user: 'stynx_app',
        rolsuper: false,
        rolbypassrls: false,
      },
    ]);
    expect(testing.get(Database)).toBeInstanceOf(Database);
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  }, 60_000);

  it('keeps absent, invalid, null-principal, and non-optional bearer requests nominal', async () => {
    for (const authorization of [
      undefined,
      'Bearer invalid',
      'Bearer null-principal',
      'Bearer member',
    ]) {
      const call = request(app.getHttpServer())
        .get('/backend-public/nominal')
        .set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call
        .expect(200)
        .expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR, roles: [], permissions: [] });
    }
  });

  it('passes a verified optional principal through Host tenancy with its actor and session', async () => {
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer member')
      .expect(200)
      .expect({
        tenantId: TENANT_A,
        actorId: MEMBER,
        sessionId: 'member-session',
        principalId: MEMBER,
      });
  });

  it('rejects verified Host-claim conflict and missing Host membership', async () => {
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer conflict')
      .expect(400)
      .expect({
        code: 'TENANCY:CONFLICT:host-claim',
        message: 'Tenant source conflict: Host and authenticated claim disagree',
      });
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer outsider')
      .expect(403)
      .expect({ message: 'TENANT_ACCESS_DENIED', error: 'Forbidden', statusCode: 403 });
  });

  it('fails closed when the verified principal entitlement denies or throws for the Host tenant', async () => {
    for (const token of ['entitlement-deny', 'entitlement-throw']) {
      await request(app.getHttpServer())
        .get('/backend-public/optional')
        .set('host', 'a.portal.test')
        .set('authorization', `Bearer ${token}`)
        .expect(403)
        .expect({
          message: 'Principal is not entitled for tenant context',
          error: 'Forbidden',
          statusCode: 403,
        });
    }
  });

  it('runs the real StynxAuthGuard with Host tenancy for nominal, member, conflict, and membership branches', async () => {
    for (const authorization of [undefined, 'Bearer invalid']) {
      const call = request(app.getHttpServer())
        .get('/auth-public/optional')
        .set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(200).expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
    }
    await request(app.getHttpServer())
      .get('/auth-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', authHeader('member'))
      .expect(200)
      .expect({
        tenantId: TENANT_A,
        actorId: MEMBER,
        sessionId: 'member-session',
        principalId: MEMBER,
      });
    await request(app.getHttpServer())
      .get('/auth-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', authHeader('conflict'))
      .expect(400)
      .expect({
        code: 'TENANCY:CONFLICT:host-claim',
        message: 'Tenant source conflict: Host and authenticated claim disagree',
      });
    await request(app.getHttpServer())
      .get('/auth-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', authHeader('outsider'))
      .expect(403)
      .expect({ message: 'TENANT_ACCESS_DENIED', error: 'Forbidden', statusCode: 403 });
  });

  it('propagates a STYNX JWKS outage over the optional HTTP route', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signer = app.get(SessionJwtSigningService);
    const unavailable = vi
      .spyOn(signer, 'getJwks')
      .mockRejectedValue(new Error('JWKS unavailable'));
    try {
      await request(app.getHttpServer())
        .get('/auth-public/optional')
        .set('host', 'a.portal.test')
        .set(
          'authorization',
          'Bearer ' + signed('member-session', MEMBER, TENANT_A, other.privateKey),
        )
        .expect(500);
      expect(unavailable).toHaveBeenCalledWith();
    } finally {
      unavailable.mockRestore();
    }
  });

  it('requires a StynxAuthGuard-verified grant on a permissioned public tenant route', async () => {
    await request(app.getHttpServer())
      .get('/backend-public/permissioned')
      .set('host', 'a.portal.test')
      .set('authorization', authHeader('member'))
      .expect(200)
      .expect({ status: 'granted' });
    for (const authorization of [undefined, 'Bearer invalid']) {
      const call = request(app.getHttpServer())
        .get('/backend-public/permissioned')
        .set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(403).expect({
        message: 'Missing permission records:read',
        error: 'Forbidden',
        statusCode: 403,
      });
    }
  });

  it('uses Cognito-shaped and sole-list tenant claims for Host conflict while leaving a multi-list unselected', async () => {
    for (const authorization of ['Bearer cognito-conflict', 'Bearer sole-list-conflict']) {
      await request(app.getHttpServer())
        .get('/backend-public/optional')
        .set('host', 'a.portal.test')
        .set('authorization', authorization)
        .expect(400)
        .expect({
          code: 'TENANCY:CONFLICT:host-claim',
          message: 'Tenant source conflict: Host and authenticated claim disagree',
        });
    }
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer multi-list')
      .expect(200)
      .expect({ tenantId: TENANT_A, actorId: MEMBER, principalId: MEMBER });
  });

  it('uses nominal Host context for typed AuthContextGuard rejection but propagates verifier infrastructure failure', async () => {
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer typed-invalid')
      .expect(200)
      .expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
    await request(app.getHttpServer())
      .get('/backend-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer jwks-error')
      .expect(500);
  });

  it('does not let an AuthContextGuard principal grant an auth PermissionGuard permission', async () => {
    await request(app.getHttpServer())
      .get('/backend-public/backend-permissioned')
      .set('host', 'a.portal.test')
      .set('authorization', 'Bearer member')
      .expect(403)
      .expect({ message: 'Missing permission records:read', error: 'Forbidden', statusCode: 403 });
  });

  it('uses the nominal Host actor for a revoked optional STYNX session without principal or session context', async () => {
    await request(app.getHttpServer())
      .get('/auth-public/optional')
      .set('host', 'a.portal.test')
      .set('authorization', authHeader('revoked'))
      .expect(200)
      .expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
  });

  it.each(['missing', 'revoked', 'reuse_detected', 'absolute-expiry', 'idle-expiry'] as const)(
    'uses nominal optional identity and protected 401 for definitively inactive %s sessions',
    async (state) => {
      const sid =
        '0198d132-0000-7000-8000-' +
        {
          missing: '000000000101',
          revoked: '000000000102',
          reuse_detected: '000000000103',
          'absolute-expiry': '000000000104',
          'idle-expiry': '000000000105',
        }[state];
      if (state !== 'missing') {
        const past = new Date(Date.now() - 60_000).toISOString();
        const future = new Date(Date.now() + 3_600_000).toISOString();
        await sessionStore.createSession({
          sid,
          userId: MEMBER,
          tenantId: TENANT_A,
          cognitoSub: MEMBER,
          refreshFamilyId: sid,
          refreshTokenHash: sid,
          status: state === 'revoked' || state === 'reuse_detected' ? state : 'active',
          createdAt: past,
          updatedAt: past,
          lastTouchedAt: past,
          expiresAt: state === 'absolute-expiry' ? past : future,
          idleExpiresAt: state === 'absolute-expiry' || state === 'idle-expiry' ? past : future,
        });
      }
      const header = 'Bearer ' + signed(sid);
      await request(app.getHttpServer())
        .get('/auth-public/optional')
        .set('host', 'a.portal.test')
        .set('authorization', header)
        .expect(200)
        .expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
      await request(app.getHttpServer())
        .get('/auth-public/protected')
        .set('authorization', header)
        .expect(401)
        .expect({
          message: 'STYNX session is no longer active',
          error: 'Unauthorized',
          statusCode: 401,
        });
    },
  );

  it.each(['optional', 'protected'] as const)(
    'propagates actual session-store failure over %s HTTP without credential downgrade',
    async (route) => {
      const failure = vi
        .spyOn(sessionStore, 'getSession')
        .mockRejectedValueOnce(new Error('session storage unavailable'));
      try {
        await request(app.getHttpServer())
          .get('/auth-public/' + route)
          .set('host', 'a.portal.test')
          .set('authorization', authHeader('member'))
          .expect(500);
        expect(failure).toHaveBeenCalledExactlyOnceWith('member-session');
      } finally {
        failure.mockRestore();
      }
    },
  );
});
