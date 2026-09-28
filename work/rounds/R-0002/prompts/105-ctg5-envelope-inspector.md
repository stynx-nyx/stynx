# CTG-0005 envelope — Inspector

Declare **Inspector** (Constitution Art. 6). Dispatch only after the Owner
records option A for `INV-ERROR-001`, the Architect amends the CTG5 contract
and error catalog, and a cross-family prompt-review PASS covers this prompt.
Read `ctg5-error-envelope-option-a.md`, its review-4 PASS receipt, the current
Nest CTG5 source, and the existing tests. Do not execute Git, edit source,
`law/`, manifests, workflows or DETRAN. Do not weaken or delete tests.

Own only backend tests under `packages/backend/test/**`. Include the existing
HTTP, advanced, faults, provenance, filters, no-module, Angular interop and
if-match HTTP specs, the unit contract spec, and a new
`transactional-command-errors.integration.spec.ts`. The Angular interop spec
borrows a CTG7 test lock; the If-Match spec borrows a CTG6 test lock. Add
assertions only, preserving every existing 412/428, 422, 502 and RLS proof.
Move the invalid `mismatchCode:''` provenance fixture to a separate
`app.init()` refusal fixture; change the valid custom code fixture to
`SCOPED:CONFLICT:command-mismatch` while keeping its configuration proof.

For each reachable CTG5-owned 400/403/409/500/503 in the plan's matrix,
assert exact status and `toEqual` of the complete canonical body, no
`code`/`context`, body.requestId equal to `X-Request-Id`, and no domain,
audit or key effect. Assert `retryable:true` only on in-progress 409;
generic transaction 503 uses false. Cover two concurrent 409 losers with
different IDs and eventual replay. Build the no-module fixture both with
core and without core; the latter has no guard, no StynxAuthModule and no
command module. An invalid inbound request ID must become a generated UUIDv7.
Combined If-Match routes retain 412/428 and get 409 in both decorator orders.
Compare the runtime error-code regex to the law schema pattern in a sensor.

Test `forRoot` invalid mismatchCode/lockTimeoutMs as synchronous throws;
test route mismatchCode/lockTimeoutMs and `@Idempotent` ttlMs as `app.init()`
refusals. Preserve and strengthen **legacy** data-error assertions to their
exact existing shape/status: 504 `STATEMENT_TIMEOUT` from raw 57014, 503
`SERIALIZATION_FAILURE` from 40001, and wrong-role 500
`TRANSACTION_IDENTITY_MISMATCH`. Keep their durable-state controls. The
actorless `Database.tx` branch is unreachable from a valid CTG5 HTTP route;
cite its existing data unit test or report that gap to the Architect for a
separate data-test lock.
The handler-fault case stays status 502 and body `{code:'HANDLER_FAILED'}`;
the unselected CTG5 422, legacy idempotency 422, persisted 502 and replay
keep their bytes and headers. For audit/completion/COMMIT failures assert the
new exact 503 envelope, both attempts, and `assertNoDurableEffect`.

Run the focused backend `test` task against real PostgreSQL as `stynx_app`
with two tenants. Record the **expected red** failures in new/strengthened
sensors, exact command, output and counts. `pnpm test:int` alone is not
sufficient: backend integration specs run under its `test` script. Hand the
test paths to the Architect for `law/trace.json` rebind. No source edits.
