import { RequestLoggingMiddleware } from '../../src/request-logging.middleware';

describe('RequestLoggingMiddleware', () => {
  it('logs one request completion record for non-health routes', () => {
    const records: Array<Record<string, unknown>> = [];
    const listeners = new Map<string, () => void>();
    const middleware = new RequestLoggingMiddleware(
      {
        log: (_message: string, fields?: Record<string, unknown>) => {
          records.push(fields ?? {});
        },
      } as never,
      {},
    );

    middleware.use(
      { method: 'POST', originalUrl: '/example' },
      {
        statusCode: 201,
        once: (event, listener) => {
          listeners.set(event, listener);
        },
      },
      () => undefined,
    );

    listeners.get('finish')?.();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      route: '/example',
      method: 'POST',
      status: 201,
    });
  });

  it('skips health endpoints', () => {
    let nextCalls = 0;
    const middleware = new RequestLoggingMiddleware(
      {
        log: () => {
          throw new Error('should not log');
        },
      } as never,
    );

    middleware.use(
      { method: 'GET', originalUrl: '/healthz' },
      {
        statusCode: 200,
        once: () => undefined,
      },
      () => {
        nextCalls += 1;
      },
    );
    expect(nextCalls).toBe(1);
  });

  it('short-circuits all default skip endpoints without registering a finish listener', () => {
    let nextCalls = 0;
    const middleware = new RequestLoggingMiddleware(
      {
        log: () => {
          throw new Error('should not log');
        },
      } as never,
    );
    const response = {
      statusCode: 200,
      once: () => {
        throw new Error('skipped request should not register finish listener');
      },
    };

    middleware.use({ method: 'GET', originalUrl: '/readyz/check' }, response, () => {
      nextCalls += 1;
    });
    middleware.use({ method: 'GET', originalUrl: '/metrics/prometheus' }, response, () => {
      nextCalls += 1;
    });

    expect(nextCalls).toBe(2);
  });

  it('uses default request values and custom skip paths', () => {
    const records: Array<Record<string, unknown>> = [];
    const listeners = new Map<string, () => void>();
    const middleware = new RequestLoggingMiddleware(
      {
        log: (_message: string, fields?: Record<string, unknown>) => {
          records.push(fields ?? {});
        },
      } as never,
      { skipPaths: ['/skip'] },
    );

    middleware.use(
      { url: '/skip/me' },
      { once: () => undefined },
      () => undefined,
    );
    middleware.use(
      {},
      {
        once: (event, listener) => listeners.set(event, listener),
      },
      () => undefined,
    );

    listeners.get('finish')?.();
    expect(records[0]).toMatchObject({
      route: '/',
      method: 'GET',
      status: 200,
    });
  });

  it('uses prefix matching for custom skip paths', () => {
    let nextCalls = 0;
    const middleware = new RequestLoggingMiddleware(
      {
        log: () => {
          throw new Error('should not log');
        },
      } as never,
      { skipPaths: ['/internal', '/skip'] },
    );

    middleware.use(
      { method: 'GET', originalUrl: '/skip/me' },
      {
        statusCode: 200,
        once: () => {
          throw new Error('skipped request should not register finish listener');
        },
      },
      () => {
        nextCalls += 1;
      },
    );

    expect(nextCalls).toBe(1);
  });

  it('records elapsed duration from request start to finish', () => {
    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;
    const records: Array<Record<string, unknown>> = [];
    const listeners = new Map<string, () => void>();
    const middleware = new RequestLoggingMiddleware(
      {
        log: (_message: string, fields?: Record<string, unknown>) => {
          records.push(fields ?? {});
        },
      } as never,
      {},
    );

    try {
      middleware.use(
        { method: 'PUT', originalUrl: '/duration' },
        {
          statusCode: 204,
          once: (event, listener) => listeners.set(event, listener),
        },
        () => undefined,
      );

      now = 1_250;
      listeners.get('finish')?.();

      expect(records[0]).toMatchObject({
        route: '/duration',
        method: 'PUT',
        status: 204,
        duration_ms: 250,
      });
    } finally {
      Date.now = originalNow;
    }
  });
});
