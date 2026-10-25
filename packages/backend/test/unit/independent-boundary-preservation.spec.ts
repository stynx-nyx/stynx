import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_TENANT_ID } from '@stynx-nyx/contracts';
import { AuthContextGuard } from '../../src/auth/auth-context.guard.js';
import { TenantLifecycleMiddleware } from '../../src/db-context/tenant-lifecycle.middleware.js';
import { SlaMonitorInterceptor } from '../../src/sla/sla-monitor.interceptor.js';

const principal = { id: 'principal', roles: [], permissions: [], tenants: [], claims: {} };
const TENANT = '11111111-1111-4111-8111-111111111111';
function context(request: unknown, marker?: unknown): ExecutionContext {
  function handler() {}
  class Controller {}
  if (marker !== undefined) Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, marker, handler);
  return { getHandler: () => handler, getClass: () => Controller, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}
function auth() {
  const verify = vi.fn(async (_header: string | string[] | undefined) => ({ principal, token: 'verified' }));
  return { guard: new AuthContextGuard({ verifyAuthorizationHeader: verify }, { map: () => principal }), verify };
}
function invoke(target: object, name: string, ...args: unknown[]): unknown {
  const method: unknown = Reflect.get(target, name);
  if (typeof method !== 'function') throw new Error(`Missing actual method ${name}`);
  return Reflect.apply(method, target, args);
}

