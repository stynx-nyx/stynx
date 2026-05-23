import { InMemoryRateLimitMetrics } from '../../src/metrics';

describe('InMemoryRateLimitMetrics', () => {
  it('tracks blocked counters, latency percentiles, and histogram buckets', () => {
    const metrics = new InMemoryRateLimitMetrics();
    for (let value = 1; value <= 10; value += 1) {
      metrics.recordLatency('api:write', value);
    }
    metrics.incrementBlocked('api:write');

    expect(metrics.snapshot()).toEqual({ 'api:write': 1 });
    expect(metrics.latencyPercentile('api:write', 50)).toBe(5);
    expect(metrics.latencyPercentile('api:write', 95)).toBe(10);
    expect(metrics.latencyPercentile('api:write', 99)).toBe(10);
    expect(metrics.latencyPercentile('api:read', 50)).toBe(undefined);
    expect(metrics.histogramSnapshot([5, 10])['api:read']).toBe(undefined);
    expect(metrics.histogramSnapshot([5, 10])['api:write']).toEqual({
      le_5: 5,
      le_10: 10,
      count: 10,
    });
  });

  it('sorts latency samples before selecting percentile buckets', () => {
    const metrics = new InMemoryRateLimitMetrics();
    metrics.recordLatency('api:read', 100);
    metrics.recordLatency('api:read', 1);
    metrics.recordLatency('api:read', 50);

    expect(metrics.latencyPercentile('api:read', 50)).toBe(50);
    expect(metrics.latencyPercentile('api:read', 95)).toBe(100);
    expect(metrics.histogramSnapshot([1, 50, 100])['api:read']).toEqual({
      le_1: 1,
      le_50: 2,
      le_100: 3,
      count: 3,
    });
  });
});
