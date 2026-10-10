---
title: SSE backend and Angular client, 1.5.0
sidebar_position: 1
---

# SSE contract for STYNX 1.5.0

**Authority:** Architect, CTG-0002. **Source:** DETRAN C-0002 rev. 2, §4, §7 and §8, with Owner decision OD-S15-01. Every `UPS-SSE-01…10`, `UPS-NGSSE-01…10`, and `UPS-TEST-01` is required for the 1.5.0 release, including items originally marked SHOULD. The symbol names below are the STYNX contract to implement and measure. The DETRAN table of conformity must eventually name the symbols and tests actually published; this document does not claim they already ship.

## Backend public API (`@stynx-nyx/backend`)

The root package barrel exports `StynxEventStreamService`, `StynxEventStreamModule`, `STYNX_SSE_CONTEXT_RUNNER`, `STYNX_SSE_SCHEDULER`, `STYNX_SSE_METRICS`, and the public types in this section. No new package subpath is required. The service is injectable and works in an ordinary Nest `@Get` handler with manual response control; a consumer need not use `@Sse`.

```ts
export interface StynxSseScope {
  tenantId: string;
  actorId: string;
  sessionId?: string;
}

export interface EventStreamContextRunner {
  withRequestContext<T>(scope: StynxSseScope, fn: () => Promise<T>): Promise<T>;
}

export interface EventStreamCursor {
  createdAt: Date;
  id: string;
}

export interface EventStreamRow {
  id: string;
  createdAt: Date;
  event: string;
}

export interface EventStreamSource<
  TRow extends EventStreamRow,
  TScope extends StynxSseScope = StynxSseScope,
> {
  now(scope: TScope): Promise<Date>; // database clock, never Date.now() in the service
  findById(id: string, scope: TScope): Promise<TRow | null>;
  listSince(cursor: EventStreamCursor, scope: TScope, limit: number): Promise<readonly TRow[]>;
}

export interface EventStreamScheduler {
  every(periodMs: number, tick: () => void): { cancel(): void };
}

export interface EventStreamMetricsSink {
  opened(scope: StynxSseScope): void;
  frame(scope: StynxSseScope): void;
  dropped(scope: StynxSseScope, id: string): void;
  closed(scope: StynxSseScope): void;
}

export interface StynxSseRequest {
  headers: Record<string, string | readonly string[] | undefined>;
  on(event: 'close', listener: () => void): unknown;
}

export interface StynxSseResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  on(event: 'close', listener: () => void): unknown;
  flushHeaders?(): void;
  flush?(): void;
}

export interface StynxEventStreamOptions<
  TRow extends EventStreamRow,
  TScope extends StynxSseScope = StynxSseScope,
  TPayload = unknown,
> {
  scope: TScope;
  filter?: (row: TRow, scope: TScope) => boolean | Promise<boolean>;
  project: (row: TRow, scope: TScope) => TPayload | Promise<TPayload>;
  heartbeatMs?: number; // default 20_000
  replayWindowMs?: number; // default 86_400_000 (24 hours)
  tickMs?: number; // positive, configured by the consuming route
  batchSize?: number; // positive, configured by the consuming route
  retryMs?: number; // optional SSE retry field at opening
  maxConnectionsPerActor?: number;
  retryAfterSeconds?: number; // for a rejected connection
  maxPayloadBytes?: number; // maximum UTF-8 JSON payload in one data frame
}

export class StynxEventStreamService {
  open<TRow extends EventStreamRow, TScope extends StynxSseScope, TPayload>(
    request: StynxSseRequest,
    response: StynxSseResponse,
    source: EventStreamSource<TRow, TScope>,
    options: StynxEventStreamOptions<TRow, TScope, TPayload>,
  ): Promise<void>;
  counters(): Readonly<{
    active: number;
    opened: number;
    frames: number;
    drops: number;
    closed: number;
  }>;
}

export class StynxEventStreamModule {
  static forRoot(options: {
    contextRunner: EventStreamContextRunner;
    scheduler?: EventStreamScheduler;
    metrics?: EventStreamMetricsSink;
  }): DynamicModule;
}
```

`StynxSseRequest` and `StynxSseResponse` are minimal structural HTTP interfaces. They accept Express-compatible request and response objects without introducing Express as a runtime dependency of `@stynx-nyx/backend`. An application supplies the `@stynx-nyx/data` `Database` instance as `contextRunner`: its concrete `withRequestContext({ tenantId, actorId, sessionId? }, fn)` matches the port structurally. The abstract `Database` in `@stynx-nyx/core` only exposes `withSystemContext` and must not be typed as this port. The service does not call `withSystemContext`, retain a transaction/client for the lifetime of a connection, or depend on a timer's inherited async local storage.

