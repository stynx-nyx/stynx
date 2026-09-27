import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { STYNX_PUBLIC_TENANT_OPTIONS, STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL } from '@stynx-nyx/contracts';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';

const PRINCIPAL = {
  id: 'p-1',
  roles: ['admin'],
  permissions: ['doc:read'],
  tenants: ['t-1', 't-2'],
  claims: { sub: 'p-1' },
};

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function publicContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => class Handler {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const optionalPublicReflector = {
  getAllAndOverride: vi.fn((token: symbol) => (token === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : undefined)),
};

describe('AuthContextGuard mapped optional principal validation', () => {
  it.each([
    ['a null mapped principal', null],
    ['a mapped principal with a non-string id', { ...PRINCIPAL, id: 42 }],
    ['a mapped principal with an empty id', { ...PRINCIPAL, id: '' }],
    ['a mapped principal without a tenants array', { ...PRINCIPAL, tenants: 't-1' }],
  ])('rejects %s on an optional public-tenant route without attaching identity', async (_label, mapped) => {
    const verifier = { verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })) };
    const mapper = { map: vi.fn(() => mapped) };
    const guard = new AuthContextGuard(verifier as never, mapper as never, undefined, undefined, optionalPublicReflector as never);
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer verified-token' } };

    const outcome = guard.canActivate(publicContext(request));

    await expect(outcome).rejects.toThrow(UnauthorizedException);
    await expect(outcome).rejects.toThrow('Token verification returned no principal');
    expect(mapper.map).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveProperty('principal');
    expect(request).not.toHaveProperty('user');
    expect(Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(undefined);
  });
});

describe('AuthContextGuard tenant resolver path derivation', () => {
  async function resolvedInput(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const verifier = { verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })) };
    const tenantResolver = { resolve: vi.fn(async () => 't-resolved') };
    const guard = new AuthContextGuard(verifier as never, undefined, tenantResolver as never);
    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request.tenantId).toBe('t-resolved');
    expect(tenantResolver.resolve).toHaveBeenCalledTimes(1);
    const [input] = tenantResolver.resolve.mock.calls[0] as unknown as [Record<string, unknown>];
    return input;
  }

  it('falls back to request.url when originalUrl is absent', async () => {
    const input = await resolvedInput({ headers: {}, url: '/fallback/path?page=2' });
    expect(input.path).toBe('/fallback/path');
    expect(input).not.toHaveProperty('host');
    expect(input).not.toHaveProperty('headerTenantId');
  });

  it('normalizes a query-only url to the root path', async () => {
    const input = await resolvedInput({ headers: {}, url: '?page=2' });
    expect(input.path).toBe('/');
  });

  it('falls back to the root path when the url accessor stops yielding a value between reads', async () => {
    const reads = ['/transient?x=1'];
    const request: Record<string, unknown> = { headers: {} };
    Object.defineProperty(request, 'url', { get: () => reads.shift(), enumerable: true });
    const input = await resolvedInput(request);
    expect(input.path).toBe('/');
    expect(reads).toEqual([]);
  });

  it('omits the path when neither originalUrl nor url is present', async () => {
    const input = await resolvedInput({ headers: {} });
    expect(input).not.toHaveProperty('path');
    expect((input.principal as { id: string }).id).toBe('p-1');
  });
});

describe('AuthContextGuard public-tenant bootstrap validation', () => {
  class PlainController {
    status(): string { return 'plain'; }
  }

  class PublicController {
    status(): string { return 'public'; }
  }
  Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, true, PublicController);

  function modulesWith(metatypes: Array<unknown>): unknown {
    const controllers = new Map(metatypes.map((metatype, index) => [`controller-${index}`, { metatype }]));
    return new Map([['module', { controllers }]]);
  }

  const verifier = { verifyAuthorizationHeader: vi.fn(async () => null) };

  it('skips validation when the modules container is unavailable', () => {
    const moduleRef = { get: vi.fn(() => { throw new Error('absent'); }) };
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, undefined, undefined, moduleRef as never);
    expect(guard.onApplicationBootstrap()).toBe(undefined);
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('skips validation when the module reference is unavailable', () => {
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, undefined, modulesWith([PublicController]) as never);
    expect(() => guard.onApplicationBootstrap()).not.toThrow();
  });

  it('ignores controller wrappers without a metatype and non-public controllers', () => {
    const moduleRef = { get: vi.fn(() => { throw new Error('absent'); }) };
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, undefined, modulesWith([undefined, null, PlainController]) as never, moduleRef as never);
    expect(guard.onApplicationBootstrap()).toBe(undefined);
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('rejects a public controller when the tenancy options provider is absent', () => {
    const moduleRef = { get: vi.fn(() => { throw new Error('absent'); }) };
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, undefined, modulesWith([undefined, PublicController]) as never, moduleRef as never);
    expect(() => guard.onApplicationBootstrap()).toThrow('PublicTenantRoute requires StynxTenancyModule publicTenant options');
    expect(moduleRef.get).toHaveBeenCalledWith(STYNX_PUBLIC_TENANT_OPTIONS, { strict: false });
  });

  it('accepts a public controller when the tenancy options provider is registered', () => {
    const moduleRef = { get: vi.fn(() => ({ enabled: true })) };
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, undefined, modulesWith([undefined, PublicController]) as never, moduleRef as never);
    expect(guard.onApplicationBootstrap()).toBe(undefined);
    expect(moduleRef.get).toHaveBeenCalledTimes(1);
  });
});
