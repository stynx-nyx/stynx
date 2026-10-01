import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse, HttpEventType, HttpHeaders } from '@angular/common/http';
import type { HttpEvent } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, makeEnvironmentProviders, signal } from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { UnauthorizedError } from '@stynx-nyx/sdk';
import { Subject } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

export type StynxEventStreamStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'stopped';
export interface StynxEventStreamEvent<T = unknown> { id: string; event: string; data: T }
export interface StynxEventStreamTransport {
  connect(request: { url: string; lastEventId: string | null; context: HttpContext }): Observable<HttpEvent<string>>;
}
export interface StynxEventStreamClock {
  now(): number;
  setTimeout(fn: () => void, delayMs: number): { cancel(): void };
  setInterval(fn: () => void, periodMs: number): { cancel(): void };
}
export interface StynxEventStreamConfig {
  url: string;
  pollingIntervalMs: number;
  sessionActive: Signal<boolean>;
  transport?: StynxEventStreamTransport;
  clock?: StynxEventStreamClock;
  initialMs?: number;
  maxMs?: number;
  retryMode?: 'exponential' | 'fixed';
  failuresBeforePolling?: number;
  failureWindowMs?: number;
  heartbeatMs?: number;
  staleFactor?: number;
  maxConnectionBytes?: number;
  maxConnectionAgeMs?: number;
  types?: readonly string[];
  eventPrefix?: string;
  /** Reopen when a failure enters polling: at once (default) or after the normal retry delay. */
  reopenOnPollingEntry?: 'immediate' | 'backoff';
  /** Comment lines only re-arm staleness (default) or also count as live activity. */
  commentActivity?: 'stale-only' | 'live';
  /** Extra retry delay in milliseconds read from an HTTP error and its JSON-decoded body; the reopen waits for max(backoff, Retry-After, this). */
  retryAfterFrom?: (error: HttpErrorResponse, body: unknown) => number | null;
}
export type StynxEventStreamResyncReason = 'no-content' | 'tenant-change';
export interface StynxEventStreamResync { reason: StynxEventStreamResyncReason }
export interface StynxEventStreamError {
  status: number | null;
  body: unknown;
  error: unknown;
  at: number;
  outcome: 'stopped' | 'retry' | 'polling';
}

export const STYNX_SSE_REQUEST = new HttpContextToken<boolean>(() => false);
const SSE_CONFIG = new InjectionToken<StynxEventStreamConfig>('STYNX_SSE_CONFIG');
const DEDUP_WINDOW = 1_024;

const systemClock: StynxEventStreamClock = {
  now: () => Date.now(),
  setTimeout(fn, delayMs) { const id = setTimeout(fn, delayMs); return { cancel: () => clearTimeout(id) }; },
  setInterval(fn, periodMs) { const id = setInterval(fn, periodMs); return { cancel: () => clearInterval(id) }; },
};

@Injectable()
class HttpStynxEventStreamTransport implements StynxEventStreamTransport {
  private readonly http = inject(HttpClient);
  connect(request: { url: string; lastEventId: string | null; context: HttpContext }): Observable<HttpEvent<string>> {
    const headers = new HttpHeaders(request.lastEventId === null ? { Accept: 'text/event-stream' } : { Accept: 'text/event-stream', 'Last-Event-ID': request.lastEventId });
    return this.http.get(request.url, {
      headers, context: request.context.set(STYNX_SSE_REQUEST, true),
      observe: 'events', reportProgress: true, responseType: 'text',
    });
  }
}

function decodedBody(error: unknown): unknown {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body) as unknown; }
  catch { /* Non-JSON text is kept as received. */ return body; }
}

