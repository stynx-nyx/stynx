import { Controller, Get, Module, Req, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permission, PublicTenantRoute } from '@stynx-nyx/auth';
import { PermissionCache, PermissionGuard, StynxAuthGuard, StynxJwtValidator } from '@stynx-nyx/auth';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { SessionService } from '@stynx-nyx/sessions';
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
    return { tenantId: req.tenantId, actorId: this.context.actorId, roles: req.principal?.roles ?? [], permissions: req.principal?.permissions ?? [] };
  }

  @Get('/optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() req: RequestState) {
    return { tenantId: req.tenantId, actorId: this.context.actorId, sessionId: this.context.sessionId, principalId: req.principal?.id };
  }

  @Get('/permissioned')
  @PublicTenantRoute({ optionalAuth: true })
  @Permission('records:read')
  @UseGuards(StynxAuthGuard, PermissionGuard)
  permissioned() { return { status: 'granted' }; }

  @Get('/backend-permissioned')
  @PublicTenantRoute({ optionalAuth: true })
  @Permission('records:read')
  @UseGuards(PermissionGuard)
  backendPermissioned() { return { status: 'unreachable' }; }
}

@Controller('/auth-public')
@UseGuards(StynxAuthGuard)
class AuthPublicController {
  constructor(private readonly context: RequestContext) {}

  @Get('/optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() req: RequestState) {
    return { tenantId: req.tenantId, actorId: this.context.actorId, sessionId: this.context.sessionId, principalId: req.principal?.id };
  }
}

const jwtValidator = {
  validate: vi.fn(async (token: string) => {
    if (token === 'member') return { sid: 'member-session', sub: MEMBER, tenantId: TENANT_A, claims: {} };
    if (token === 'conflict') return { sid: 'conflict-session', sub: MEMBER, tenantId: TENANT_B, claims: {} };
    if (token === 'outsider') return { sid: 'outsider-session', sub: OUTSIDER, tenantId: TENANT_A, claims: {} };
    if (token === 'revoked') return { sid: 'revoked-session', sub: MEMBER, tenantId: TENANT_A, claims: {} };
    throw new InvalidCredentialError('invalid token');
  }),
};
const permissionCache = { getForSession: vi.fn(async () => ({ permissions: ['records:read'] })) };
const sessionService = { get: vi.fn(async (sid: string) => sid === 'revoked-session' ? null : ({ active: true })) };

const tokenVerifier = {
  verifyAuthorizationHeader: vi.fn(async (authorization: string | string[] | undefined) => {
    const token = Array.isArray(authorization) ? authorization[0] : authorization;
    if (token === 'Bearer member') return { principal: { id: MEMBER, roles: ['member'], permissions: ['records:read'], tenants: [TENANT_A], claims: { tenant_id: TENANT_A, sid: 'member-session' } } };
    if (token === 'Bearer conflict') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_B], claims: { tenant_id: TENANT_B, sid: 'conflict-session' } } };
    if (token === 'Bearer outsider') return { principal: { id: OUTSIDER, roles: ['member'], permissions: [], tenants: [TENANT_A], claims: { tenant_id: TENANT_A, sid: 'outsider-session' } } };
    if (token === 'Bearer cognito-conflict') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_A], claims: { 'custom:tenant_id': TENANT_B } } };
    if (token === 'Bearer sole-list-conflict') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_B], claims: {} } };
    if (token === 'Bearer multi-list') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_A, TENANT_B], claims: {} } };
    if (token === 'Bearer typed-invalid') throw new InvalidCredentialError('bad signature');
    if (token === 'Bearer jwks-error') throw new Error('JWKS unavailable');
    if (token === 'Bearer entitlement-deny') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_A], claims: { tenant_id: TENANT_A, entitlement: 'deny' } } };
    if (token === 'Bearer entitlement-throw') return { principal: { id: MEMBER, roles: ['member'], permissions: [], tenants: [TENANT_A], claims: { tenant_id: TENANT_A, entitlement: 'throw' } } };
    return null;
  }),
};

@Module({ controllers: [BackendPublicController, AuthPublicController], providers: [
  AuthContextGuard,
  StynxAuthGuard,
  PermissionGuard,
  { provide: STYNX_TOKEN_VERIFIER, useValue: tokenVerifier },
  { provide: STYNX_TENANT_ENTITLEMENT_POLICY, useValue: { isEntitled: async ({ principal }: { principal: { claims?: Record<string, unknown> } }) => {
    if (principal.claims?.entitlement === 'throw') throw new Error('policy unavailable');
    return principal.claims?.entitlement !== 'deny';
  } } },
  { provide: StynxJwtValidator, useValue: jwtValidator },
  { provide: PermissionCache, useValue: permissionCache },
  { provide: SessionService, useValue: sessionService },
] })
class BackendPublicModule {}

function databaseStub() {
  return {
    withSystemContext: async (_reason: string, run: () => Promise<unknown>) => run(),
    tx: async (run: (trx: { query: (sql: string, params?: string[]) => Promise<{ rows: Array<{ allowed: boolean }> }> }) => Promise<unknown>) => run({
      query: async (sql, params) => ({ rows: [{ allowed: sql.includes('from tenancy.tenants where') || params?.[0] === MEMBER }] }),
    }),
  };
}

