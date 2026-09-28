import { computeBackoffMs, InvalidCronExpressionError, nextCronRunAt, parseCronExpression } from '../../src/index';

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

  it('keeps the two-argument UTC API and resolves canonical IANA timezones', () => {
    expect(Intl.DateTimeFormat.supportedLocalesOf(['en', 'pt-BR', 'zh-CN'])).toEqual(['en', 'pt-BR', 'zh-CN']);
    expect(nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00Z')).toISOString()).toBe(
      '2026-08-25T09:00:00.000Z',
    );
    expect(
      nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00Z'), 'US/Eastern').toISOString(),
    ).toBe('2026-08-24T13:00:00.000Z');
    expect(() => nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00Z'), '-05:00')).toThrow();
    expect(() => nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00Z'), 'EST')).toThrow();
    expect(() => nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00Z'), 'Mars/Olympus')).toThrow();
    expect(
      new Intl.DateTimeFormat('en', { timeZone: 'America/New_York' }).resolvedOptions().timeZone,
    ).toBe('America/New_York');
    expect(new Intl.DateTimeFormat('en', { timeZone: 'US/Eastern' }).resolvedOptions().timeZone).toBe(
      'America/New_York',
    );
  });

  it('chooses the later New York occurrence at the fall DST fold, including wildcard hours', () => {
    const beforeFold = new Date('2026-11-01T04:59:00.000Z');
    expect(nextCronRunAt('30 1 * * *', beforeFold, 'America/New_York').toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    );
    expect(nextCronRunAt('30 * * * *', beforeFold, 'America/New_York').toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    );
    expect(
      nextCronRunAt('30 1 * * *', new Date('2026-11-01T05:45:00.000Z'), 'America/New_York').toISOString(),
    ).toBe('2026-11-01T06:30:00.000Z');
  });

  it('keeps the ordinary matching minute when no repeated wall minute follows it', () => {
    expect(nextCronRunAt('30 1 * * *', new Date('2026-11-02T05:00:00.000Z'), 'America/New_York').toISOString())
      .toBe('2026-11-02T06:30:00.000Z');
    expect(nextCronRunAt('30 0 * * *', new Date('2026-11-01T04:00:00.000Z'), 'America/New_York').toISOString())
      .toBe('2026-11-01T04:30:00.000Z');
  });

  it('collapses New York spring-gap matches and deduplicates the first valid local minute', () => {
    const after = new Date('2026-03-08T06:59:00.000Z');
    expect(nextCronRunAt('0,30 2 * * *', after, 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
    expect(nextCronRunAt('0 2,3 * * *', after, 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
    expect(nextCronRunAt('30 2,3 * * *', after, 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
    expect(
      nextCronRunAt('0 2 * * *', new Date('2026-03-08T07:00:00.000Z'), 'America/New_York').toISOString(),
    ).toBe('2026-03-09T06:00:00.000Z');
  });

  it('uses the pinned historical São Paulo gap transition', () => {
    expect(
      nextCronRunAt('30 0 * * *', new Date('2018-11-04T02:59:00.000Z'), 'America/Sao_Paulo').toISOString(),
    ).toBe('2018-11-04T03:00:00.000Z');
  });

  describe('sparse cron search stays within its per-call budget', () => {
    it.each(['UTC', 'America/New_York', 'America/Sao_Paulo'])(
      'rejects an impossible recurrence in %s within 500 ms',
      timezone => {
        let error: unknown;
        const startedAt = performance.now();
        try {
          nextCronRunAt('0 0 31 2 *', new Date('2026-01-01T00:00:00Z'), timezone);
        } catch (caught) {
          error = caught;
        }
        const elapsedMs = performance.now() - startedAt;

        expect(error).toBeInstanceOf(InvalidCronExpressionError);
        expect(elapsedMs).toBeLessThanOrEqual(500);
      },
      120_000,
    );

    it.each([
      ['America/Sao_Paulo', '0 0 29 2 *', '2028-03-01T00:00:00Z', '2032-02-29T03:00:00.000Z'],
      ['America/New_York', '0 0 29 2 *', '2028-03-01T00:00:00Z', '2032-02-29T05:00:00.000Z'],
      ['America/Sao_Paulo', '0 0 1 1 *', '2029-01-02T00:00:00Z', '2030-01-01T03:00:00.000Z'],
      ['America/New_York', '0 0 1 1 *', '2029-01-02T00:00:00Z', '2030-01-01T05:00:00.000Z'],
    ])(
      'finds %s sparse recurrence %s within 500 ms',
      (timezone, expression, after, expected) => {
        const startedAt = performance.now();
        const result = nextCronRunAt(expression, new Date(after), timezone);
        const elapsedMs = performance.now() - startedAt;

        expect(result.toISOString()).toBe(expected);
        expect(elapsedMs).toBeLessThanOrEqual(500);
      },
      120_000,
    );
  });

  it('returns strictly increasing UTC occurrences and recomputes against a changed timezone', () => {
    const first = nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00.000Z'), 'America/New_York');
    const second = nextCronRunAt('0 9 * * *', first, 'America/New_York');
    expect(first.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    expect(second.toISOString()).toBe('2026-08-25T13:00:00.000Z');
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    expect(nextCronRunAt('0 9 * * *', new Date('2026-08-24T10:00:00.000Z'), 'Asia/Tokyo').toISOString()).toBe(
      '2026-08-25T00:00:00.000Z',
    );
  });
});