function positive(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${name} must be finite and positive`);
}

export function provideStynxEventStream(config: StynxEventStreamConfig): EnvironmentProviders {
  if (!config.sessionActive || typeof config.sessionActive !== 'function') throw new Error('sessionActive is required');
  if (!config.url) throw new Error('url is required');
  for (const name of ['pollingIntervalMs', 'initialMs', 'maxMs', 'failuresBeforePolling', 'failureWindowMs', 'heartbeatMs', 'staleFactor', 'maxConnectionBytes', 'maxConnectionAgeMs'] as const) positive(config[name], name);
  if (config.pollingIntervalMs === undefined) throw new Error('pollingIntervalMs is required');
  return makeEnvironmentProviders([
    { provide: SSE_CONFIG, useValue: config },
    HttpStynxEventStreamTransport,
    StynxEventStreamService,
  ]);
}

/** Incremental SSE parser. Its input is the new suffix of the cumulative XHR text. */
class FrameParser {
  private buffer = '';
  private data: string[] = [];
  private id = '';
  private event = 'message';
  constructor(private readonly onFrame: (id: string, event: string, data: string) => void,
    private readonly onActivity: () => void, private readonly onComment: () => void) {}
  feed(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf('\n');
      if (index < 0) return;
      let line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.onActivity();
      if (line === '') {
        if (this.data.length) this.onFrame(this.id, this.event, this.data.join('\n'));
        this.data = []; this.id = ''; this.event = 'message';
        continue;
      }
      if (line.startsWith(':')) { this.onComment(); continue; }
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') this.data.push(value);
      else if (field === 'event') this.event = value;
      else if (field === 'id' && !value.includes('\0')) this.id = value;
    }
  }
}

@Injectable()
export class StynxEventStreamService<T = unknown> {
  private readonly config = inject(SSE_CONFIG);
  private readonly clock = this.config.clock ?? systemClock;
  private readonly transport = this.config.transport ?? inject(HttpStynxEventStreamTransport);
  private readonly tenant = inject(TenantContextService, { optional: true });
  private readonly statusState = signal<StynxEventStreamStatus>('idle');
  private readonly cursorState = signal<string | null>(null);
  private readonly eventSubject = new Subject<StynxEventStreamEvent<T>>();
  private readonly tickSubject = new Subject<void>();
  private readonly resyncSubject = new Subject<StynxEventStreamResync>();
  private readonly errorState = signal<StynxEventStreamError | null>(null);
  readonly status = this.statusState.asReadonly();
  readonly polling: Signal<boolean> = computed(() => this.statusState() === 'polling');
  readonly lastEventId = this.cursorState.asReadonly();
  readonly events$ = this.eventSubject.asObservable();
  readonly tick$ = this.tickSubject.asObservable();
  /** Emits once each time a held cursor is discarded, before the matching reopen. */
  readonly resync$: Observable<StynxEventStreamResync> = this.resyncSubject.asObservable();
  /** Most recent transport error; cleared by start, tenant change and live delivery. */
  readonly lastError: Signal<StynxEventStreamError | null> = this.errorState.asReadonly();
  private connection: Subscription | undefined;
  private retryTimer: { cancel(): void } | undefined;
  private staleTimer: { cancel(): void } | undefined;
  private ageTimer: { cancel(): void } | undefined;
  private pollingTimer: { cancel(): void } | undefined;
  private tenantSubscription: Subscription | undefined;
  private active = false;
  private generation = 0;
  private offset = 0;
  private receivedBytes = 0;
  private pendingHighSurrogate = '';
  private readonly textEncoder = new TextEncoder();
  private seen = new Set<string>();
  private failures: number[] = [];
  private consecutiveFailures = 0;
  private currentTenant: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    effect(() => {
      if (!this.config.sessionActive() && this.active) this.stop();
    });
  }

  start(): void {
    if (this.active) return;
    if (!this.config.sessionActive()) { this.statusState.set('stopped'); return; }
    this.active = true;
    this.errorState.set(null);
    this.currentTenant = this.tenant?.tenantId() ?? null;
    this.tenantSubscription = this.tenant?.tenantChanged$.subscribe(() => {
      const next = this.tenant?.tenantId() ?? null;
      if (next === this.currentTenant) return;
      this.currentTenant = next;
      const hadCursor = this.cursorState() !== null;
      this.cursorState.set(null); this.seen.clear(); this.failures = []; this.consecutiveFailures = 0;
      this.errorState.set(null);
      this.cancelConnection(); this.clearTimers();
      const generation = this.generation;
      if (hadCursor) this.resyncSubject.next({ reason: 'tenant-change' });
      if (generation !== this.generation) return;
      if (next && this.active) this.open();
      else this.statusState.set('idle');
    });
    if (this.currentTenant || !this.tenant) this.open();
  }

  stop(): void {
    this.active = false;
    this.cancelConnection(); this.clearTimers();
    this.tenantSubscription?.unsubscribe(); this.tenantSubscription = undefined;
    this.statusState.set('stopped');
  }

  private cancelConnection(): void {
    ++this.generation;
    this.connection?.unsubscribe(); this.connection = undefined;
    this.staleTimer?.cancel(); this.staleTimer = undefined;
    this.ageTimer?.cancel(); this.ageTimer = undefined;
  }

  private clearTimers(): void {
    this.retryTimer?.cancel(); this.retryTimer = undefined;
    this.pollingTimer?.cancel(); this.pollingTimer = undefined;
  }

  private open(): void {
    if (!this.active || !this.config.sessionActive()) { this.stop(); return; }
    if (this.tenant && !this.tenant.tenantId()) { this.statusState.set('idle'); return; }
    this.cancelConnection();
    const generation = this.generation;
    this.offset = 0;
    this.receivedBytes = 0;
    this.pendingHighSurrogate = '';
    let cursorAdvanced = false;
    const parser = new FrameParser((id, event, data) => {
      if (generation !== this.generation || !this.active) return;
      if (this.deliver(id, event, data)) cursorAdvanced = true;
    }, () => {
      if (generation === this.generation && this.active) this.armStale(generation);
    }, () => {
      if (generation === this.generation && this.active && this.config.commentActivity === 'live') this.alive();
    });
    const request = { url: this.config.url, lastEventId: this.cursorState(), context: new HttpContext().set(STYNX_SSE_REQUEST, true) };
    this.statusState.set(this.pollingTimer ? 'polling' : this.consecutiveFailures ? 'reconnecting' : 'live');
    this.armStale(generation);
    this.ageTimer = this.clock.setTimeout(() => this.reopenPlanned(generation), this.config.maxConnectionAgeMs ?? 1_800_000);
    this.connection = this.transport.connect(request).subscribe({
      next: (event) => {
        if (generation !== this.generation) return;
        if (event.type === HttpEventType.DownloadProgress && typeof event.partialText === 'string') {
          const text = event.partialText;
          if (text.length < this.offset) this.offset = 0;
          const suffix = text.slice(this.offset);
          this.offset = text.length;
          let complete = this.pendingHighSurrogate + suffix;
          this.pendingHighSurrogate = '';
          const lastCode = complete.charCodeAt(complete.length - 1);
          if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
            this.pendingHighSurrogate = complete.slice(-1);
            complete = complete.slice(0, -1);
          }
          this.receivedBytes += this.textEncoder.encode(complete).length;
          parser.feed(suffix);
          if (generation !== this.generation || !this.active) return;
          if (this.receivedBytes >= (this.config.maxConnectionBytes ?? 1_048_576)) {
            if (cursorAdvanced) this.reopenPlanned(generation);
            else this.failed(generation);
            return;
          }
        } else if (event.type === HttpEventType.Response) {
          if (event.status === 204) {
            const hadCursor = this.cursorState() !== null;
            this.cursorState.set(null); this.seen.clear();
            if (hadCursor) this.resyncSubject.next({ reason: 'no-content' });
          }
          this.failed(generation, undefined, event.status === 204);
        }
      },
      error: (error: unknown) => this.failed(generation, error),
      complete: () => this.failed(generation),
    });
  }

  private deliver(id: string, event: string, data: string): boolean {
    if (!id || this.seen.has(id)) return false;
    let parsed: T;
    try { parsed = JSON.parse(data) as T; }
    catch { /* Invalid JSON is ignored. */ return false; }
    const prefix = this.config.eventPrefix;
    const name = prefix ? event.slice(prefix.length) : event;
    this.cursorState.set(id);
    this.seen.add(id);
    if (this.seen.size > DEDUP_WINDOW) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.alive();
    if ((!prefix || event.startsWith(prefix)) && (!this.config.types || this.config.types.includes(name))) {
      this.eventSubject.next({ id, event: name, data: parsed });
    }
    return true;
  }

  private alive(): void {
    this.failures = []; this.consecutiveFailures = 0;
    this.clearTimers();
    this.statusState.set('live');
    this.errorState.set(null);
  }

  private armStale(generation: number): void {
    this.staleTimer?.cancel();
    this.staleTimer = this.clock.setTimeout(() => this.failed(generation),
      (this.config.heartbeatMs ?? 20_000) * (this.config.staleFactor ?? 2));
  }

  private reopenPlanned(generation: number): void {
    if (generation !== this.generation || !this.active) return;
    this.cancelConnection();
    this.open();
  }

  private failed(generation: number, error?: unknown, freshCursor = false): void {
    if (generation !== this.generation || !this.active) return;
    this.cancelConnection();
    if (!this.config.sessionActive()
      || (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403))
      || error instanceof UnauthorizedError) { this.record(error, 'stopped'); this.stop(); return; }
    if (!freshCursor) {
      const now = this.clock.now();
      this.failures = this.failures.filter((time) => now - time <= (this.config.failureWindowMs ?? 60_000));
      this.failures.push(now); this.consecutiveFailures++;
    }
    const wasPolling = this.statusState() === 'polling';
    const polling = this.failures.length >= (this.config.failuresBeforePolling ?? 2);
    this.statusState.set(polling ? 'polling' : 'reconnecting');
    this.record(error, polling ? 'polling' : 'retry');
    if (polling && !this.pollingTimer) this.pollingTimer = this.clock.setInterval(() => {
      if (!this.config.sessionActive()) { this.stop(); return; }
      this.tickSubject.next();
    }, this.config.pollingIntervalMs);
    const header = error instanceof HttpErrorResponse ? error.headers.get('Retry-After') : null;
    const seconds = header ? Number(header) : NaN;
    const date = header ? Date.parse(header) : NaN;
    const fromHeader = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1_000)
      : Number.isFinite(date) ? Math.max(0, date - this.clock.now()) : 0;
    const retryAfter = Math.max(fromHeader, error instanceof HttpErrorResponse ? this.extractedDelay(error) : 0);
    if (polling && !wasPolling && !freshCursor && retryAfter === 0 && this.config.reopenOnPollingEntry !== 'backoff') {
      // Polling starts its first recovery attempt immediately unless the server asked for a delay; later attempts use backoff.
      this.open();
      return;
    }
    const base = this.config.initialMs ?? 1_000;
    const backoff = this.config.retryMode === 'fixed' ? base : Math.min(this.config.maxMs ?? 30_000, base * 2 ** Math.max(0, Math.min(this.consecutiveFailures - 1, 30)));
    this.retryTimer = this.clock.setTimeout(() => { this.retryTimer = undefined; this.open(); }, Math.max(backoff, retryAfter));
  }

  private extractedDelay(error: HttpErrorResponse): number {
    let delay: number | null | undefined;
    try { delay = this.config.retryAfterFrom?.(error, decodedBody(error)); }
    catch { /* A throwing extractor contributes no delay. */ }
    return typeof delay === 'number' && Number.isFinite(delay) ? Math.max(0, delay) : 0;
  }

  private record(error: unknown, outcome: StynxEventStreamError['outcome']): void {
    if (error === undefined) return;
    const status = error instanceof HttpErrorResponse ? error.status : null;
    this.errorState.set({ status, body: decodedBody(error), error, at: this.clock.now(), outcome });
  }
}
