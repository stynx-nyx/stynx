import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_RATE_LIMIT_ROUTE } from '../../src/constants.js';
import { RateLimitGuard } from '../../src/rate-limit.guard.js';
import type { RateLimitDecision, RateLimitDecisionContext, RateLimitPolicyResolver, RateLimitStore } from '../../src/types.js';

function harness(response: unknown, trace: string[] = [], authorization?: string) {
  const decision: RateLimitDecision = {
    allowed: true,
    get limit() { trace.push('limit'); return 3; },
    remaining: 2, resetAtEpochMs: 4000, retryAfterSeconds: 1, used: 1,
  };
  const observations: RateLimitDecisionContext[] = [];
  const store: RateLimitStore = { async consume(context) { observations.push(context); return decision; } };
  const resolver: RateLimitPolicyResolver = { async resolve() { return { bucket: 'tenant', scope: 'native', cost: 1, limit: 3, windowSeconds: 60 }; } };
  const handler = () => undefined;
  Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 'native' }, handler);
  const request = { headers: { authorization }, method: 'GET', path: '/native', res: response };
  const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => handler, getClass: () => class NativeController {} } as unknown as ExecutionContext;
  const guard = new RateLimitGuard(new Reflector(), {}, store, resolver);
  return { run: () => guard.canActivate(context), observations, request };
}

describe('native rate-limit response boundary', () => {
  it('preserves two header Gets, custom bind receiver, wrapper identity and later setter replacement', async () => {
    const trace: string[] = [];
    const calls: { receiver: unknown; name: string; value: string }[] = [];
    const method = { get bind() {
      trace.push('bind:get');
      return function(this: unknown, target: unknown) {
        expect(this).toBe(method);
        expect(target).toBe(response);
        trace.push('bind:call');
        return function(this: { setHeader: unknown }, name: string, value: string) {
          calls.push({ receiver: this, name, value });
          if (name === 'X-RateLimit-Limit') {
            this.setHeader = function(this: unknown, nextName: string, nextValue: string) {
              calls.push({ receiver: this, name: nextName, value: nextValue });
            };
          }
        };
      };
    } };
    const response = { get setHeader() { expect(this).toBe(response); trace.push('setHeader:get'); return method; } };
    await expect(harness(response, trace).run()).resolves.toBe(true);
    expect(trace).toEqual(['setHeader:get', 'setHeader:get', 'bind:get', 'bind:call', 'limit', 'setHeader:get', 'setHeader:get', 'bind:get', 'bind:call']);
    expect(calls.slice(0, 3).map(({ name, value }) => [name, value])).toEqual([['X-RateLimit-Limit', '3'], ['X-RateLimit-Remaining', '2'], ['X-RateLimit-Reset', '4']]);
    expect(calls[1]?.receiver).toBe(calls[0]?.receiver);
    expect(calls[2]?.receiver).toBe(calls[0]?.receiver);
    expect(calls[0]?.receiver).not.toBe(response);
    expect(calls[3]?.receiver).not.toBe(calls[0]?.receiver);
    expect(calls[3]?.name).toBe('X-Stynx-RateLimit-Overhead-Ms');
    expect(calls[3]?.value).toMatch(/^\d+\.\d{3}$/u);
  });

  it.each([1, 2])('preserves error identity from header Get %i before reading decision fields', async (throwOn) => {
    const trace: string[] = [];
    const sentinel = new Error('native getter sentinel');
    let gets = 0;
    const response = { get setHeader() { trace.push('get'); if (++gets === throwOn) throw sentinel; return () => undefined; } };
    await expect(harness(response, trace).run()).rejects.toBe(sentinel);
    expect(trace).toEqual(Array.from({ length: throwOn }, () => 'get'));
  });

  it.each([
    ['noncallable bind', () => ({ bind: 1 }), false],
    ['class bind', () => ({ bind: class NativeBind {} }), false],
    ['noncallable setter', () => ({ bind: () => 1 }), true],
    ['class setter', () => ({ bind: () => class NativeSetter {} }), true],
  ] as const)('preserves TypeError and argument evaluation position for %s', async (_name, makeMethod, readsLimit) => {
    const trace: string[] = [];
    const response = { setHeader: makeMethod() };
    await expect(harness(response, trace).run()).rejects.toBeInstanceOf(TypeError);
    expect(trace).toEqual(readsLimit ? ['limit'] : []);
  });

  it('preserves a nullish second header Get failure before decision arguments', async () => {
    const trace: string[] = [];
    let gets = 0;
    const response = { get setHeader() { trace.push('get'); return ++gets === 1 ? true : undefined; } };
    await expect(harness(response, trace).run()).rejects.toBeInstanceOf(TypeError);
    expect(trace).toEqual(['get', 'get']);
  });

  it('preserves native JWT JSON scalar, null, array and string-claim selection', async () => {
    for (const [payload, tenantId, userId] of [
      [null, undefined, undefined], [true, undefined, undefined], [17, undefined, undefined],
      ['text', undefined, undefined], [[], undefined, undefined],
      [{ sub: 17, tenant_id: false }, undefined, undefined],
      [{ sub: 'user', tenant_id: 'tenant' }, 'tenant', 'user'],
    ] as const) {
      const authorization = `Bearer h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
      const actual = harness(undefined, [], authorization);
      await expect(actual.run()).resolves.toBe(true);
      expect(actual.observations).toHaveLength(1);
      expect(actual.observations[0]?.tenantId).toBe(tenantId);
      expect(actual.observations[0]?.userId).toBe(userId);
      expect(actual.observations[0]?.bucketKey).toBe(`native:tenant:${tenantId ?? 'public'}`);
    }
  });
});
