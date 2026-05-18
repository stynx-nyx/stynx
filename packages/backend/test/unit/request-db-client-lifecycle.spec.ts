import { EventEmitter } from 'node:events';
import {
  PgTenantDbClientLifecycle,
  ResponseEventRequestDbClientLifecycle,
} from '../../src/db-context/request-db-client-lifecycle';
import type {
  ResponseLike,
  TenantBoundDbClientFactory,
} from '../../src/db-context/request-db-client-lifecycle';

function fakeResponse() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { finished: false, writableEnded: false }) as unknown as ResponseLike & EventEmitter;
}

describe('PgTenantDbClientLifecycle', () => {
  it('acquire delegates to factory.connectWithTenant with the tenantId', async () => {
    const factory: TenantBoundDbClientFactory = {
      connectWithTenant: jest.fn(async (tid: string) => ({ tag: tid })),
    };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    const client = await lifecycle.acquire({ request: { headers: {} } as never, tenantId: 'tenant-1' });
    expect(factory.connectWithTenant).toHaveBeenCalledWith('tenant-1');
    expect(client).toEqual({ tag: 'tenant-1' });
  });

  it('release calls client.release() by default', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: jest.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    const release = jest.fn();
    await lifecycle.release({
      request: { headers: {} } as never,
      tenantId: 't',
      client: { release },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('release honors releaseMethodName override (e.g. "close")', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: jest.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory, { releaseMethodName: 'close' });
    const close = jest.fn();
    await lifecycle.release({
      request: { headers: {} } as never,
      tenantId: 't',
      client: { close },
    });
    expect(close).toHaveBeenCalled();
  });

  it('release is a no-op when the client does not expose the release method', async () => {
    const factory: TenantBoundDbClientFactory = { connectWithTenant: jest.fn() };
    const lifecycle = new PgTenantDbClientLifecycle(factory);
    await expect(
      lifecycle.release({ request: { headers: {} } as never, tenantId: 't', client: {} }),
    ).resolves.toBeUndefined();
  });
});

describe('ResponseEventRequestDbClientLifecycle', () => {
  function makeDelegate() {
    return {
      acquire: jest.fn(async () => ({ tag: 'client' })),
      release: jest.fn(async () => undefined),
    };
  }

  it('acquire delegates straight through', async () => {
    const delegate = makeDelegate();
    const wrapper = new ResponseEventRequestDbClientLifecycle(delegate);
    const client = await wrapper.acquire({ request: { headers: {} } as never, tenantId: 't' });
    expect(client).toEqual({ tag: 'client' });
    expect(delegate.acquire).toHaveBeenCalled();
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
    expect(delegate.release).not.toHaveBeenCalled();
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
    expect(delegate.release).not.toHaveBeenCalled();
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });
});
