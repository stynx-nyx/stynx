import { LoggingDedupeService } from '../../src/dedupe';

describe('LoggingDedupeService', () => {
  it('suppresses duplicate errors inside the same window', () => {
    const dedupe = new LoggingDedupeService({ dedupeWindowMs: 60_000 });

    expect(dedupe.register('boom', 'stack')).toEqual({ shouldLog: true });
    expect(dedupe.register('boom', 'stack')).toEqual({ shouldLog: false });
  });

  it('reports the suppressed duplicate count when the window rolls over', () => {
    const originalNow = Date.now;
    let now = 10_000;
    Date.now = () => now;

    try {
      const dedupe = new LoggingDedupeService({ dedupeWindowMs: 1_000 });
      expect(dedupe.register('boom', 'stack')).toEqual({ shouldLog: true });
      expect(dedupe.register('boom', 'stack')).toEqual({ shouldLog: false });
      expect(dedupe.register('boom', 'stack')).toEqual({ shouldLog: false });

      now = 11_001;

      expect(dedupe.register('boom', 'stack')).toEqual({
        shouldLog: true,
        suppressedCount: 2,
      });
    } finally {
      Date.now = originalNow;
    }
  });
});
