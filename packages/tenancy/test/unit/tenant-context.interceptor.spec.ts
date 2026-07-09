import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { TenantContextInterceptor } from '../../src/tenant-context.interceptor';
import { MembershipAccessCache } from '../../src/membership-cache';

const TENANT_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07111';
const ACTOR_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07112';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  function bearer(payload: Record<string, unknown>): string {
    return `Bearer header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
  }

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
    expect(txQuery).not.toHaveBeenCalledTimes(1);
  });

  it('runs the downstream handler with tenant context and unsubscribes cleanly', async () => {
    const { interceptor, requestContextMutator } = createInterceptor({ cached: true });
    const unsubscribe = vi.fn();
    const next: CallHandler = {
      handle: vi.fn(() => ({
        subscribe: vi.fn((observer) => {
          observer.next('ok');
          return { unsubscribe };
        }),
      })),
    };
    const received: unknown[] = [];

    const subscription = interceptor
      .intercept(createExecutionContext({
        headers: { 'x-tenant-id': TENANT_ID },
        originalUrl: '/records',
        principal: { id: ACTOR_ID },
      }), next)
      .subscribe({ next: (value) => received.push(value) });
    await new Promise((resolve) => setImmediate(resolve));
    subscription.unsubscribe();

    expect(received).toEqual(['ok']);
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      expect.any(Function),
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('runs optional paths without adding tenant context', async () => {
    const { interceptor, requestContextMutator } = createInterceptor({ cached: true });
    const next: CallHandler = {
      handle: vi.fn(() => ({
        subscribe: vi.fn((observer) => {
          observer.complete();
          return { unsubscribe: vi.fn() };
        }),
      })),
    };

    interceptor.intercept(createExecutionContext({ headers: {}, originalUrl: '/readyz' }), next).subscribe();
    await new Promise((resolve) => setImmediate(resolve));

    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      expect.not.objectContaining({ tenantId: expect.any(String) }),
      expect.any(Function),
    );
  });

  it('forwards downstream handler errors to the subscriber', async () => {
    const { interceptor } = createInterceptor({ cached: true });
    const error = new Error('downstream failed');
    const next: CallHandler = {
      handle: vi.fn(() => ({
        subscribe: vi.fn((observer) => {
          observer.error(error);
          return { unsubscribe: vi.fn() };
        }),
      })),
    };

    const received = await new Promise<unknown>((resolve) => {
      interceptor
        .intercept(createExecutionContext({
          headers: { 'x-tenant-id': TENANT_ID },
          originalUrl: '/records',
          principal: { id: ACTOR_ID },
        }), next)
        .subscribe({ error: resolve });
    });

    expect(received).toBe(error);
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

    expect(membershipCache.get).toHaveBeenCalledTimes(1);
    expect(txQuery).not.toHaveBeenCalledTimes(1);
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

  it('resolves tenant and actor identities from bearer claims', async () => {
    const { interceptor, txQuery } = createInterceptor({ allowed: true });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { authorization: bearer({ sub: ACTOR_ID, tenant_id: TENANT_ID }) },
        originalUrl: '/records',
      }),
    ).resolves.toEqual({ tenantId: TENANT_ID });

    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('from auth.memberships membership'), [
      ACTOR_ID,
      TENANT_ID,
    ]);
  });

  it('falls back from host to hostname when resolving subdomain tenants', async () => {
    const { interceptor } = createInterceptor({ allowed: true, allowSubdomain: true });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: {},
        originalUrl: '/records',
        hostname: `${TENANT_ID}.example.test`,
        user: { id: ACTOR_ID },
      }),
    ).resolves.toEqual({ tenantId: TENANT_ID });
  });

  it('rejects malformed tenant identifiers before membership lookup', async () => {
    const { interceptor, txQuery } = createInterceptor({ allowed: true });

    await expect(
      (interceptor as never).resolveAndValidate({
        headers: { 'x-tenant-id': 'tenant-alpha' },
        originalUrl: '/records',
        principal: { id: ACTOR_ID },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(txQuery).not.toHaveBeenCalledTimes(1);
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
