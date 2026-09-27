import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ModuleRef, Reflector } from '@nestjs/core';
import type { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL } from '@stynx-nyx/contracts';
import type { MembershipAccessCache } from '../../src/membership-cache';
import { TenantContextInterceptor } from '../../src/tenant-context.interceptor';

const TENANT_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07111';
const ACTOR_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07112';
const PUBLIC_ACTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const HOST = 'a.portal.test';
const PATH = '/portal/records';

type Setup = {
  tenantActive?: boolean;
  member?: boolean;
  reflector?: { value: unknown } | 'absent';
  activeContext?: boolean;
  resolveHost?: (context: { host?: string; path: string }) => string | undefined;
  publicActorId?: string | undefined;
};

function setup(options: Setup = {}) {
  const txQuery = vi.fn(async (sql: string) => ({
    rows: [{ allowed: sql.includes('auth.memberships') ? (options.member ?? true) : (options.tenantActive ?? true) }],
  }));
  const database = {
    withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
    tx: vi.fn(async (fn: (trx: { query: typeof txQuery }) => Promise<unknown>) => fn({ query: txQuery })),
  };
  const moduleRef = {
    get: vi.fn((token: unknown) => (typeof token === 'function' && token.name === 'Database' ? database : undefined)),
  } as unknown as ModuleRef;
  const requestContext = {
    snapshot: vi.fn(() => ({ requestId: 'req-1', sessionId: 'inherited-session' })),
    hasActiveContext: vi.fn(() => options.activeContext ?? false),
  } as unknown as RequestContext;
  const requestContextMutator = {
    runWithRequestContext: vi.fn((_next: unknown, fn: () => unknown) => fn()),
    patch: vi.fn(),
  } as unknown as RequestContextMutator;
  const membershipCache = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() } as unknown as MembershipAccessCache;
  const reflector = options.reflector === 'absent'
    ? undefined
    : ({ getAllAndOverride: vi.fn(() => options.reflector?.value) } as unknown as Reflector);
  const resolveHost = vi.fn(options.resolveHost ?? (({ host, path }) => (host === HOST && path === PATH ? TENANT_ID : undefined)));
  const interceptor = new TenantContextInterceptor(
    moduleRef,
    requestContext,
    requestContextMutator,
    membershipCache,
    {
      headerName: 'X-Tenant-Id',
      allowSubdomain: false,
      membershipCacheTtlMs: 5_000,
      membershipCacheMaxEntries: 1_000,
      platformAdminEnvFlag: 'STYNX_TENANCY_PLATFORM_ADMIN',
      publicTenant: { resolveHost, actorId: 'publicActorId' in options ? options.publicActorId : PUBLIC_ACTOR_ID },
    } as never,
    reflector,
  );
  return { interceptor, txQuery, requestContextMutator, resolveHost };
}

function executionContext(request: Record<string, unknown>, handler: object = () => undefined, controller: object = class {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

async function run(interceptor: TenantContextInterceptor, context: ExecutionContext): Promise<unknown[]> {
  const next: CallHandler = {
    handle: vi.fn(() => ({
      subscribe: vi.fn((observer: { next: (value: unknown) => void; complete: () => void }) => {
        observer.next('handled');
        observer.complete();
        return { unsubscribe: vi.fn() };
      }),
    })) as never,
  };
  const values: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    interceptor.intercept(context, next).subscribe({ next: (value) => values.push(value), error: reject, complete: resolve });
  });
  return values;
}

function verifiedRequest(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const request: Record<string, unknown> = { headers: { host: HOST }, originalUrl: PATH, ...extra };
  Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
  return request;
}

