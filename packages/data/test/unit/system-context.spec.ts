import { withSystemContext } from '../../src/system-context';
import type { SystemExecutionContext } from '@stynx/core';

describe('withSystemContext', () => {
  it('delegates to database.withSystemContext with the same reason + fn', async () => {
    const withSystemContextSpy = vi.fn(
      async (_reason: string, fn: (ctx: SystemExecutionContext) => Promise<string>) =>
        fn({ reason: 'inner', requestId: 'rid', startedAt: new Date() } as never),
    );
    const database = { withSystemContext: withSystemContextSpy } as never;

    const result = await withSystemContext(database, 'unit-probe', async (ctx) => `seen:${ctx.reason}`);
    expect(result).toBe('seen:inner');
    expect(withSystemContextSpy).toHaveBeenCalledTimes(1);
    expect(withSystemContextSpy.mock.calls[0]?.[0]).toBe('unit-probe');
  });
});