`TScope` may add policy filters used by a source's SQL; the service passes the same captured, immutable scope to `now`, `findById`, `listSince`, `filter`, and `project`. It calls **every** source operation inside a fresh `contextRunner.withRequestContext(scope, ...)`, including opening and each later tick. The source does not widen visibility based on an event ID. `listSince` returns rows ordered by `(createdAt ASC, id ASC)` and selects strictly after the cursor; equal timestamps are ordered by ID. A source may use its own SQL predicate for policy scope, but tenant isolation must still be enforced by RLS. A conforming source must provide commit-monotonic visibility for this strict cursor: once the opening `now` or a delivered row advances the cursor, a row must not first become visible later with `(createdAt, id)` at or before that cursor. Assigning `createdAt` before a transaction commits, without a commit-order guarantee or stable visibility watermark, can permanently skip a late-committing row and cannot support the at-least-once claim.

The module creates a default scheduler with `setInterval` only in its factory. The injected scheduler controls both heartbeat and source ticks in tests. `tickMs`, `batchSize`, limits and time values must be validated as finite positive values; `maxConnectionsPerActor` is optional. The service always maintains inspectable counters, and also calls the injected metrics sink when supplied. Absence of a sink does not make counters disappear. A sink failure cannot bypass scope checks or expose an event.

### HTTP opening, replay and frames

Preflight is ordered: (1) validate the captured `tenantId` and `actorId`; (2) reserve the optional `(tenantId, actorId)` connection slot or reject it; (3) resolve `Last-Event-ID` under the scoped source and decide replay/204; (4) set/flush stream headers and write `: connected\n\n`. Missing tenant yields HTTP 400 `SSE_TENANT_REQUIRED`; missing actor yields HTTP 401 `SSE_ACTOR_REQUIRED`. Both occur before any source call or stream header. A full slot yields HTTP 429 with `Retry-After` in seconds. Rejection releases any reserved slot and starts no timer.

For a visible event ID, `findById` supplies `(createdAt, id)`. If its age against `source.now(scope)` is within the replay window, streaming resumes **after** that cursor. If visible but older than the window, return HTTP 204 with no body, stream headers, or timer. If `findById` returns null, including an ID belonging only to another tenant, begin at `source.now(scope)` from the database, not the client clock. The source's clock read is also scoped. No tenant information is disclosed by distinguishing a foreign ID from an unknown one. An absent header starts at the database clock as well. Reject malformed/header-injected IDs before writing stream headers.

