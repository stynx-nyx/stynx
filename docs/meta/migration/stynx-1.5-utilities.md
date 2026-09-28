# STYNX 1.5 utility migration

## Signed inbound webhooks

For a Nest webhook route, enable `rawBody: true` at application bootstrap,
import `StynxWebhookSignatureModule.forRoot(options)`, and apply
`WebhookSignatureGuard`. Provide a shared atomic replay store; a process-local
set does not protect a multi-instance deployment. Configure the producer to
send a ten-digit Unix-seconds timestamp and `sha256=<64 hex digits>` over the
exact message bytes. The default message is `<timestamp>.<raw body>`.

When the host establishes tenant or actor identity after verification, cover
those fields in `options.message` or derive them from a trusted sender mapping.
On a public route using STYNX tenancy, set canonical `stynxClaims.sub` and
`stynxClaims.tenantId` in `onVerified` only after successful HMAC and replay
checks. The technical actor still needs active tenant membership. See the
[utility contract](../../framework/contracts/utilities-1.5.md) for the
supported guard order. DETRAN's bare-hex signature format requires an adapter
change to send the `sha256=` prefix.

## Clock and business calendar

Use `provideStynxClock(clock)` for Nest consumers that need the new `Clock`
port. To share a fake or real clock with worklist, provide the same object to
the existing `WORKLIST_CLOCK` token. `TenantBusinessCalendar` requires host
callbacks for the tenant IANA timezone and year-scoped `YYYY-MM-DD` holidays;
STYNX supplies no holiday catalog. Its deadline is the exclusive start of the
next local civil date after the requested number of business days. Consumers
that previously treated due dates as a same-day instant must adapt their
comparison and display logic.

## Angular command idempotency

Register `provideStynxIdempotency()` once alongside
`provideHttpClient(withInterceptorsFromDi())`. Existing
`provideStynxAngular()` or `StynxAngularModule.forRoot()` registrations do
not turn it on. Mark each mutating request with an `HttpContext` value for
`STYNX_IDEMPOTENCY_COMMAND`. Use `{ key: stableOperationKey }` for a key
already owned by the host, including DELETE without a body. For a JSON
object or array body, use `{ action, target, includeBodyHash: true }` and set
`Content-Type: application/json`; the interceptor computes
`<action>:<target>:<sha256(canonicalJson(body))>`. The same request and retry
reuse the key. A caller's existing `Idempotency-Key` header takes precedence.

`canonicalJson` sorts object keys by Unicode code point and rejects values
that would be silently omitted or changed by JSON serialization, including
`undefined` properties. DETRAN's existing UTF-16 key sort and empty-string
body hash differ; align producer and consumer before reusing stored keys.
The CTG-0005 server computes its own method/path/body fingerprint and returns
409 on key reuse with a different parsed body. The HTTP integration proof of
that 409 remains pending until CTG-0005 is implemented.
