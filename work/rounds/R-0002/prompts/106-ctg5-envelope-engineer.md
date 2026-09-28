# CTG-0005 envelope — Engineer

Declare **Engineer** (Constitution Art. 6). Dispatch only after the Owner
records option A for `INV-ERROR-001`, the Architect contract/docs commit,
Inspector red-test commit and trace rebind, and cross-family prompt-review
PASS of this prompt. Read `ctg5-error-envelope-option-a.md` and every red
sensor. Implement only `packages/backend/src/transactional-command/**`, the
manual prose of `packages/backend/README.md`, and the fixed-group
`.changeset/transactional-command-15.md`. Do not edit tests, `law/`, API
baselines, manifests, workflows or DETRAN; do not execute Git.

Make CTG5-owned rejections use the law envelope and fixed public messages.
Use the IFM requestId order: active core context, normalized response
header, normalized request header, generated UUIDv7; set X-Request-Id equal
to body.requestId. Do not cache it in the singleton filter. Make
`CommandModuleRequiredInterceptor` emit the same canonical 503 with or
without core. Validate module mismatchCode/lockTimeoutMs synchronously in
`forRoot`, and route mismatchCode/lockTimeoutMs plus marked route ttlMs in
`onApplicationBootstrap`; remove the runtime mismatch-code 500. Keep
`mismatchCode` configurable under the schema regex. Do not change global
StynxErrorFilter, legacy idempotency 422 or selected consumer response bytes.

Track the CTG5 origin phase in a closure without wrapping the error or
erasing its `.code`. Initialize `phase='setup'` immediately before
`this.database.tx`; setup runs inside Database.tx. Set `store` as the first
callback statement, `commit` as the last before return, and distinguish
`audit`, `ctg5-callback` and `handler`. Classify only after Database.tx has
mapped raw 57014/40001. Precedence: (1) `CommandRejectionResponse`,
`CommittedCommandResponse`, and the `HttpException` of
`persistStatus=false` pass through untouched; (2)
`TransactionalReservationTimeoutError` becomes retryable 409 in-progress;
(3) every `StynxDataError` stays on the legacy filter, including 504
STATEMENT_TIMEOUT, 503 SERIALIZATION_FAILURE and wrong-role 500; (4) own
setup/store/audit/commit failures become nonretryable canonical 503,
`ctg5-callback` becomes its specified canonical 500; (5) handler exceptions
retain the consumer contract. Convert own errors only after rollback. The
unselected 422 and persisted/replayed 502 remain byte-identical.

Run the focused backend suite with PostgreSQL/RLS, backend lint/typecheck,
`pnpm check:rls-negative`, `pnpm check:rls-smoke` and
`pnpm package-readmes:check`. Report exact green counts and the remaining
API declaration diff to the Architect for a separate baseline rebind. Do not
run the final full CI, open a CTG-specific PR, or publish an RC.
