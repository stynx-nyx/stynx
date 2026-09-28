import type { OutboxDispatcherPort, OutboxRow, OutboxTransportEvidence } from './types';

function evidenceHeaders(headers: Record<string, string>): Record<string, string> {
  const safe = new Set(['content-type', 'x-outbox-event-id', 'x-outbox-idempotency-key']);
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => {
    const lower = name.toLowerCase();
    return [lower, safe.has(lower) ? value : '[redacted]'];
  }));
}

function publicProvider(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return '[invalid-url]';
  }
}

function safeDispatchError(provider: string, status?: number): Error {
  return new Error(status === undefined
    ? `Outbox dispatch to ${provider} failed before an HTTP response`
    : `Outbox dispatch to ${provider} failed with HTTP ${status}`);
}

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
    let provider = '[unavailable]';
    let status: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const url = typeof this.options.url === 'function' ? this.options.url(row) : this.options.url;
      provider = publicProvider(url);
      const headers = typeof this.options.headers === 'function' ? this.options.headers(row) : (this.options.headers ?? {});
      const doFetch = this.options.fetchImpl ?? fetch;
      const controller = new AbortController();
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.options.timeoutMs ?? 10_000);
      const response = await doFetch(url, {
        method: this.options.method ?? 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(row.payload),
        signal: controller.signal,
      });
      status = response.status;
      if (!response.ok) {
        throw safeDispatchError(provider, status);
      }
    } catch {
      // Fetch and caller-provided option errors can contain the full URL or
      // secret text. Never let their message reach an outcome or ledger.
      if (timedOut) throw new Error('Outbox request aborted');
      throw safeDispatchError(provider, status);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async sendEvent(row: OutboxRow): Promise<OutboxTransportEvidence> {
    const evidence: OutboxTransportEvidence = {
      protocol: 'HTTP', requestTransmission: 'constructed-not-confirmed',
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const url = typeof this.options.url === 'function' ? this.options.url(row) : this.options.url;
      evidence.provider = publicProvider(url);
      const headers = typeof this.options.headers === 'function' ? this.options.headers(row) : (this.options.headers ?? {});
      const requestBytes = Buffer.from(JSON.stringify(row.payload),'utf8');
      const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([name,value]) => [name.toLowerCase(),value]));
      const finalHeaders = { 'content-type': 'application/json', ...normalizedHeaders,
        'x-outbox-event-id': row.id, 'x-outbox-idempotency-key': row.idempotencyKey };
      evidence.requestBytes = requestBytes;
      evidence.requestHeaders = evidenceHeaders(finalHeaders);
      const doFetch = this.options.fetchImpl ?? fetch;
      const controller = new AbortController();
      timer = setTimeout(() => { timedOut = true; controller.abort(); },this.options.timeoutMs ?? 10_000);
      const response = await doFetch(url, {
        method: this.options.method ?? 'POST',
        headers: finalHeaders,
        body: requestBytes,
        signal: controller.signal,
      });
      evidence.responseStatus = response.status;
      evidence.requestTransmission = 'response-received';
      evidence.responseBytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw safeDispatchError(evidence.provider, response.status);
      }
      return evidence;
    } catch {
      const failure = timedOut ? new Error('Outbox request aborted')
        : safeDispatchError(evidence.provider ?? '[unavailable]', evidence.responseStatus);
      Object.assign(failure,{ evidence });
      throw failure;
    } finally { if (timer) clearTimeout(timer); }
  }
}