describe('AuthContextGuard independent preservation', () => {
  it.each([
    { name: 'undefined', value: undefined }, { name: 'empty string', value: '' },
    { name: 'string', value: 'Bearer native' }, { name: 'empty array', value: [] },
    { name: 'multiple strings', value: ['', 'Bearer native', 'second'] },
  ])('forwards valid protected $name unchanged', async ({ value }) => {
    const { guard, verify } = auth(); const request = { headers: { authorization: value } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledExactlyOnceWith(value);
    expect(verify.mock.calls[0]?.[0]).toBe(value);
  });
  it('does not invoke overridable array methods for a valid protected header', async () => {
    const value = ['Bearer native']; const every = vi.fn(() => { throw new Error('unused every'); });
    const iterator = vi.fn(() => { throw new Error('unused iterator'); });
    Object.defineProperty(value, 'every', { value: every }); Object.defineProperty(value, Symbol.iterator, { value: iterator });
    const { guard, verify } = auth(); await expect(guard.canActivate(context({ headers: { authorization: value } }))).resolves.toBe(true);
    expect(verify.mock.calls[0]?.[0]).toBe(value); expect(every).not.toHaveBeenCalled(); expect(iterator).not.toHaveBeenCalled();
  });
  // These are deliberately out-of-domain historical observations. The approved
  // input-boundary repair will turn the same population into redacted refusals.
  it.each([
    { name: 'null', value: null }, { name: 'number', value: 3 }, { name: 'boolean', value: false },
    { name: 'object', value: { secret: 'private-header' } }, { name: 'mixed', value: ['token', 7] },
    { name: 'sparse', value: Array(2) },
    { name: 'inherited index', value: Object.assign(Object.create({ 0: 'token' }), { length: 1 }) },
    { name: 'inherited array index', value: Object.setPrototypeOf(Array(1), Object.assign(Object.create(Array.prototype), { 0: 'token' })) },
  ])('records historical permissive-port forwarding outside declared header domain: $name', async ({ value }) => {
    const { guard, verify } = auth(); await expect(guard.canActivate(context({ headers: { authorization: value } }))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledTimes(1); expect(verify.mock.calls[0]?.[0]).toBe(value);
  });
  it.each([[true, false], [false, true]])('preserves two optionalAuth reads and changing values %s/%s', async (first, second) => {
    const receivers: unknown[] = []; const values = [first, second];
    const marker = { get optionalAuth() { receivers.push(this); return values.shift(); } };
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer native' }, actor: 'stale', stynxClaims: 'stale' };
    const { guard, verify } = auth(); await expect(guard.canActivate(context(request, marker))).resolves.toBe(true);
    expect(receivers).toEqual([marker, marker]); expect(request.publicTenantRoute).toBe(true);
    expect(request.publicTenantOptionalAuth).toBe(first); expect(verify).toHaveBeenCalledTimes(second ? 1 : 0);
    expect(request).not.toHaveProperty('stynxClaims');
  });
  it('retains null marker failure after cleanup and public route flag', async () => {
    const request: Record<PropertyKey, unknown> = { headers: {}, actor: 'stale', stynxClaims: 'stale', [STYNX_VERIFIED_TENANT_ID]: TENANT };
    const { guard, verify } = auth(); await expect(guard.canActivate(context(request, null))).rejects.toThrow(TypeError);
    expect(request.publicTenantRoute).toBe(true); expect(request).not.toHaveProperty('actor');
    expect(request).not.toHaveProperty('stynxClaims'); expect(request[STYNX_VERIFIED_TENANT_ID]).toBeUndefined(); expect(verify).not.toHaveBeenCalled();
  });
  it('keeps direct delete failure before metadata and verifier', async () => {
    const request = { headers: {} }; Object.defineProperty(request, 'stynxClaims', { value: 'old', configurable: false });
    const read = vi.fn(() => true); const marker = { get optionalAuth() { return read(); } };
    const { guard, verify } = auth(); await expect(guard.canActivate(context(request, marker))).rejects.toThrow(TypeError);
    expect(read).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it('keeps strict public flag setter failure before optional metadata read', async () => {
    const sentinel = new Error('flag setter'); const read = vi.fn(() => true); const request = { headers: {} };
    Object.defineProperty(request, 'publicTenantRoute', { set() { expect(this).toBe(request); throw sentinel; } });
    const { guard, verify } = auth(); await expect(guard.canActivate(context(request, { get optionalAuth() { return read(); } }))).rejects.toBe(sentinel);
    expect(read).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it('propagates verifier error identity before principal mapping', async () => {
    const failure = new Error('verifier'); const map = vi.fn(() => principal); const verify = vi.fn(async () => { throw failure; });
    const guard = new AuthContextGuard({ verifyAuthorizationHeader: verify }, { map });
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer native' } }))).rejects.toBe(failure); expect(map).not.toHaveBeenCalled();
  });
});

describe('TenantLifecycleMiddleware independent preservation', () => {
  it('reads headers then direct and lowercase keys before writes, registrations and next', () => {
    const order: string[] = []; const headers = Object.create({ get 'X-Tenant'() { order.push('direct'); return ' '; }, get 'x-tenant'() { order.push('lower'); return ` ${TENANT} `; } });
    const request = { get headers() { order.push('headers'); return headers; }, set tenantId(value: string) { expect(value).toBe(TENANT); expect(this).toBe(request); order.push('tenant'); } };
    const response = { once(event: string) { expect(this).toBe(response); order.push(event); } };
    new TenantLifecycleMiddleware({ tenantHeaderName: 'X-Tenant' }).use(request, response, () => order.push('next'));
    expect(order).toEqual(['headers', 'direct', 'lower', 'tenant', 'finish', 'close', 'next']);
  });
  it('reads once for admission and independently for both registrations with original receiver', () => {
    const order: string[] = []; const callbacks: unknown[] = []; let count = 0;
    const response = { get once() { order.push(`get${++count}`); return function(this: unknown, event: string, callback: unknown) { expect(this).toBe(response); order.push(event); callbacks.push(callback); }; } };
    new TenantLifecycleMiddleware({ requireTenantHeader: false }).use({ headers: {} }, response, () => order.push('next'));
    expect(order).toEqual(['get1', 'get2', 'finish', 'get3', 'close', 'next']); expect(callbacks[0]).toBe(callbacks[1]);
  });
  it('propagates a changing once getter failure before next', () => {
    const failure = new Error('registration'); let reads = 0; const next = vi.fn();
    const response = { get once() { if (++reads === 2) throw failure; return () => undefined; } };
    expect(() => new TenantLifecycleMiddleware({ requireTenantHeader: false }).use({ headers: {} }, response, next)).toThrow(failure);
    expect(reads).toBe(2); expect(next).not.toHaveBeenCalled();
  });
  it.each([null, undefined])('retains nullish request property failure: %s', (value) => {
    const next = vi.fn(); expect(() => new TenantLifecycleMiddleware({ requireTenantHeader: false }).use(value, undefined, next)).toThrow(TypeError); expect(next).not.toHaveBeenCalled();
  });
  it('preserves inherited primitive setter receiver and successful strict assignment', () => {
    const beforeHeaders = Object.getOwnPropertyDescriptor(Number.prototype, 'headers'); const beforeTenant = Object.getOwnPropertyDescriptor(Number.prototype, 'tenantId');
    const receivers: unknown[] = []; const next = vi.fn();
    Object.defineProperty(Number.prototype, 'headers', { configurable: true, get() { receivers.push(this); return { 'x-tenant-id': TENANT }; } });
    Object.defineProperty(Number.prototype, 'tenantId', { configurable: true, set(value) { expect(value).toBe(TENANT); receivers.push(this); } });
    try { new TenantLifecycleMiddleware().use(7, undefined, next); expect(receivers).toEqual([7, 7]); expect(next).toHaveBeenCalledTimes(1); }
    finally { if (beforeHeaders) Object.defineProperty(Number.prototype, 'headers', beforeHeaders); else Reflect.deleteProperty(Number.prototype, 'headers'); if (beforeTenant) Object.defineProperty(Number.prototype, 'tenantId', beforeTenant); else Reflect.deleteProperty(Number.prototype, 'tenantId'); }
  });
  it('preserves primitive failed-write TypeError after header access', () => {
    const before = Object.getOwnPropertyDescriptor(Number.prototype, 'headers'); const reads = vi.fn(() => ({ 'x-tenant-id': TENANT })); const next = vi.fn();
    Object.defineProperty(Number.prototype, 'headers', { configurable: true, get() { expect(this).toBe(7); return reads(); } });
    try { expect(() => new TenantLifecycleMiddleware().use(7, undefined, next)).toThrow(TypeError); expect(reads).toHaveBeenCalledTimes(1); expect(next).not.toHaveBeenCalled(); }
    finally { if (before) Object.defineProperty(Number.prototype, 'headers', before); else Reflect.deleteProperty(Number.prototype, 'headers'); }
  });
  it.each(['frozen', 'readonly', 'proxy'] as const)('retains strict tenant write failure for %s request', (kind) => {
    let request: object = { headers: { 'x-tenant-id': TENANT } };
    if (kind === 'frozen') Object.freeze(request);
    if (kind === 'readonly') Object.defineProperty(request, 'tenantId', { value: 'old', writable: false });
    if (kind === 'proxy') request = new Proxy(request, { set: () => false });
    const next = vi.fn(); expect(() => new TenantLifecycleMiddleware().use(request, undefined, next)).toThrow(TypeError); expect(next).not.toHaveBeenCalled();
  });
  it('preserves first truthy client, flag before release lookup, own call and thenable ordering', async () => {
    const order: string[] = []; function release() { throw new Error('overridden call is required'); }
    const client = { get release() { order.push('release-get'); return release; } };
    Object.defineProperty(release, 'call', { get() { order.push('call-get'); expect(this).toBe(release); return function(this: unknown, receiver: unknown) { expect(this).toBe(release); expect(receiver).toBe(client); order.push('call'); return { then(resolve: () => void) { order.push('then'); resolve(); } }; }; } });
    const request = new Proxy({ get pgClient() { order.push('pg'); return client; }, get dbClient() { throw new Error('must short circuit'); } }, {
      get(target, key, receiver) { if (typeof key === 'symbol') order.push('flag-get'); return Reflect.get(target, key, receiver); },
      set(target, key, value, receiver) { if (typeof key === 'symbol') order.push('flag-set'); return Reflect.set(target, key, value, receiver); },
    });
    const mw = new TenantLifecycleMiddleware(); await invoke(mw, 'releaseClient', request);
    expect(order).toEqual(['flag-get', 'pg', 'flag-set', 'release-get', 'call-get', 'call', 'then']);
    await invoke(mw, 'releaseClient', request); expect(order.at(-1)).toBe('flag-get'); expect(order.filter((x) => x === 'call')).toHaveLength(1);
  });
  it.each(['release', 'call', 'then'] as const)('retains %s failure identity after release flag is set', async (site) => {
    const failure = new Error(site); const release = function() { return { then() { throw failure; } }; };
    if (site === 'call') Object.defineProperty(release, 'call', { get() { throw failure; } });
    const request = { pgClient: { get release() { if (site === 'release') throw failure; return release; } } };
    const mw = new TenantLifecycleMiddleware(); await expect(invoke(mw, 'releaseClient', request)).rejects.toBe(failure);
    expect(Object.getOwnPropertySymbols(request).map((key) => Reflect.get(request, key))).toEqual([true]);
    await expect(invoke(mw, 'releaseClient', request)).resolves.toBeUndefined();
  });
  it('preserves release flag assignment failure before release lookup', async () => {
    const read = vi.fn(() => () => undefined); const request = Object.freeze({ pgClient: { get release() { return read(); } } });
    await expect(invoke(new TenantLifecycleMiddleware(), 'releaseClient', request)).rejects.toThrow(TypeError); expect(read).not.toHaveBeenCalled();
  });
});

describe('SLA closed dense-history preservation', () => {
  it.each([
    { name: 'empty', values: [], expected: [0, 0, 0] },
    { name: 'unsorted', values: [100, 1, 50], expected: [50, 100, 100] },
    { name: 'NaN', values: [NaN], expected: [NaN, NaN, NaN] },
    { name: 'infinities', values: [-Infinity, 0, Infinity], expected: [0, Infinity, Infinity] },
  ])('retains actual percentile callers for $name', ({ values, expected }) => {
    const instance = new SlaMonitorInterceptor(); const original = [...values];
    expect([50, 95, 99].map((p) => invoke(instance, 'percentile', values, p))).toEqual(expected); expect(values).toEqual(original);
  });
  it.each([0, -1, 1, 2, NaN, Infinity])('retains public window option %s through actual aggregate path', (windowSize) => {
    const sample = vi.fn(); const aggregate = vi.fn();
    const instance = new SlaMonitorInterceptor({ aggregateEvery: 1, windowSize }, { resolve: () => 'CUSTOM' }, { sample, aggregate });
    invoke(instance, 'recordAggregate', 'CUSTOM', 10, 15); invoke(instance, 'recordAggregate', 'CUSTOM', 30, 15);
    expect(aggregate).toHaveBeenCalledTimes(2);
    const size = windowSize <= 0 ? 0 : windowSize === 1 ? 1 : 2;
    expect(aggregate).toHaveBeenLastCalledWith(expect.objectContaining({ samples: size, p50Ms: size === 0 ? 0 : size === 1 ? 30 : 10, p95Ms: size === 0 ? 0 : 30, p99Ms: size === 0 ? 0 : 30 }));
  });
});
