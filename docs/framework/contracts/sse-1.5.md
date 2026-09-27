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

`TScope` may add policy filters used by a source's SQL; the service passes the same captured, immutable scope to `now`, `findById`, `listSince`, `filter`, and `project`. It calls **every** source operation inside a fresh `contextRunner.withRequestContext(scope, ...)`, including opening and each later tick. The source does not widen visibility based on an event ID. `listSince` returns rows ordered by `(createdAt ASC, id ASC)` and selects strictly after the cursor; equal timestamps are ordered by ID. A source may use its own SQL predicate for policy scope, but tenant isolation must still be enforced by RLS.

The module creates a default scheduler with `setInterval` only in its factory. The injected scheduler controls both heartbeat and source ticks in tests. `tickMs`, `batchSize`, limits and time values must be validated as finite positive values; `maxConnectionsPerActor` is optional. The service always maintains inspectable counters, and also calls the injected metrics sink when supplied. Absence of a sink does not make counters disappear. A sink failure cannot bypass scope checks or expose an event.

### HTTP opening, replay and frames

Preflight is ordered: (1) validate the captured `tenantId` and `actorId`; (2) reserve the optional `(tenantId, actorId)` connection slot or reject it; (3) resolve `Last-Event-ID` under the scoped source and decide replay/204; (4) set/flush stream headers and write `: connected\n\n`. Missing tenant yields HTTP 400 `SSE_TENANT_REQUIRED`; missing actor yields HTTP 401 `SSE_ACTOR_REQUIRED`. Both occur before any source call or stream header. A full slot yields HTTP 429 with `Retry-After` in seconds. Rejection releases any reserved slot and starts no timer.

For a visible event ID, `findById` supplies `(createdAt, id)`. If its age against `source.now(scope)` is within the replay window, streaming resumes **after** that cursor. If visible but older than the window, return HTTP 204 with no body, stream headers, or timer. If `findById` returns null, including an ID belonging only to another tenant, begin at `source.now(scope)` from the database, not the client clock. The source's clock read is also scoped. No tenant information is disclosed by distinguishing a foreign ID from an unknown one. An absent header starts at the database clock as well. Reject malformed/header-injected IDs before writing stream headers.

