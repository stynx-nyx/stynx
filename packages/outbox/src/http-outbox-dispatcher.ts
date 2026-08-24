import type { OutboxDispatcherPort, OutboxRow } from './types';

export interface HttpOutboxDispatcherOptions {
  /** Absolute URL, or a function deriving one per row (e.g. by `entity`). */
  url: string | ((row: OutboxRow) => string);
  /** Static headers, or a function deriving them per row (e.g. a computed HMAC signature). */
  headers?: Record<string, string> | ((row: OutboxRow) => Record<string, string>);
  method?: 'POST' | 'PUT';
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Minimal HTTP implementation of `OutboxDispatcherPort` — the "HTTP now"
 * half of the pluggable dispatcher port. POSTs (or PUTs) the row's `payload`
 * as JSON and treats any non-2xx response, network error, or timeout as a
 * failure (`dispatchDue()` then reverts the row to `ERROR` and schedules a
 * retry through the backoff policy).
 *
 * This is intentionally thin — no retry/circuit-breaker logic lives here,
 * since `dispatchDue()` already owns retry scheduling. An app that wants
 * per-call resilience (timeouts aside) should wrap `fetchImpl` with
 * `@stynx-nyx/integration-adapter`. The EventBridge half of this port is
 * deferred to a future package; only the `OutboxDispatcherPort` interface
 * is shipped for it to implement against.
 */
export class HttpOutboxDispatcher implements OutboxDispatcherPort {
  constructor(private readonly options: HttpOutboxDispatcherOptions) {}

  async send(row: OutboxRow): Promise<void> {
    const url = typeof this.options.url === 'function' ? this.options.url(row) : this.options.url;
    const headers = typeof this.options.headers === 'function' ? this.options.headers(row) : (this.options.headers ?? {});
    const doFetch = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, {
        method: this.options.method ?? 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(row.payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Outbox dispatch to ${url} failed with HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
