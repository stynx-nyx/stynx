import { EventEmitter } from 'node:events';
import {
  PgTenantDbClientLifecycle,
  ResponseEventRequestDbClientLifecycle,
} from '../../src/db-context/request-db-client-lifecycle.js';
import type {
  ResponseLike,
  TenantBoundDbClientFactory,
} from '../../src/db-context/request-db-client-lifecycle.js';

function fakeResponse() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { finished: false, writableEnded: false }) as unknown as ResponseLike & EventEmitter;
}

describe('PgTenantDbClientLifecycle', () => {
  it('acquire delegates to factory.connectWithTenant with the tenantId', async () => {
    const factory: TenantBoundDbClientFactory = {
      connectWithTenant: vi.fn(async (tid: string) => ({ tag: tid })),
    };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    const client = await lifecycle.acquire({ request: { headers: {} } as never, tenantId: 'tenant-1' });
    expect(factory.connectWithTenant).toHaveBeenCalledWith('tenant-1');
    expect(client).toEqual({ tag: 'tenant-1' });
  });

  it('release calls client.release() by default', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: vi.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    const release = vi.fn();
    await lifecycle.release({
      request: { headers: {} } as never,
      tenantId: 't',
      client: { release },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('release honors releaseMethodName override (e.g. "close")', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: vi.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory, { releaseMethodName: 'close' });
    const close = vi.fn();
    await lifecycle.release({
      request: { headers: {} } as never,
      tenantId: 't',
      client: { close },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('release is a no-op when the client does not expose the release method', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: vi.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    await expect(
      lifecycle.release({ request: { headers: {} } as never, tenantId: 't', client: {} }),
    ).resolves.toBe(undefined);
  });
});

describe('ResponseEventRequestDbClientLifecycle', () => {
  function makeDelegate() {
    return {
      acquire: vi.fn(async () => ({ tag: 'client' })),
      release: vi.fn(async () => undefined),
    };
  }

  it('acquire delegates straight through', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const client = await wrapper.acquire({ request: { headers: {} } as never, tenantId: 't' });
    expect(client).toEqual({ tag: 'client' });
    expect(delegate.acquire).toHaveBeenCalledTimes(1);
  });

  it('release defers to the response finish event when response is open', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const response = fakeResponse();
    await wrapper.release({
      request: { headers: {}, response } as never,
      tenantId: 't',
      client: {},
    });
    expect(delegate.release).not.toHaveBeenCalledTimes(1);
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('releases immediately when the response is already finished', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const response = fakeResponse();
    (response as unknown as { finished: boolean }).finished = true;
    await wrapper.release({
      request: { headers: {}, response } as never,
      tenantId: 't',
      client: {},
    });
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('releases immediately when the response is already writable-ended', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const response = fakeResponse();
    (response as unknown as { writableEnded: boolean }).writableEnded = true;
    const context = {
      request: { headers: {}, response } as never,
      tenantId: 't',
      client: {},
    };
    await wrapper.release(context);
    await wrapper.release(context);
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('releases immediately when there is no response to listen on', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    await wrapper.release({
      request: { headers: {} } as never,
      tenantId: 't',
      client: {},
    });
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('does not double-release when both finish and close fire', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const response = fakeResponse();
    const request = { headers: {}, response };
    await wrapper.release({ request: request as never, tenantId: 't', client: {} });
    response.emit('finish');
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('resolves response from request.res when request.response is absent', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const res = fakeResponse();
    await wrapper.release({
      request: { headers: {}, res } as never,
      tenantId: 't',
      client: {},
    });
    res.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('ignores an invalid direct response and falls back to a valid nested response', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const res = fakeResponse();
    await wrapper.release({
      request: { headers: {}, response: { once: 'not-a-function' }, res } as never,
      tenantId: 't',
      client: {},
    });
    expect(delegate.release).not.toHaveBeenCalled();
    res.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('releases immediately when neither response candidate exposes once()', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    await wrapper.release({
      request: {
        headers: {},
        response: { once: 'not-a-function' },
        res: { once: 42 },
      } as never,
      tenantId: 't',
      client: {},
    });
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('skips the second release call when invoked twice for the same request', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const request = { headers: {} };
    await wrapper.release({ request: request as never, tenantId: 't', client: {} });
    await wrapper.release({ request: request as never, tenantId: 't', client: {} });
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('honors custom releaseEvents config', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate, {
      releaseEvents: ['close'],
    });
    const response = fakeResponse();
    await wrapper.release({
      request: { headers: {}, response } as never,
      tenantId: 't',
      client: {},
    });
    response.emit('finish'); // not in the list; should not trigger release
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).not.toHaveBeenCalledTimes(1);
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });
});


describe('request lifecycle opaque receiver preservation', () => {
  it('reads once lazily per registration and invokes each callable with the original receiver', async () => {
    const order: string[] = []; const receivers: unknown[] = [];
    const listeners: Array<() => void> = [];
    const response = {
      get once() { order.push('get:once'); return function (this: unknown, event: string, listener: () => void) { receivers.push(this); order.push(event); listeners.push(listener); }; },
      get finished() { order.push('finished'); return false; },
      get writableEnded() { order.push('writableEnded'); return false; },
    };
    const delegate = { acquire: vi.fn(), release: vi.fn(async () => undefined) };
    const lifecycle = new ResponseEventRequestDbClientLifecycle(delegate);
    const context = { request: { headers: {}, response }, tenantId: 't', client: {} };
    await lifecycle.release(context);
    expect(order).toEqual(['get:once', 'finished', 'writableEnded', 'get:once', 'finish', 'get:once', 'close']);
    expect(receivers).toEqual([response, response]);
    expect(delegate.release).not.toHaveBeenCalled();
    listeners[0]?.(); listeners[1]?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(delegate.release).toHaveBeenCalledExactlyOnceWith(context);
  });
  it('short circuits writableEnded and registration for a truthy finished flag', async () => {
    const once = vi.fn(); const writable = vi.fn(() => { throw new Error('must not read'); });
    const response = { once, finished: 'yes', get writableEnded() { return writable(); } };
    const delegate = { acquire: vi.fn(), release: vi.fn(async () => undefined) };
    await new ResponseEventRequestDbClientLifecycle(delegate).release({ request: { headers: {}, response }, tenantId: 't', client: {} });
    expect(writable).not.toHaveBeenCalled(); expect(once).not.toHaveBeenCalled();
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });
  it('does not capture a once callable that changes before registration', async () => {
    let reads = 0; const first = vi.fn();
    const response = { get once() { reads += 1; return reads === 1 ? first : null; } };
    const delegate = { acquire: vi.fn(), release: vi.fn() };
    await expect(new ResponseEventRequestDbClientLifecycle(delegate).release({ request: { headers: {}, response }, tenantId: 't', client: {} })).rejects.toBeInstanceOf(TypeError);
    expect(reads).toBe(2); expect(first).not.toHaveBeenCalled(); expect(delegate.release).not.toHaveBeenCalled();
  });
  it('preserves response getter errors without releasing or fallback', async () => {
    const error = new Error('getter'); const nested = vi.fn();
    const request = { headers: {}, response: { get once() { throw error; } }, get res() { return nested(); } };
    const delegate = { acquire: vi.fn(), release: vi.fn() };
    await expect(new ResponseEventRequestDbClientLifecycle(delegate).release({ request, tenantId: 't', client: {} })).rejects.toBe(error);
    expect(nested).not.toHaveBeenCalled(); expect(delegate.release).not.toHaveBeenCalled();
  });
  it('keeps strict marker assignment failure for frozen request state before release', async () => {
    const delegate = { acquire: vi.fn(), release: vi.fn() };
    await expect(new ResponseEventRequestDbClientLifecycle(delegate).release({ request: Object.freeze({ headers: {} }), tenantId: 't', client: {} })).rejects.toBeInstanceOf(TypeError);
    expect(delegate.release).not.toHaveBeenCalled();
  });
  it('awaits the client release thenable and preserves receiver and rejection identity', async () => {
    const error = new Error('release'); const receivers: unknown[] = [];
    const client = { release() { receivers.push(this); return Promise.reject(error); } };
    const lifecycle = new PgTenantDbClientLifecycle({ connectWithTenant: vi.fn() });
    await expect(lifecycle.release({ request: { headers: {} }, tenantId: 't', client })).rejects.toBe(error);
    expect(receivers).toEqual([client]);
  });
});
