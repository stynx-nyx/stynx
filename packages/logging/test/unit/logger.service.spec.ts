import { StynxLogger } from '../../src/logger.service';

describe('StynxLogger', () => {
  it('attaches trace and suppressed duplicate count to error logs', () => {
    const payloads: Array<{ fields: Record<string, unknown>; message: string }> = [];
    const logger = new StynxLogger(
      {
        info: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
        trace: () => undefined,
        error: (fields: Record<string, unknown>, message: string) => {
          payloads.push({ fields, message });
        },
      } as never,
      {
        create: (fields?: Record<string, unknown>) => fields ?? {},
      } as never,
      {
        register: (() => {
          let seen = false;
          return () => {
            if (seen) {
              return { shouldLog: true, suppressedCount: 2 };
            }
            seen = true;
            return { shouldLog: true };
          };
        })(),
      } as never,
    );

    logger.error('boom', 'stack-trace', 'TestContext');
    logger.error('boom', 'stack-trace', 'TestContext');

    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual({
      message: 'boom',
      fields: {
        context: 'TestContext',
        stack: 'stack-trace',
        dedupe_suppressed_count: 2,
      },
    });
  });
});

describe('StynxLogger.log/warn/debug/verbose', () => {
  function makeLogger() {
    const calls: Array<{ level: string; fields: unknown; message: string }> = [];
    const pino = {
      info: (fields: unknown, message: string) => calls.push({ level: 'info', fields, message }),
      warn: (fields: unknown, message: string) => calls.push({ level: 'warn', fields, message }),
      debug: (fields: unknown, message: string) => calls.push({ level: 'debug', fields, message }),
      trace: (fields: unknown, message: string) => calls.push({ level: 'trace', fields, message }),
      error: () => undefined,
    } as never;
    const fieldFactory = {
      create: (fields?: Record<string, unknown>) => fields ?? {},
    } as never;
    const dedupe = {
      register: () => ({ shouldLog: true, suppressedCount: undefined }),
    } as never;
    return { logger: new StynxLogger(pino, fieldFactory, dedupe), calls };
  }

  it('log emits at info level with the passed message', () => {
    const { logger, calls } = makeLogger();
    logger.log('starting up', 'Boot');
    expect(calls).toEqual([{ level: 'info', fields: { context: 'Boot' }, message: 'starting up' }]);
  });

  it('warn emits at warn level', () => {
    const { logger, calls } = makeLogger();
    logger.warn('degraded path', { requestId: 'r-1' });
    expect(calls[0]).toEqual({ level: 'warn', fields: { requestId: 'r-1' }, message: 'degraded path' });
  });

  it('debug emits at debug level', () => {
    const { logger, calls } = makeLogger();
    logger.debug('detail');
    expect(calls[0]).toEqual({ level: 'debug', fields: {}, message: 'detail' });
  });

  it('verbose emits at trace level', () => {
    const { logger, calls } = makeLogger();
    logger.verbose('hot loop iteration');
    expect(calls[0]?.level).toBe('trace');
  });
});

describe('StynxLogger.error edge cases', () => {
  function setup(decision: { shouldLog: boolean; suppressedCount?: number }) {
    const errorCalls: Array<{ fields: unknown; message: string }> = [];
    const logger = new StynxLogger(
      {
        info: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
        trace: () => undefined,
        error: (fields: unknown, message: string) => errorCalls.push({ fields, message }),
      } as never,
      {
        create: (fields?: Record<string, unknown>) => fields ?? {},
      } as never,
      { register: () => decision } as never,
    );
    return { logger, errorCalls };
  }

  it('suppresses error log when dedupe says so', () => {
    const { logger, errorCalls } = setup({ shouldLog: false });
    logger.error('boom', 'trace', 'Ctx');
    expect(errorCalls).toHaveLength(0);
  });

  it('passes only fields when called with object context (no trace string)', () => {
    const { logger, errorCalls } = setup({ shouldLog: true });
    logger.error('boom', { requestId: 'r-1' });
    expect(errorCalls[0]?.fields).toEqual({ requestId: 'r-1' });
    expect(Object.hasOwn(errorCalls[0]?.fields as Record<string, unknown>, 'stack')).toBe(false);
  });
});
