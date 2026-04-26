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
