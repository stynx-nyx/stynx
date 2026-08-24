import type { OutboxMetricsSink } from './types';

/** Default `OutboxMetricsSink` — in-process counters, useful for tests and `stynx doctor`-style introspection. */
export class InMemoryOutboxMetrics implements OutboxMetricsSink {
  private enqueued = new Map<string, number>();
  private dispatched = new Map<string, number>();
  private acked = new Map<string, number>();

  incrementEnqueued(entity: string): void {
    this.enqueued.set(entity, (this.enqueued.get(entity) ?? 0) + 1);
  }

  incrementDispatched(entity: string, outcome: 'sent' | 'error'): void {
    const key = `${entity}:${outcome}`;
    this.dispatched.set(key, (this.dispatched.get(key) ?? 0) + 1);
  }

  incrementAcked(entity: string, outcome: 'acked' | 'error'): void {
    const key = `${entity}:${outcome}`;
    this.acked.set(key, (this.acked.get(key) ?? 0) + 1);
  }

  snapshot(): {
    enqueued: Record<string, number>;
    dispatched: Record<string, number>;
    acked: Record<string, number>;
  } {
    return {
      enqueued: Object.fromEntries(this.enqueued),
      dispatched: Object.fromEntries(this.dispatched),
      acked: Object.fromEntries(this.acked),
    };
  }
}