describe('TenantContextInterceptor public tenant routes', () => {
  it('binds a verified optional-auth principal, its session, and entitlement to the Host tenant', async () => {
    const { interceptor, requestContextMutator, txQuery } = setup({ reflector: { value: { optionalAuth: true } } });
    const entitlement = vi.fn(async () => true);
    const request = verifiedRequest({
      stynxClaims: { sub: ACTOR_ID, tenantId: TENANT_ID.toUpperCase(), sid: 'verified-session' },
      verifiedTenantEntitlement: entitlement,
    });

    await expect(run(interceptor, executionContext(request))).resolves.toEqual(['handled']);

    expect(request).toMatchObject({ publicTenantRoute: true, publicTenantOptionalAuth: true, tenantId: TENANT_ID });
    expect(request.stynxClaims).toEqual({ sub: ACTOR_ID, tenantId: TENANT_ID.toUpperCase(), sid: 'verified-session' });
    expect(entitlement).toHaveBeenCalledWith(TENANT_ID);
    expect(txQuery).toHaveBeenCalledTimes(2);
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      { requestId: 'req-1', tenantId: TENANT_ID, actorId: ACTOR_ID, sessionId: 'verified-session' },
      expect.any(Function),
    );
  });

  it('falls back to verified session, tenant claim, and principal fields and patches an active context', async () => {
    const { interceptor, requestContextMutator } = setup({ reflector: { value: { optionalAuth: true } }, activeContext: true });
    const request = verifiedRequest({
      principal: { id: ACTOR_ID },
      verifiedSessionId: 'fallback-session',
      verifiedTenantClaim: TENANT_ID,
    });

    await expect(run(interceptor, executionContext(request))).resolves.toEqual(['handled']);

    expect(requestContextMutator.patch).toHaveBeenCalledWith({ tenantId: TENANT_ID, actorId: ACTOR_ID, sessionId: 'fallback-session' });
    expect(requestContextMutator.runWithRequestContext).not.toHaveBeenCalled();
  });

  it('runs an anonymous public route as the configured actor and strips unverified identity', async () => {
    const { interceptor, requestContextMutator } = setup({ reflector: { value: true } });
    const request: Record<string, unknown> = {
      headers: { host: HOST },
      originalUrl: PATH,
      stynxClaims: { sub: ACTOR_ID, tenantId: OTHER_TENANT_ID },
      principal: { id: ACTOR_ID },
      user: { id: ACTOR_ID },
      actor: { id: ACTOR_ID },
      principalContext: { id: ACTOR_ID },
      verifiedSessionId: 'unverified-session',
      verifiedTenantClaim: OTHER_TENANT_ID,
      verifiedTenantEntitlement: vi.fn(),
    };

    await expect(run(interceptor, executionContext(request))).resolves.toEqual(['handled']);

    expect(request.publicTenantOptionalAuth).toBe(false);
    for (const field of ['stynxClaims', 'principal', 'user', 'actor', 'principalContext', 'verifiedSessionId', 'verifiedTenantClaim', 'verifiedTenantEntitlement']) {
      expect(request).not.toHaveProperty(field);
    }
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      { requestId: 'req-1', tenantId: TENANT_ID, actorId: PUBLIC_ACTOR_ID },
      expect.any(Function),
    );
  });

  it('treats a false marker as an ordinary tenant route', async () => {
    const { interceptor, resolveHost } = setup({ reflector: { value: false } });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': TENANT_ID }, originalUrl: '/records', principal: { id: ACTOR_ID } };

    await expect(run(interceptor, executionContext(request))).resolves.toEqual(['handled']);

    expect(Object.hasOwn(request, 'publicTenantRoute')).toBe(false);
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it('reads the public route marker from handler or class metadata when no Reflector is available', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, { optionalAuth: false }, handler);
    class PublicController {}
    Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, true, PublicController);
    const { interceptor } = setup({ reflector: 'absent' });

    const fromHandler: Record<string, unknown> = { headers: { host: HOST }, originalUrl: PATH };
    await run(interceptor, executionContext(fromHandler, handler));
    const fromClass: Record<string, unknown> = { headers: { host: HOST }, originalUrl: PATH };
    await run(interceptor, executionContext(fromClass, () => undefined, PublicController));

    expect(fromHandler).toMatchObject({ publicTenantRoute: true, publicTenantOptionalAuth: false, tenantId: TENANT_ID });
    expect(fromClass).toMatchObject({ publicTenantRoute: true, publicTenantOptionalAuth: false, tenantId: TENANT_ID });
  });

  describe('rejections', () => {
    const resolve = (interceptor: TenantContextInterceptor, request: Record<string, unknown>) =>
      (interceptor as unknown as { resolveAndValidate(request: unknown): Promise<unknown> }).resolveAndValidate({
        publicTenantRoute: true,
        originalUrl: PATH,
        ...request,
      });

    it('requires a Host-resolved tenant and passes no host when the request has none', async () => {
      const { interceptor, resolveHost } = setup();

      await expect(resolve(interceptor, { headers: {} })).rejects.toBeInstanceOf(BadRequestException);
      expect(resolveHost).toHaveBeenCalledWith({ path: PATH });
    });

    it('rejects a Host-resolved tenant that is not a UUIDv7', async () => {
      const { interceptor } = setup({ resolveHost: () => 'tenant-a' });

      await expect(resolve(interceptor, { headers: { host: HOST } })).rejects.toThrow('Tenant identifier must be a valid UUIDv7');
    });

    it('rejects a verified tenant claim that contradicts the Host tenant', async () => {
      const { interceptor, txQuery } = setup();
      const request = verifiedRequest({ publicTenantOptionalAuth: true, stynxClaims: { sub: ACTOR_ID, tenantId: OTHER_TENANT_ID } });

      await expect(resolve(interceptor, request)).rejects.toMatchObject({ status: 400, code: 'TENANCY:CONFLICT:host-claim' });
      expect(txQuery).not.toHaveBeenCalled();
    });

    it('rejects inactive tenants', async () => {
      const { interceptor } = setup({ tenantActive: false });

      await expect(resolve(interceptor, { headers: { host: HOST } })).rejects.toThrow(new ForbiddenException('TENANT_ACCESS_DENIED'));
    });

    it('rejects a verified actor without active membership in the Host tenant', async () => {
      const { interceptor } = setup({ member: false });
      const request = verifiedRequest({ publicTenantOptionalAuth: true, stynxClaims: { sub: ACTOR_ID, tenantId: TENANT_ID } });

      await expect(resolve(interceptor, request)).rejects.toThrow(new ForbiddenException('TENANT_ACCESS_DENIED'));
    });

    it.each([
      ['denies', vi.fn(async () => false)],
      ['throws', vi.fn(async () => { throw new Error('entitlement backend unavailable'); })],
    ])('rejects a verified actor when tenant entitlement %s', async (_label, entitlement) => {
      const { interceptor } = setup();
      const request = verifiedRequest({
        publicTenantOptionalAuth: true,
        stynxClaims: { sub: ACTOR_ID, tenantId: TENANT_ID },
        verifiedTenantEntitlement: entitlement,
      });

      await expect(resolve(interceptor, request)).rejects.toThrow(new ForbiddenException('Principal is not entitled for tenant context'));
      expect(entitlement).toHaveBeenCalledWith(TENANT_ID);
    });

    it('fails closed when neither a verified actor nor a configured public actor exists', async () => {
      const { interceptor } = setup({ publicActorId: undefined });

      await expect(resolve(interceptor, { headers: { host: HOST } })).rejects.toThrow('PublicTenantRoute requires StynxTenancyModule publicTenant options');
    });
  });
});
