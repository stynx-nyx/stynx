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
    const middleware = new RequestLoggingMiddleware(
      {
        log: () => {
          throw new Error('should not log');
        },
      } as never,
      {},
    );

    middleware.use(
      { method: 'GET', originalUrl: '/healthz' },
      {
        statusCode: 200,
        once: () => undefined,
      },
      () => undefined,
    );
  });
});
