import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { DbContextInterceptor } from '../../src/db-context/db-context.interceptor';
import { getPrincipalFromRequest } from '../../src/common/request-context';

const PRINCIPAL = {
  id: 'p-1',
  roles: ['admin'],
  permissions: ['doc:read'],
  tenants: ['t-1'],
  claims: {},
};

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown = 'ok'): CallHandler {
  return { handle: () => of(value) };
}

function run(observable: Observable<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

describe('DbContextInterceptor', () => {
  it('skips applier when there is no principal on the request', async () => {
    const applier = { apply: jest.fn() };
    const interceptor = new DbContextInterceptor(applier);
    const request = { headers: {}, pgClient: { tag: 'c' } };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('skips applier when no client is resolvable', async () => {
    const applier = { apply: jest.fn() };
    const interceptor = new DbContextInterceptor(applier);
    const request = { headers: {}, principal: PRINCIPAL };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('applies session context when principal + pgClient are present', async () => {
    const applier = { apply: jest.fn() };
    const interceptor = new DbContextInterceptor(applier);
    const request = {
      headers: {},
      principal: PRINCIPAL,
      tenantId: 't-1',
      pgClient: { tag: 'c' },
      requestId: 'req-1',
      correlationId: 'corr-1',
    };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(applier.apply).toHaveBeenCalledWith(
      { tag: 'c' },
      expect.objectContaining({
        userId: 'p-1',
        tenantId: 't-1',
        correlationId: 'corr-1',
        requestId: 'req-1',
      }),
    );
  });

  it('uses a custom dbClientResolver when provided', async () => {
    const applier = { apply: jest.fn() };
    const resolver = jest.fn(() => ({ tag: 'resolved' }));
    const interceptor = new DbContextInterceptor(applier, resolver);
    const request = { headers: {}, principal: PRINCIPAL };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(resolver).toHaveBeenCalled();
    expect(applier.apply).toHaveBeenCalledWith({ tag: 'resolved' }, expect.any(Object));
  });

  it('acquires + releases via lifecycle when no client is on the request', async () => {
    const applier = { apply: jest.fn() };
    const lifecycle = {
      acquire: jest.fn(async () => ({ tag: 'acquired' })),
      release: jest.fn(async () => undefined),
    };
    const interceptor = new DbContextInterceptor(applier, undefined, lifecycle);
    const request: Record<string, unknown> = {
      headers: {},
      principal: PRINCIPAL,
      tenantId: 't-1',
    };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(lifecycle.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1' }),
    );
    expect(applier.apply).toHaveBeenCalledWith({ tag: 'acquired' }, expect.any(Object));
    expect(lifecycle.release).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1', client: { tag: 'acquired' } }),
    );
    // The acquired client is bound to the request for downstream consumers.
    expect(request.pgClient).toEqual({ tag: 'acquired' });
  });

  it('does not call release when no client was acquired by the interceptor', async () => {
    const applier = { apply: jest.fn() };
    const lifecycle = {
      acquire: jest.fn(),
      release: jest.fn(async () => undefined),
    };
    const interceptor = new DbContextInterceptor(applier, undefined, lifecycle);
    const request = { headers: {}, principal: PRINCIPAL, pgClient: { tag: 'existing' } };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(lifecycle.acquire).not.toHaveBeenCalled();
    expect(lifecycle.release).not.toHaveBeenCalled();
  });

  it('swallows release errors so they do not bubble out of the request', async () => {
    const applier = { apply: jest.fn() };
    const lifecycle = {
      acquire: jest.fn(async () => ({ tag: 'acquired' })),
      release: jest.fn(async () => {
        throw new Error('release failed');
      }),
    };
    const interceptor = new DbContextInterceptor(applier, undefined, lifecycle);
    const request: Record<string, unknown> = {
      headers: {},
      principal: PRINCIPAL,
      tenantId: 't-1',
    };
    await expect(run(interceptor.intercept(ctx(request), makeHandler()))).resolves.toBe('ok');
  });

  it('skips lifecycle acquire when no tenantId is on the request', async () => {
    const applier = { apply: jest.fn() };
    const lifecycle = {
      acquire: jest.fn(),
      release: jest.fn(),
    };
    const interceptor = new DbContextInterceptor(applier, undefined, lifecycle);
    const request = { headers: {}, principal: PRINCIPAL };
    await run(interceptor.intercept(ctx(request), makeHandler()));
    expect(lifecycle.acquire).not.toHaveBeenCalled();
  });
});

describe('getPrincipalFromRequest', () => {
  it('returns request.principal when present', () => {
    expect(getPrincipalFromRequest({ headers: {}, principal: PRINCIPAL })).toEqual(PRINCIPAL);
  });

  it('falls back to principalContext.principal', () => {
    expect(
      getPrincipalFromRequest({ headers: {}, principalContext: { principal: PRINCIPAL } }),
    ).toEqual(PRINCIPAL);
  });

  it('falls back to request.user', () => {
    const result = getPrincipalFromRequest({
      headers: {},
      user: { id: 'u-1', roles: ['admin'], email: 'a@b' },
    });
    expect(result?.id).toBe('u-1');
    expect(result?.email).toBe('a@b');
  });

  it('falls back to request.actor', () => {
    const result = getPrincipalFromRequest({
      headers: {},
      actor: { id: 'a-1', permissions: ['x'], username: 'alice' },
    });
    expect(result?.id).toBe('a-1');
    expect(result?.username).toBe('alice');
  });

  it('returns undefined when no principal sources are present', () => {
    expect(getPrincipalFromRequest({ headers: {} })).toBeUndefined();
  });

  it('treats non-array roles/permissions/tenants/claims on user as empty/defaults', () => {
    const result = getPrincipalFromRequest({
      headers: {},
      user: { id: 'u', roles: 'not-an-array', tenants: null, claims: undefined },
    } as never);
    expect(result?.roles).toEqual([]);
    expect(result?.tenants).toEqual([]);
    expect(result?.claims).toEqual({});
  });
});
