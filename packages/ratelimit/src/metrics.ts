import type { RateLimitMetricsSink } from './types';

const DEFAULT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export class InMemoryRateLimitMetrics implements RateLimitMetricsSink {
  private readonly blocked = new Map<string, number>();
  private readonly latencies = new Map<string, number[]>();

  incrementBlocked(scope: string): void {
    this.blocked.set(scope, (this.blocked.get(scope) ?? 0) + 1);
  }

  recordLatency(scope: string, elapsedMs: number): void {
    const list = this.latencies.get(scope) ?? [];
    list.push(elapsedMs);
    this.latencies.set(scope, list);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.blocked.entries());
  }

  latencyPercentile(scope: string, pct: 50 | 95 | 99): number | undefined {
    const list = this.latencies.get(scope);
    if (!list || list.length === 0) {
      return undefined;
    }
    const sorted = [...list].sort((a, b) => a - b);
    const index = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  histogramSnapshot(
    buckets: number[] = DEFAULT_BUCKETS_MS,
  ): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [scope, list] of this.latencies.entries()) {
      const counts: Record<string, number> = {};
      for (const bucket of buckets) {
        counts[`le_${bucket}`] = list.filter((value) => value <= bucket).length;
      }
      counts.count = list.length;
      result[scope] = counts;
    }
    return result;
  }
}
