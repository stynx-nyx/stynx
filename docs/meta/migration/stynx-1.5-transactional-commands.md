# STYNX 1.5 — transactional command errors

`@TransactionalCommand` was introduced in the published STYNX 1.5.0. It was
not present in RC1/RC2. Its own rejection bodies align with the existing
`law/schemas/error-envelope.schema.json`:
`statusCode`, `errorCode`, `message`, `requestId`, optional `details`, and
`retryable`. `X-Request-Id` equals `requestId` on those rejections.

The default mismatch code is `IDEMPOTENCY:CONFLICT:duplicate-key` rather
than the unreleased `IDEMPOTENCY_KEY_CONFLICT`. A consumer may still configure
`mismatchCode`, but it must match the law `errorCode` pattern
`<DOMAIN>:<CATEGORY>:<DETAIL>`; invalid module or route options are rejected
at bootstrap. The same key with a changed canonical JSON body, HTTP method,
or concrete path gives 409 with that code, safe `details: { key }`, and
`retryable:false`. A concurrent reservation still in progress gives 409
`IDEMPOTENCY:CONFLICT:in-progress` with `retryable:true`. The complete fixed
messages and other CTG5-owned error codes are in
`docs/framework/contracts/errors.json`.

Consumers using an early source checkout with `{code,context}` checks for
the new CTG5 boundary should read `errorCode` and `details` on those
rejections. The existing `StynxErrorFilter`, `StynxDataError` 504/503/500,
the legacy idempotency 422 and bodies chosen by a consumer handler (including
selected/replayed 502 and unselected 422) keep their historical bytes. This
change does not alter a database migration or the global filter. Error
contracts of application mutation endpoints still enumerate their own
validation, authorization, not-found, conflict and rate-limit outcomes as
required by `INV-ERROR-001`.

The release tests assert the CTG5-owned statuses and complete bodies at real
Nest HTTP, including request IDs, absence of durable effects on rejection and
the exact legacy bodies. Backend integration uses PostgreSQL with tenant RLS
and two tenants. The published conformance record is
`work/rounds/R-0002/conformance-1.5.0.md`.

`lockTimeoutMs` bounds individual PostgreSQL lock acquisition while reserving
the idempotency key; it is not a total command deadline. The audit-chain
function deliberately sets `lock_timeout` to zero while waiting for its
transactional advisory lock. In direct `Database.tx` flows,
`TxOptions.deadlineMs` sets a per-statement PostgreSQL `statement_timeout`,
including the audit trigger on idempotency reservation. The 1.5.0 CTG5
decorator does not expose that option; the postrelease patch adds optional
`deadlineMs` to module and route options. PostgreSQL reports a statement
timeout through the existing `StynxDataError` 504 body and rolls the command
back. A consumer must manage its wall-clock request deadline separately.
An audit wait failure must not be reported as idempotency-key contention.
