import type { IdempotencyMetricsSink } from './types';

export class InMemoryIdempotencyMetrics implements IdempotencyMetricsSink {
  private replayCount = 0;

  incrementReplay(): void {
    this.replayCount += 1;
  }

  snapshot(): { replayCount: number } {
    return { replayCount: this.replayCount };
  }
}
