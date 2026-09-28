# STYNX 1.5 — transactional command errors

`@TransactionalCommand` is new in 1.5.0 and has not been published in a stable
release or in RC1/RC2. Before the final release, its own rejection bodies are
aligned with the existing `law/schemas/error-envelope.schema.json`:
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

The Inspector must assert each reachable CTG5-owned status and complete body
at real Nest HTTP, verify request IDs and absence of durable effects on
rejection, and strengthen exact legacy-body assertions. Backend integration
tests use PostgreSQL with tenant RLS and two tenants. Release conformance is
recorded only after the cumulative final CI, review, PR and publication.
