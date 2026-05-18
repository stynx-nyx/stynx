import {
  ResponseEventRequestDbClientLifecycle,
  type ResponseLike,
} from '../../../packages/backend/src/db-context/request-db-client-lifecycle';

function createResponseStub() {
  const listeners: Record<'finish' | 'close', Array<() => void>> = {
    finish: [],
    close: [],
  };
  const response: ResponseLike = {
    finished: false,
    writableEnded: false,
    once: vi.fn((event: 'finish' | 'close', listener: () => void) => {
      listeners[event].push(listener);
      return response;
    }),
  };

  return {
    response,
    emit(event: 'finish' | 'close') {
      for (const listener of listeners[event]) {
        listener();
      }
    },
  };
}

describe('ResponseEventRequestDbClientLifecycle', () => {
  it('binds release to finish/close and releases only once', async () => {
    const delegate = {
      acquire: vi.fn(async () => ({ id: 'client-1' })),
      release: vi.fn(async () => undefined),
    };
    const wrapped = new ResponseEventRequestDbClientLifecycle(delegate);
    const { response, emit } = createResponseStub();
    const request = {
      headers: {},
      response,
    };

    await wrapped.release({
      request,
      tenantId: 'tenant-a',
      client: { id: 'client-1' },
    });

    expect(delegate.release).not.toHaveBeenCalled();
    emit('finish');
    emit('close');
    expect(delegate.release).toHaveBeenCalledTimes(1);
  });

  it('falls back to immediate release when response is missing', async () => {
    const delegate = {
      acquire: vi.fn(async () => ({ id: 'client-1' })),
      release: vi.fn(async () => undefined),
    };
    const wrapped = new ResponseEventRequestDbClientLifecycle(delegate);

    await wrapped.release({
      request: { headers: {} },
      tenantId: 'tenant-a',
      client: { id: 'client-1' },
    });

    expect(delegate.release).toHaveBeenCalledTimes(1);
  });
});