Successful opening sends `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, and `X-Accel-Buffering: no`; call `flushHeaders()` where supported, then immediately write and flush `: connected\n\n`. Optional `retryMs` adds `retry: <milliseconds>\n\n` at opening. A delivered frame is `id: <id>\nevent: <event>\ndata: <single-line JSON>\n\n`; the ID and event name must not inject CR/LF. Heartbeat is `: heartbeat\n\n` every 20 seconds by default. Oversize projected JSON is not partially written: emit `: dropped <id>\n\n`, increment the drop counter, and continue past that row. Filtering precedes projection and writing. The consumer may deliberately pass policy constraints through `TScope` to SQL. A route must use manual `@Res()` handling without Nest response mapping, buffering, or serialization interceptors that delay frames; a real Nest HTTP test must see the first frame before the response closes.

Ticks are serialized: no concurrent `listSince` calls or duplicate cursor advancement. A tick read error is reported safely and the connection remains open for the next tick. Advance the cursor only after a row is handled by delivery, filter or drop so it is never skipped by a failed source read. Closing either request or response cancels both schedules, releases the connection slot exactly once, emits a close metric, and prevents later writes. Delivery is at least once for a conforming source; a reconnect may repeat IDs. The client deduplicates by ID. Source ordering, commit-monotonic visibility, strict cursor comparison, and the 24-hour default replay window are part of the wire contract. The current `@stynx-nyx/outbox` upserts on `(tenant_id, entity, entity_id)` and is **not** an append-only replay source. CTG-0002 ships the source port only. A future UPS-OBX decision/adenda must choose and validate an append-only, RLS-scoped replay source, its commit-order cursor/visibility strategy and retention before publishing a default outbox adapter. Without that decision, an adapter built on the current upsert table risks losing events and cannot claim at-least-once replay.

## Angular public API (`@stynx-nyx/angular`)

The primary entry exports `provideStynxEventStream`, `StynxEventStreamService`, `STYNX_SSE_REQUEST`, `StynxEventStreamTransport`, `StynxEventStreamClock`, `StynxEventStreamConfig`, `StynxEventStreamEvent`, and `StynxEventStreamStatus`. `STYNX_SSE_REQUEST` is an `HttpContextToken<boolean>` defaulting to `false`. The built-in transport sets it to `true` on each stream request. The service uses Angular `HttpClient` with `observe: 'events'`, `reportProgress: true`, and `responseType: 'text'`; native `EventSource` is forbidden.

```ts
export type StynxEventStreamStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'stopped';
export interface StynxEventStreamEvent<T = unknown> {
  id: string;
  event: string;
  data: T;
}
export interface StynxEventStreamTransport {
  connect(request: {
    url: string;
    lastEventId: string | null;
    context: HttpContext;
  }): Observable<HttpEvent<string>>;
}
export interface StynxEventStreamClock {
  now(): number;
  setTimeout(fn: () => void, delayMs: number): { cancel(): void };
  setInterval(fn: () => void, periodMs: number): { cancel(): void };
}
export interface StynxEventStreamConfig {
  url: string;
  pollingIntervalMs: number; // required for every application
  sessionActive: Signal<boolean>; // required, supplied by the application
  transport?: StynxEventStreamTransport;
  clock?: StynxEventStreamClock;
  initialMs?: number; // default 1_000
  maxMs?: number; // default 30_000
  retryMode?: 'exponential' | 'fixed';
  failuresBeforePolling?: number; // default 2
  failureWindowMs?: number; // default 60_000
  heartbeatMs?: number; // default 20_000
  staleFactor?: number; // default 2
  maxConnectionBytes?: number; // configurable, default 1 MiB
  maxConnectionAgeMs?: number; // configurable, default 30 minutes
  types?: readonly string[];
  eventPrefix?: string;
}
export function provideStynxEventStream(config: StynxEventStreamConfig): EnvironmentProviders;
export class StynxEventStreamService<T = unknown> {
  readonly status: Signal<StynxEventStreamStatus>;
  readonly polling: Signal<boolean>;
  readonly lastEventId: Signal<string | null>;
  readonly events$: Observable<StynxEventStreamEvent<T>>;
  readonly tick$: Observable<void>;
  start(): void;
  stop(): void;
}
```

`provideStynxEventStream` requires a positive `pollingIntervalMs` and `sessionActive` at configuration time. Its `HttpClient`/interceptor prerequisite is `provideStynxDefaults({ angular: { apiBaseUrl, sessionMode: 'bearer', authProvider } })` (or equivalent `provideStynxAngular` plus tenancy). Calling `provideStynxDefaults({})` alone does not install `HttpClient` or the bearer, tenant and request-ID interceptors. The existing tenant source is `TenantContextService.tenantId()` and `tenantChanged$` from `@stynx-nyx/angular-tenancy`. `TenantInterceptor` supplies `X-Tenant-Id`; `RequestIdInterceptor` supplies `X-Request-Id`. The configured auth provider supplies `Authorization: Bearer …`. The service never synthesizes a tenant header from untrusted event data.

The application binds session activity explicitly. For example, its composition root creates a bridge signal and its own injectable service keeps it synchronized with `StynxSessionService.active`:

```ts
const appSessionActive = signal(false);
// In an application-owned injectable bridge, created by DI:
const session = inject(StynxSessionService); // @stynx-nyx/angular-auth
effect(() => appSessionActive.set(session.active()));
// In application providers, with the same bridge signal:
provideStynxEventStream({
  url: '/api/stream',
  pollingIntervalMs: 15_000,
  sessionActive: appSessionActive.asReadonly(),
});
```

The `inject`/`effect` lines run only inside that application's injection context, never at module top level. An application may pass `session.active` directly when it constructs the event-stream providers within a valid injection context. `StynxSessionService.active` is the existing `Signal<boolean>`; its `active$` is an observable of session **state**, not a boolean logout event. A transition of `sessionActive()` to `false` closes the transport and sets `stopped`. `@stynx-nyx/angular` does not import `angular-auth`, because that package already depends on `angular`. The required `sessionActive` option is the documented signature deviation for UPS-NGSSE-08.

`ErrorInterceptor` checks `STYNX_SSE_REQUEST` before mapping an SSE `HttpErrorResponse`. For these requests it suppresses `ErrorBannerService` and rethrows the original response, preserving status and `Retry-After`. The existing `AuthInterceptor` gets its normal single refresh attempt on 401; the cloned replay retains the `HttpContext` token. A terminal 401 after refresh, or 403, enters `stopped`; a 401 that refreshes successfully does not. Tests must exercise the actual interceptor chain, including the replay and the no-banner behavior. A 429 delays retry by `max(backoff, Retry-After)`; `Retry-After` supports HTTP seconds and date forms. Status 0 and 5xx count as failures.

### Parser and lifecycle

The parser consumes arbitrary text chunks, CRLF or LF, comments, and multiline `data:` values (joined with LF). Only complete blank-line-terminated frames are emitted. A `DownloadProgress` event's `partialText` is **cumulative** under XHR: keep an offset for that connection and parse only `partialText.slice(offset)`. Reset the offset and parser on reconnect. Heartbeats/comments count as activity for staleness, but are not emitted on `events$`. The `data:` value is parsed as JSON; the transport never turns a payload field into display text. A complete frame with a nonempty new ID and valid JSON advances `Last-Event-ID` and enters bounded deduplication history, even when client `types` or `eventPrefix` suppress emission. Apply those filters only to `events$`; invalid JSON, absent IDs and duplicate IDs do not emit or advance the cursor. A tenant switch clears deduplication history and `lastEventId`.

The status path is `idle → live → reconnecting → polling → live`, with `stopped` on explicit stop, logout, terminal authorization, or teardown. Each open sets the status it opens with at once; with `openStatus: 'first-line'` (UPS-NGSSE-13, below) that status waits for the first line of the connection, so a start shows `idle` and a reopen shows the previous status until then. `polling()` reflects only the polling state. Backoff defaults to exponential 1–30 seconds; `retryMode: 'fixed'` uses the configured fixed compass. Two failed opens/ticks within 60 seconds enter polling by default. `tick$` emits each configured polling interval; the service periodically retries the stream while polling. The first complete frame after re-opening with a nonempty new ID and valid JSON, including one filtered only from emission, returns to `live` and clears failure/backoff counters. A 204 discards `Last-Event-ID` and reopens from a fresh cursor; it does not enter `stopped`. On any frame silence for `heartbeatMs × staleFactor` (40 seconds by default), close and reconnect. A tenant change cancels the old request, clears cursor/dedup, and opens for the new tenant; a null tenant does not start a scoped stream. On `sessionActive()` becoming false, cancel transport and all timers and enter `stopped`. If a subscriber synchronously stops the stream or changes tenant while a progress chunk is being parsed, all remaining frames and activity callbacks from that old generation are ignored. They may neither restore `live` nor change the new tenant's cursor or timers.

`maxConnectionBytes` and `maxConnectionAgeMs` are finite positive ceilings. When either is reached, cancel and reopen with the most recent `Last-Event-ID`; this prevents unbounded cumulative `partialText` growth. The byte ceiling counts received UTF-8 text, not just emitted payload. Parse the complete frames in the received `DownloadProgress` suffix before evaluating that suffix against the byte ceiling; a valid frame in the crossing suffix counts as cursor progress. Reaching the byte ceiling before any valid cursor advance on that connection is a failed stream attempt: apply backoff and the configured failure threshold, then enter polling if failures continue. This prevents a large first frame from causing an immediate reconnect loop with the same cursor. A ceiling reached after cursor progress, or the age ceiling, is a planned reconnect and does not itself count as a failure. The cursor survives a same-tenant reconnect and is cleared by 204 or tenant change. Applications should set backend `maxPayloadBytes` sufficiently below client `maxConnectionBytes` to leave room for SSE framing and comments; the client ceiling applies to all received stream text.

### 1.5.x opt-in client options (UPS-NGSSE-11, 13, 14, 15)

**Source:** stynx-nyx/stynx#321 (DETRAN C-0002, R-0022, CTG-0005). These additions are additive within 1.5.x. Each new option is set per `provideStynxEventStream` injector. When it is omitted, the client keeps the 1.5.0 behavior described above. UPS-NGSSE-12, server close as end of stream, has its own subsection below: without `serverClose`, a 200 that ends the body still counts as a failure and keeps the cursor.

```ts
export interface StynxEventStreamConfig {
  // ...1.5.0 fields above...
  reopenOnPollingEntry?: 'immediate' | 'backoff'; // default 'immediate'
  commentActivity?: 'stale-only' | 'live'; // default 'stale-only'
  openStatus?: 'immediate' | 'first-line'; // default 'immediate'
  retryAfterFrom?: (error: HttpErrorResponse, body: unknown) => number | null; // milliseconds
}
export type StynxEventStreamResyncReason = 'no-content' | 'tenant-change' | 'server-close';
export interface StynxEventStreamResync {
  reason: StynxEventStreamResyncReason;
}
export interface StynxEventStreamError {
  status: number | null; // HTTP status; null when the error is not an HttpErrorResponse
  body: unknown; // HttpErrorResponse.error, JSON-decoded when it is JSON text
  error: unknown; // the original error
  at: number; // StynxEventStreamClock.now() when recorded
  outcome: 'stopped' | 'retry' | 'polling';
}
export class StynxEventStreamService<T = unknown> {
  // ...1.5.0 members above...
  readonly resync$: Observable<StynxEventStreamResync>;
  readonly lastError: Signal<StynxEventStreamError | null>;
}
```

**`reopenOnPollingEntry` (UPS-NGSSE-11).** With `'immediate'` (the default), the failure that first moves the stream into polling reopens at once, unless the server asked for a delay. This is the 1.5.0 behavior. A positive `Retry-After` or `retryAfterFrom` delay still defers this reopen, as in the 429 fix. With `'backoff'`, that reopen is scheduled like any other failure, after `max(backoff, Retry-After, retryAfterFrom)`, and it respects `retryMode`, `initialMs` and `maxMs`. With the defaults, consecutive failures therefore reopen after 1, 2 and 4 seconds and so on, with no request at the moment polling begins. `tick$` keeps its `pollingIntervalMs` compass from that moment. With `failuresBeforePolling: 1`, `retryMode: 'fixed'` and `initialMs = pollingIntervalMs = 60_000`, nothing is requested for 60 seconds after the first failure, and one request follows at 60 seconds. Stops for 401/403, `UnauthorizedError` and an inactive session keep precedence. The 204 and tenant-change paths are unchanged.

**`commentActivity` (UPS-NGSSE-13).** With `'stale-only'` (the default), SSE comment lines such as `: connected` and `: heartbeat` only re-arm the silence timer. This is the 1.5.0 behavior. With `'live'`, every comment line received on the current connection has the same effect on state as a delivered frame. Status becomes `live` and `polling()` becomes false. The failure window and consecutive-failure counter are cleared, so the next failure waits `initialMs`. The retry and polling timers are cancelled, so `tick$` stops, and `lastError` is cleared. A comment emits nothing on `events$`. It does not move `lastEventId` and does not enter deduplication. It still re-arms staleness: silence for `heartbeatMs × staleFactor` after the last comment counts as a failure. The generation guard is unchanged. A comment parsed after a subscriber has stopped the stream or changed tenant, even within the same progress chunk, has no effect. The status set on opening is unchanged in both modes: `live` with no prior failure, `reconnecting` or `polling` otherwise, unless `openStatus` below holds it.

**`openStatus` (UPS-NGSSE-13).** With `'immediate'` (the default), each open sets its status at once, as above. This is the 1.5.0 behavior. With `'first-line'`, the status an open would set is held for that connection and applied by the first line that connection receives, before the line is handled as a frame or comment, so a delivered frame or, with `commentActivity: 'live'`, a comment on that same line still wins and the status ends `live`. Until that line, the status does not change: the first `start()` and a `start()` after `stop()` wait in `idle`, never `stopped`; a tenant change holds the status of the previous tenant's connection; an immediate reopen after a server close under `serverClose` keeps `reconnecting`; a planned reopen for the age or byte ceiling keeps `live`. The silence timer is armed on the open in both modes, so a reopen that receives nothing counts a failure after `heartbeatMs × staleFactor`, with the usual backoff and failure window. The held status belongs to its connection generation and is applied under the same generation guard as the silence re-arm: a line parsed from a connection a subscriber has stopped or replaced, even within the same progress chunk, does not apply it. The option does not alter `lastEventId`, `events$`, `tick$`, `resync$` or `lastError`. `provideStynxEventStream` rejects any value other than `'immediate'` or `'first-line'`.

**`resync$` (UPS-NGSSE-14).** This stream emits once each time the client discards a cursor it holds, that is, when `lastEventId()` was non-null. The emission happens after `lastEventId()` and the deduplication history are cleared, and before the matching reopen is scheduled or opened. The reason is `'no-content'` for an HTTP 204 response and `'tenant-change'` for a tenant switch. Nothing is emitted on the first open, on a 204 or tenant change while no cursor is held, or on any ordinary failure that keeps the cursor (status 0, 5xx, 429, silence, a byte ceiling, or a 200 that ends the body under the default `serverClose.cursor: 'keep'`). A subscriber may stop the stream or change tenant synchronously from `resync$`. In that case the old generation does not reopen. `'server-close'` is emitted only by the opt-in server-close policy below, when `serverClose.cursor` is `'discard'` and a 200 ends while a cursor is held; 1.5.3 reserved the reason without emitting it, and a client that does not set that option never receives it.

**`lastError` (UPS-NGSSE-15).** This signal holds the most recent error delivered by the transport's error channel, recorded when the client handles it. `outcome` is `'stopped'` for 401/403, `UnauthorizedError` or an inactive session. It is `'polling'` when the failure leaves the stream polling and `'retry'` otherwise. A stop keeps the recorded error, so a terminal 401 remains visible while `stopped`. Failures with no error object, which are silence, completion, a 200 or 204 response and the byte ceiling, leave `lastError` unchanged. The signal is cleared by `start()`, by a tenant change, and whenever a delivered frame (or, with `commentActivity: 'live'`, a comment) returns the stream to `live`. The service does not translate the error into display text: the application maps `status` and `body` to its own message keys.

**`retryAfterFrom` (UPS-NGSSE-15).** This function is called for every non-terminal `HttpErrorResponse` failure, with the response and its decoded body. It is not called for 401/403 or for failures without an HTTP error. The decoded body is the JSON-decoded value when `error.error` is JSON text, as it is under the transport's `responseType: 'text'`. Otherwise it is `error.error` as received. The function returns a delay in milliseconds, or `null`. A non-finite or non-number result, or a thrown exception, contributes no delay, and a negative result counts as zero. The reopen waits for `max(backoff, Retry-After, retryAfterFrom)`. STYNX embeds no consumer error envelope. A consumer whose body carries `context.retryAfter` in seconds returns that value multiplied by 1 000, or `null` when it is absent.

### 1.5.x server-close policy (UPS-NGSSE-12)

**Source:** stynx-nyx/stynx#321. This addition is opt-in per `provideStynxEventStream` injector. Every omitted field keeps the 1.5.0 behavior.

```ts
export interface StynxEventStreamConfig {
  // ...fields above...
  serverClose?: StynxEventStreamServerClose;
}
export interface StynxEventStreamServerClose {
  ok?: 'failure' | 'end-of-stream'; // default 'failure'
  cursor?: 'keep' | 'discard'; // default 'keep'
  reopen?: 'backoff' | 'immediate' | 'immediate-after-frame'; // default 'backoff'
}
```

A **server close** is a stream the server ends without an error. There are two kinds. A **204** is unchanged in what it means: it never counts as a failure and always discards the cursor. A **200 that ends** is a 2xx response other than 204 whose body ends; a transport that completes without delivering a response is treated the same way. HTTP error responses, status 0, silence and the byte and age ceilings are not server closes, and this policy does not apply to them.

- **`ok`** applies to a 200 that ends. With `'failure'` (the default, 1.5.0) it enters the failure window and the consecutive-failure counter like any other failure, and may lead to polling. With `'end-of-stream'` it is a normal end of stream: it does not enter `failureWindowMs`, does not raise the backoff, and never leads to polling by itself. The status becomes `reconnecting` until the reopen, or stays `polling` when the stream was already polling.
- **`cursor`** applies to a 200 that ends. With `'keep'` (the default, 1.5.0) the next request carries the same `Last-Event-ID`. With `'discard'` the client clears `lastEventId()` and the deduplication history, exactly as for a 204, and the next request carries no `Last-Event-ID`. When a cursor was held, `resync$` emits `{ reason: 'server-close' }` once, before the reopen is opened or scheduled. `ok` and `cursor` are independent: `ok: 'failure'` with `cursor: 'discard'` counts the failure and discards the cursor.
- **`reopen`** applies to every server close that is **not** counted as a failure: a 204, and a 200 that ends under `ok: 'end-of-stream'`. With `'backoff'` (the default, 1.5.0 for a 204) the reopen waits the normal retry delay; because the close is not a failure, that delay does not grow from one close to the next. With `'immediate'` the client reopens synchronously, with no timer. With `'immediate-after-frame'` it reopens at once only when the connection that just closed delivered at least one frame, and after the retry delay otherwise. A delivered frame is a complete frame with a new nonempty ID and valid JSON, the same frame that advances the cursor; comment lines, duplicate IDs and frames without an ID do not count. A 200 that ends under `ok: 'failure'` ignores `reopen` and follows the ordinary failure schedule, including `reopenOnPollingEntry`.

Stops keep precedence: an inactive session stops the stream instead of reopening, and a subscriber that stops the stream or changes tenant from `resync$` prevents the reopen of the old generation. A completion that arrives from a connection the client already replaced is ignored. The client never synthesizes an event for a server close, and `lastError` is unchanged by one.

`reopen: 'immediate'` has no rate limit of its own. A server that closes every request at once, for example with repeated 204 responses, is then asked again without pause. Prefer `'immediate-after-frame'` unless the server is known to hold an idle stream open.

| Consumer intent                                                     | `serverClose`                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1.5.0 behavior                                                      | omitted, or `{ ok: 'failure', cursor: 'keep', reopen: 'backoff' }`            |
| Close is a normal end, restart from a fresh cursor at once          | `{ ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' }`             |
| Fresh cursor, at once only after a connection that delivered frames | `{ ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate-after-frame' }` |

**Test double fix.** `FakeStynxEventStreamTransport.respond()` now completes the connection it responded on. Before, a response that made the client reopen synchronously completed the newly opened connection instead.

**Transport header.** The built-in `HttpClient` transport sends `Accept: text/event-stream` on every stream request, in addition to `Last-Event-ID` when a cursor is held.

**Test double.** `FakeStynxEventStreamTransport.error(status, headers?, body?)` accepts an optional response body, delivered as `HttpErrorResponse.error`. Existing two-argument calls are unchanged.

## Published test double (`@stynx-nyx/angular/testing`)

The existing APF secondary entry `packages-web/angular/testing/index.ts` becomes the canonical test barrel. It exports `FakeStynxEventStreamTransport` and `FakeStynxEventStreamClock`, implementing the public primary-entry interfaces, with methods to emit cumulative progress/text frames, HTTP responses and errors, advance time, and observe/cancel connection subscriptions. Its imports of primary API types use `@stynx-nyx/angular`, never relative paths crossing APF entry points. `packages-web/angular/src/testing/index.ts` is not re-exported by the primary barrel. The generated `dist/fesm2022/stynx-nyx-angular-testing.mjs` and `dist/types/stynx-nyx-angular-testing.d.ts` must both exist after `ng-packagr` and resolve from a package consumer. STYNX's own client tests use the published fake and clock, rather than a private duplicate. The source package already declares `./testing`, but its current entry is empty; an empty entry does not satisfy UPS-TEST-01.

## Required observation and release evidence

### Per-ID acceptance map

| ID           | Contract and decisive sensor                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| UPS-SSE-01   | Nest `@Get` sends headers, opening comment and JSON `id/event/data` frame before close.                          |
| UPS-SSE-02   | Fake scheduler drives default/configured heartbeat; close cancels it.                                            |
| UPS-SSE-03   | Generic source and `(createdAt,id)` cursor; source contract test verifies strict order.                          |
| UPS-SSE-04   | Visible recent resumes, visible expired returns empty 204, foreign/unknown starts at database `now()`.           |
| UPS-SSE-05   | Captured tenant/actor wraps opening and each tick; missing scope fails before SQL; real two-tenant RLS negative. |
| UPS-SSE-06   | Server filter and project run before write, with extended scope available to source SQL.                         |
| UPS-SSE-07   | Overlapping ticks serialize, read failure survives, both close paths clean up.                                   |
| UPS-SSE-08   | Optional actor quota yields 429/`Retry-After`; optional payload ceiling yields `: dropped <id>`.                 |
| UPS-SSE-09   | Opening `retry:` and inspectable/sink metrics for opens, frames, drops and closes.                               |
| UPS-SSE-10   | Documented wire order, at-least-once delivery, client ID deduplication and replay window.                        |
| UPS-NGSSE-01 | Provider/service use intercepted `HttpClient` progress text; no native `EventSource`.                            |
| UPS-NGSSE-02 | Signal states and cursor/polling signals, typed `events$`, polling `tick$`.                                      |
| UPS-NGSSE-03 | Fake-clock exponential 1–30 second backoff and fixed mode.                                                       |
| UPS-NGSSE-04 | Configurable failure threshold/window, required polling interval, first-frame recovery.                          |
| UPS-NGSSE-05 | Last ID header, 204 cursor reset and same-tenant ID deduplication.                                               |
| UPS-NGSSE-06 | Fake-clock silence at heartbeat × stale factor reconnects.                                                       |
| UPS-NGSSE-07 | Terminal 401 after refresh/403 stop; 429 honors `Retry-After`; 0/5xx count.                                      |
| UPS-NGSSE-08 | Tenant change resets connection/cursor; supplied session signal false stops.                                     |
| UPS-NGSSE-09 | Type/prefix filtering without rendering data fields as text.                                                     |
| UPS-NGSSE-10 | Replaceable transport and published testing entry exercise frames/errors/close/clock.                            |
| UPS-NGSSE-11 | `reopenOnPollingEntry: 'backoff'` reopens on backoff/fixed compass at polling entry; default stays immediate.    |
| UPS-NGSSE-12 | `serverClose` sets failure or end of stream, cursor and reopen delay for a 200 that ends; reopen delay for 204.  |
| UPS-NGSSE-13 | `commentActivity: 'live'` comment returns to `live` and clears counters without event or cursor move.            |
| UPS-NGSSE-13 | `openStatus: 'first-line'` holds `idle` on start and the previous status on reopen until the first line.         |
| UPS-NGSSE-14 | `resync$` emits once per held cursor discarded by 204, tenant change or opted-in server close, with the reason.  |
| UPS-NGSSE-15 | `lastError` records status/body/outcome; `retryAfterFrom` body delay joins `max(backoff, Retry-After)`.          |
| UPS-TEST-01  | `@stynx-nyx/angular/testing` fake is used by STYNX tests and both APF artifacts resolve to a consumer.           |

| Requirement                    | Required observation                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UPS-SSE-01, 02, 03, 06, 09, 10 | Unit framing/cursor tests; real Nest `@Get` response streams before close; injectable fake scheduler; scoped source with extended policy scope; filter/project; retry and counters/sink; documented at-least-once and replay. |
| UPS-SSE-04, 05                 | PostgreSQL/RLS test with A and B in one spec: A event streams, B event never streams to A, B `Last-Event-ID` is unknown to A, A recent ID resumes, A expired ID returns empty 204, and missing tenant/actor fails before SQL. |
| UPS-SSE-07, 08                 | Overlapping ticks serialize; a read error leaves connection live; request and response close each cancel timers and release quota; configured 429/`Retry-After` and oversized `: dropped <id>` work.                          |
| UPS-NGSSE-01, 09               | `HttpTestingController` sees bearer, tenant and request ID through real interceptors; parser tests arbitrary chunks, CRLF, comment and multiline data; type/prefix filtering; no native `EventSource`.                        |
| UPS-NGSSE-02…08                | Fake-clock transitions, polling, backoff, 204, stale, dedup, 401/403/429/0/5xx, token refresh/replay and banner suppression, tenant switch and logout; cumulative offset and byte/age ceilings.                               |
| UPS-NGSSE-10, UPS-TEST-01      | Own tests use fake transport/clock for frames, HTTP errors and close; built `./testing` FESM and d.ts resolve from a consumer.                                                                                                |

The mandatory backend integration spec lives under `reference/api/test/integration/*.spec.ts`, using its existing `createPostgresTestDatabase` helper from `packages/data/test/support/postgres`. It provisions a fresh per-run PostgreSQL database with `useTemplate: false` because the migrated `STYNX_TEST_PG_TEMPLATE` already contains `tenancy` and `auth` objects that this fixture creates. It still honors the `STYNX_TEST_PG_*` connection settings, while deliberately bypassing `STYNX_TEST_PG_TEMPLATE`. The fixture must be idempotent across repeated invocations in the same cluster: guarded role creation, grants and fixture setup may run in both `reference-api test` and `reference-api test:int`. The test table has a separate owner, `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, with `USING`/`WITH CHECK` policies on `current_setting('app.tenant_id', true)`. The transaction uses the data package's app connection and `SET LOCAL ROLE stynx_app` in the same transaction after data's GUC setup. After guarded role creation the fixture calls `ensureRoleLogin('stynx_app')` and uses `appConnectionString` to authenticate directly as restricted `stynx_app`, with `NOINHERIT`, `NOBYPASSRLS` and no superuser privilege. The mandatory data-module startup checks apply to the default role too; assert `current_user`, `rolsuper = false` and `rolbypassrls = false`. The maintenance connection remains separate for fixture provisioning. `findById` and `listSince` deliberately have **no tenant WHERE**: RLS itself must hide B from A. Positives and negatives belong in the same real Nest/PostgreSQL scenario, preventing a vacuous zero-row pass. A fake scheduled tick clears both the core request-context storage and data transaction CLS (or runs under B) before firing, proving the service re-establishes A explicitly rather than inheriting ALS.

Root `pnpm test:int` filters `./packages/*` and does not run `reference/api`. Capture a named passing spec from `pnpm --filter @stynx-nyx/reference-api test:int`, run `pnpm ci:reference-apps` and `pnpm ci:stynx`, and require the remote `reference-apps / reference-api` check. The reference API `test` and `test:int` scripts both include the integration spec, so the PostgreSQL fixture must be repeatable. Package API baseline, Angular secondary-entry build, trace and release checks remain required. These checks are evidence of implementation; this Architect document alone does not claim a passing test or published package.