describe('AuthContextGuard public tenant HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testing = await Test.createTestingModule({
      imports: [
        StynxTenancyModule.forRoot({ publicTenant: { actorId: NOMINAL_ACTOR, resolveHost: ({ host }: { host?: string }) => host === 'a.portal.test' ? TENANT_A : undefined } } as never),
        BackendPublicModule,
      ],
      providers: [{ provide: Database, useValue: databaseStub() }],
    }).compile();
    app = testing.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('keeps absent, invalid, null-principal, and non-optional bearer requests nominal', async () => {
    for (const authorization of [undefined, 'Bearer invalid', 'Bearer null-principal', 'Bearer member']) {
      const call = request(app.getHttpServer()).get('/backend-public/nominal').set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(200).expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR, roles: [], permissions: [] });
    }
  });

  it('passes a verified optional principal through Host tenancy with its actor and session', async () => {
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer member')
      .expect(200).expect({ tenantId: TENANT_A, actorId: MEMBER, sessionId: 'member-session', principalId: MEMBER });
  });

  it('rejects verified Host-claim conflict and missing Host membership', async () => {
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer conflict')
      .expect(400).expect({ code: 'TENANCY:CONFLICT:host-claim', message: 'Tenant source conflict: Host and authenticated claim disagree' });
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer outsider')
      .expect(403).expect({ message: 'TENANT_ACCESS_DENIED', error: 'Forbidden', statusCode: 403 });
  });

  it('fails closed when the verified principal entitlement denies or throws for the Host tenant', async () => {
    for (const token of ['entitlement-deny', 'entitlement-throw']) {
      await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', `Bearer ${token}`)
        .expect(403).expect({ message: 'Principal is not entitled for tenant context', error: 'Forbidden', statusCode: 403 });
    }
  });

  it('runs the real StynxAuthGuard with Host tenancy for nominal, member, conflict, and membership branches', async () => {
    for (const authorization of [undefined, 'Bearer invalid']) {
      const call = request(app.getHttpServer()).get('/auth-public/optional').set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(200).expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
    }
    await request(app.getHttpServer()).get('/auth-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer member')
      .expect(200).expect({ tenantId: TENANT_A, actorId: MEMBER, sessionId: 'member-session', principalId: MEMBER });
    await request(app.getHttpServer()).get('/auth-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer conflict')
      .expect(400).expect({ code: 'TENANCY:CONFLICT:host-claim', message: 'Tenant source conflict: Host and authenticated claim disagree' });
    await request(app.getHttpServer()).get('/auth-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer outsider')
      .expect(403).expect({ message: 'TENANT_ACCESS_DENIED', error: 'Forbidden', statusCode: 403 });
  });

  it('requires a StynxAuthGuard-verified grant on a permissioned public tenant route', async () => {
    await request(app.getHttpServer()).get('/backend-public/permissioned').set('host', 'a.portal.test').set('authorization', 'Bearer member')
      .expect(200).expect({ status: 'granted' });
    for (const authorization of [undefined, 'Bearer invalid']) {
      const call = request(app.getHttpServer()).get('/backend-public/permissioned').set('host', 'a.portal.test');
      if (authorization) call.set('authorization', authorization);
      await call.expect(403).expect({ message: 'Missing permission records:read', error: 'Forbidden', statusCode: 403 });
    }
  });

  it('uses Cognito-shaped and sole-list tenant claims for Host conflict while leaving a multi-list unselected', async () => {
    for (const authorization of ['Bearer cognito-conflict', 'Bearer sole-list-conflict']) {
      await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', authorization)
        .expect(400).expect({ code: 'TENANCY:CONFLICT:host-claim', message: 'Tenant source conflict: Host and authenticated claim disagree' });
    }
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer multi-list')
      .expect(200).expect({ tenantId: TENANT_A, actorId: MEMBER, principalId: MEMBER });
  });

  it('uses nominal Host context for typed AuthContextGuard rejection but propagates verifier infrastructure failure', async () => {
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer typed-invalid')
      .expect(200).expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
    await request(app.getHttpServer()).get('/backend-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer jwks-error')
      .expect(500);
  });

  it('does not let an AuthContextGuard principal grant an auth PermissionGuard permission', async () => {
    await request(app.getHttpServer()).get('/backend-public/backend-permissioned').set('host', 'a.portal.test').set('authorization', 'Bearer member')
      .expect(403).expect({ message: 'Missing permission records:read', error: 'Forbidden', statusCode: 403 });
  });

  it('uses the nominal Host actor for a revoked optional STYNX session without principal or session context', async () => {
    await request(app.getHttpServer()).get('/auth-public/optional').set('host', 'a.portal.test').set('authorization', 'Bearer revoked')
      .expect(200).expect({ tenantId: TENANT_A, actorId: NOMINAL_ACTOR });
  });
});
