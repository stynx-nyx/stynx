import { computeBackoffMs, nextCronRunAt, parseCronExpression } from '../../src/index';

describe('cron and retry primitives', () => {
  it('calculates UTC cron occurrences and cron DOM/DOW OR semantics', () => {
    expect(nextCronRunAt('*/15 * * * *', new Date('2026-08-24T10:01:20Z')).toISOString()).toBe('2026-08-24T10:15:00.000Z');
    expect(nextCronRunAt('0 9 25 * 1', new Date('2026-08-24T10:00:00Z')).toISOString()).toBe('2026-08-25T09:00:00.000Z');
    expect(() => parseCronExpression('* * *')).toThrow('Invalid cron');
    expect(() => parseCronExpression('60 * * * *')).toThrow('Invalid cron');
  });
  it('uses bounded full jitter', () => {
    expect(computeBackoffMs({ baseMs: 100, maxMs: 500, multiplier: 2 }, 3, () => 1)).toBe(401);
    expect(computeBackoffMs({ baseMs: 100, maxMs: 500, multiplier: 2 }, 10, () => 0)).toBe(0);
  });
});