Successful opening sends `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, and `X-Accel-Buffering: no`; call `flushHeaders()` where supported, then immediately write and flush `: connected\n\n`. Optional `retryMs` adds `retry: <milliseconds>\n\n` at opening. A delivered frame is `id: <id>\nevent: <event>\ndata: <single-line JSON>\n\n`; the ID and event name must not inject CR/LF. Heartbeat is `: heartbeat\n\n` every 20 seconds by default. Oversize projected JSON is not partially written: emit `: dropped <id>\n\n`, increment the drop counter, and continue past that row. Filtering precedes projection and writing. The consumer may deliberately pass policy constraints through `TScope` to SQL. A route must use manual `@Res()` handling without Nest response mapping, buffering, or serialization interceptors that delay frames; a real Nest HTTP test must see the first frame before the response closes.

Ticks are serialized: no concurrent `listSince` calls or duplicate cursor advancement. A tick read error is reported safely and the connection remains open for the next tick. Advance the cursor only after a row is handled by delivery, filter or drop so it is never skipped by a failed source read. Closing either request or response cancels both schedules, releases the connection slot exactly once, emits a close metric, and prevents later writes. Delivery is at least once; a reconnect may repeat IDs. The client deduplicates by ID. Source ordering, strict cursor comparison, and the 24-hour default replay window are part of the wire contract. The current `@stynx-nyx/outbox` upserts on `(tenant_id, entity, entity_id)` and is **not** an append-only replay source. CTG-0002 ships the source port; a default outbox source requires a separate UPS-OBX decision/adenda.

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

The parser consumes arbitrary text chunks, CRLF or LF, comments, and multiline `data:` values (joined with LF). Only complete blank-line-terminated frames are emitted. A `DownloadProgress` event's `partialText` is **cumulative** under XHR: keep an offset for that connection and parse only `partialText.slice(offset)`. Reset the offset and parser on reconnect. Heartbeats/comments count as activity for staleness, but are not emitted on `events$`. The `data:` value is parsed as JSON; the transport never turns a payload field into display text. Apply `types` and `eventPrefix` to the event name before emission. Deduplicate delivered IDs within a tenant across reconnects; a tenant switch clears that history and `lastEventId`.

The status path is `idle → live → reconnecting → polling → live`, with `stopped` on explicit stop, logout, terminal authorization, or teardown. `polling()` reflects only the polling state. Backoff defaults to exponential 1–30 seconds; `retryMode: 'fixed'` uses the configured fixed compass. Two failed opens/ticks within 60 seconds enter polling by default. `tick$` emits each configured polling interval; the service periodically retries the stream while polling. The first complete frame after re-opening returns to `live` and clears failure/backoff counters. A 204 discards `Last-Event-ID` and reopens from a fresh cursor; it does not enter `stopped`. On any frame silence for `heartbeatMs × staleFactor` (40 seconds by default), close and reconnect. A tenant change cancels the old request, clears cursor/dedup, and opens for the new tenant; a null tenant does not start a scoped stream. On `sessionActive()` becoming false, cancel transport and all timers and enter `stopped`.

`maxConnectionBytes` and `maxConnectionAgeMs` are finite positive ceilings. When either is reached, cancel and reopen with the most recent `Last-Event-ID`; this prevents unbounded cumulative `partialText` growth. The byte ceiling counts received UTF-8 text, not just emitted payload. A deliberate ceiling reconnect is not a failure and does not trigger polling. The cursor survives a same-tenant reconnect and is cleared by 204 or tenant change.

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
| UPS-TEST-01  | `@stynx-nyx/angular/testing` fake is used by STYNX tests and both APF artifacts resolve to a consumer.           |

| Requirement                    | Required observation                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UPS-SSE-01, 02, 03, 06, 09, 10 | Unit framing/cursor tests; real Nest `@Get` response streams before close; injectable fake scheduler; scoped source with extended policy scope; filter/project; retry and counters/sink; documented at-least-once and replay. |
| UPS-SSE-04, 05                 | PostgreSQL/RLS test with A and B in one spec: A event streams, B event never streams to A, B `Last-Event-ID` is unknown to A, A recent ID resumes, A expired ID returns empty 204, and missing tenant/actor fails before SQL. |
| UPS-SSE-07, 08                 | Overlapping ticks serialize; a read error leaves connection live; request and response close each cancel timers and release quota; configured 429/`Retry-After` and oversized `: dropped <id>` work.                          |
| UPS-NGSSE-01, 09               | `HttpTestingController` sees bearer, tenant and request ID through real interceptors; parser tests arbitrary chunks, CRLF, comment and multiline data; type/prefix filtering; no native `EventSource`.                        |
| UPS-NGSSE-02…08                | Fake-clock transitions, polling, backoff, 204, stale, dedup, 401/403/429/0/5xx, token refresh/replay and banner suppression, tenant switch and logout; cumulative offset and byte/age ceilings.                               |
| UPS-NGSSE-10, UPS-TEST-01      | Own tests use fake transport/clock for frames, HTTP errors and close; built `./testing` FESM and d.ts resolve from a consumer.                                                                                                |

The mandatory backend integration spec lives under `reference/api/test/integration/*.spec.ts`, using its existing `createPostgresTestDatabase` helper from `packages/data/test/support/postgres`. It provisions a fresh per-run PostgreSQL database, honors `STYNX_TEST_PG_TEMPLATE` and `STYNX_TEST_PG_*`, and must be idempotent across repeated invocations in the same cluster: guarded role creation, grants and fixture setup may run in both `reference-api test` and `reference-api test:int`. The test table has a separate owner, `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, with `USING`/`WITH CHECK` policies on `current_setting('app.tenant_id', true)`. The transaction uses the data package's app connection and `SET LOCAL ROLE stynx_app` in the same transaction after data's GUC setup. The role is `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, is not superuser, and is granted to the connector; assert `current_user`, `rolsuper = false` and `rolbypassrls = false`. `findById` and `listSince` deliberately have **no tenant WHERE**: RLS itself must hide B from A. Positives and negatives belong in the same real Nest/PostgreSQL scenario, preventing a vacuous zero-row pass. A fake scheduled tick clears both the core request-context storage and data transaction CLS (or runs under B) before firing, proving the service re-establishes A explicitly rather than inheriting ALS.

Root `pnpm test:int` filters `./packages/*` and does not run `reference/api`. Capture a named passing spec from `pnpm --filter @stynx-nyx/reference-api test:int`, run `pnpm ci:reference-apps` and `pnpm ci:stynx`, and require the remote `reference-apps / reference-api` check. The reference API `test` and `test:int` scripts both include the integration spec, so the PostgreSQL fixture must be repeatable. Package API baseline, Angular secondary-entry build, trace and release checks remain required. These checks are evidence of implementation; this Architect document alone does not claim a passing test or published package.
