import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx/core';
import { TenantContextInterceptor } from '../../src/tenant-context.interceptor';
import { MembershipAccessCache } from '../../src/membership-cache';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  function createInterceptor(options: {
    allowed?: boolean;
    cached?: boolean | undefined;
    allowSubdomain?: boolean;
  } = {}) {
    const txQuery = vi.fn().mockResolvedValue({ rows: [{ allowed: options.allowed ?? true }] });
    const database = {
      withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
      tx: vi.fn(async (fn: (trx: { query: typeof txQuery }) => Promise<unknown>) => fn({ query: txQuery })),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (typeof token === 'function' && token.name === 'Database') {
          return database;
        }
        return undefined;
      }),
    } as unknown as ModuleRef;
    const requestContext = {
      snapshot: vi.fn(() => ({ requestId: 'req-1', startedAt: new Date() })),
    } as unknown as RequestContext;
    const requestContextMutator = {
      runWithRequestContext: vi.fn((_next, fn: () => unknown) => fn()),
    } as unknown as RequestContextMutator;
    const membershipCache = {
      get: vi.fn().mockReturnValue(options.cached),
      set: vi.fn(),
    } as unknown as MembershipAccessCache;
    const interceptor = new TenantContextInterceptor(
      moduleRef,
      requestContext,
      requestContextMutator,
      membershipCache,
      {
        headerName: 'X-Tenant-Id',
        allowSubdomain: options.allowSubdomain ?? false,
        membershipCacheTtlMs: 5_000,
        membershipCacheMaxEntries: 1_000,
        platformAdminEnvFlag: 'STYNX_TENANCY_PLATFORM_ADMIN',
      },
    );

    return { interceptor, txQuery, database, membershipCache, requestContextMutator };
  }

  it('skips optional paths without hitting the database', async () => {
    const { interceptor, txQuery } = createInterceptor();
    const next: CallHandler = { handle: vi.fn(() => ({ subscribe: vi.fn() })) };

    interceptor.intercept(createExecutionContext({ originalUrl: '/healthz', headers: {} }), next);

    await new Promise((resolve) => setImmediate(resolve));
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('rejects missing tenant context and mismatched header/claim pairs', async () => {
    const { interceptor } = createInterceptor();

    await expect((interceptor as never).resolveAndValidate({ headers: {}, originalUrl: '/records' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' },
        originalUrl: '/records',
        stynxClaims: { sub: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112', tenantId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07113' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses cached membership decisions and resolves tenant ids from subdomains', async () => {
    const { interceptor, txQuery, membershipCache } = createInterceptor({
      cached: true,
      allowSubdomain: true,
    });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { host: '018f53e4-28a1-7cd8-a0ff-5b22c3a07111.example.test' },
        originalUrl: '/records',
        stynxClaims: { sub: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112', tenantId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' },
      }),
    ).resolves.toEqual({ tenantId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' });

    expect(membershipCache.get).toHaveBeenCalled();
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('trims tenant sources, validates membership through owner readonly tx, and caches the decision', async () => {
    const { interceptor, txQuery, database, membershipCache } = createInterceptor({ allowed: true });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': ' 018f53e4-28a1-7cd8-a0ff-5b22c3a07111 ' },
        originalUrl: '/records',
        principal: { id: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112' },
      }),
    ).resolves.toEqual({ tenantId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' });

    expect(database.withSystemContext).toHaveBeenCalledWith('tenant membership validation', expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner', readonly: true });
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('from auth.memberships membership'), [
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07111',
    ]);
    expect(membershipCache.set).toHaveBeenCalledWith(
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07111',
      true,
    );
  });

  it('trims tenant ids from stynx claims and returns optional paths without a tenant', async () => {
    const { interceptor, txQuery } = createInterceptor({ allowed: true });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: {},
        originalUrl: '/records',
        stynxClaims: {
          sub: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
          tenantId: ' 018f53e4-28a1-7cd8-a0ff-5b22c3a07111 ',
        },
      }),
    ).resolves.toEqual({ tenantId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' });
    await expect(
      (interceptor as never).resolveAndValidate({ headers: {}, originalUrl: '/readyz' }),
    ).resolves.toEqual({});
    expect(txQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive memberships and caches the negative membership decision', async () => {
    const { interceptor, membershipCache } = createInterceptor({ allowed: false });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' },
        originalUrl: '/records',
        principal: { id: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(membershipCache.set).toHaveBeenCalledWith(
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07111',
      false,
    );
  });

  it('rejects requests without an actor identity', async () => {
    const { interceptor } = createInterceptor();

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' },
        originalUrl: '/records',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails explicitly when membership validation has no database provider', async () => {
    const moduleRef = { get: vi.fn(() => undefined) } as unknown as ModuleRef;
    const interceptor = new TenantContextInterceptor(
      moduleRef,
      { snapshot: vi.fn(() => ({ requestId: 'req-1', startedAt: new Date() })) } as unknown as RequestContext,
      { runWithRequestContext: vi.fn((_next, fn: () => unknown) => fn()) } as unknown as RequestContextMutator,
      { get: vi.fn(), set: vi.fn() } as unknown as MembershipAccessCache,
      {
        headerName: 'X-Tenant-Id',
        allowSubdomain: false,
        membershipCacheTtlMs: 5_000,
        membershipCacheMaxEntries: 1_000,
        platformAdminEnvFlag: 'STYNX_TENANCY_PLATFORM_ADMIN',
      },
    );

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': '018f53e4-28a1-7cd8-a0ff-5b22c3a07111' },
        originalUrl: '/records',
        principal: { id: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112' },
      }),
    ).rejects.toThrow('Database provider is unavailable to TenantContextInterceptor');
  });
});
