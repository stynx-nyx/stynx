import type { RateLimitMetricsSink } from './types';

export class InMemoryRateLimitMetrics implements RateLimitMetricsSink {
  private readonly blocked = new Map<string, number>();

  incrementBlocked(scope: string): void {
    this.blocked.set(scope, (this.blocked.get(scope) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.blocked.entries());
  }
}
