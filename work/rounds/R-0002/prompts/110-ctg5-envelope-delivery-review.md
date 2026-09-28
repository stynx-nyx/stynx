# Cross-family delivery-review — CTG5 canonical error envelope

You are Claude Code Opus 5.5, an independent read-only delivery reviewer.
Review the exact worktree HEAD supplied by the maestro, based on cumulative
CTG5–8 product commit `81681892696c19979c7983ebff0fb1c0c3c49c8d`.
The maestro generated the read-only patch at
`/private/tmp/stynx-ctg5-envelope-delivery.patch`; inspect it and the current
files. Do not execute Git, edit files, dispatch agents, publish, or infer
approval for a semantic law change. This review covers only the isolated
CTG5 envelope reconciliation before ordered cumulative import under
OD-S15-02; it is not final release approval.

Authorities: `law/schemas/error-envelope.schema.json`,
`law/invariants/INV-ERROR-001.json`, DETRAN C-0002 §6.2 read-only,
`work/rounds/R-0002/ctg5-error-authority-classification.md`,
`work/rounds/R-0002/ctg5-error-envelope-option-a.md`,
`docs/framework/contracts/transactional-audit-idempotency-1.5.md`,
`docs/framework/contracts/errors.json`, and
`docs/meta/migration/stynx-1.5-transactional-commands.md`. The classification
review is `reviews/ctg5-error-authority-classification-review-1.json` (PASS)
and the worker prompt-review binding is
`reviews/ctg5-envelope-worker-review-binding.json` (cycle 4 PASS).

Inspect both CTG5 source files in
`packages/backend/src/transactional-command/`, the new and amended
`transactional-command-*` integration/unit tests, the Angular command HTTP
interop and If-Match HTTP tests, the changeset, README, API baseline and trace.
Check the following against actual source and tests, not just green logs:

1. Every CTG5-owned 400/403/409/500/503 rejection has exactly the governed
   envelope fields and a schema-valid `errorCode`. The 409 mismatch default is
   `IDEMPOTENCY:CONFLICT:duplicate-key`; in-progress uses its own code and
   `retryable:true`. `X-Request-Id` equals body `requestId`, with the specified
   context → normalized response header → normalized request header → UUIDv7
   order. The no-core/no-module path is covered.
2. `mismatchCode` and static lock timeout/TTL options fail at module or
   marked-route bootstrap as contracted. The runtime defensive checks do not
   leak noncanonical responses.
3. Phase classification happens after database rollback and preserves
   `StynxDataError`, the legacy 422, consumer-selected thrown/committed 502
   and other consumer responses. Setup/store/audit/COMMIT non-data failures
   become a public fixed 503 without secrets; CTG5 callbacks become their
   specific fixed 500. No transient 409, audit row, domain write or reserved
   key is committed for a rejected command.
4. Negative and positive tests really exercise real PostgreSQL/RLS, rollback,
   two tenants, HTTP bodies/headers, configuration bootstrap, and legacy
   preservation. No tests were weakened. `law/` invariant/schema and old
   published wire are unchanged. API baseline was generator-rebound and
   verifies 44/44; trace binds 451/451; fixed-group changeset exists.
5. Commit authority is role-separated (Architect, Inspector, Engineer); only
   the maestro ran Git. Check whether the resulting isolated HEAD is safe to
   import under OD-S15-02 without an intermediate PR, RC or full CI. Do not
   demand final versioning or final release gates at this stage.

The maestro's focal evidence: 11 files 93/93 tests; complete backend 48 files
499/499; `pnpm test:int` 52/52 tasks with real PostgreSQL; backend lint and
typecheck; negative RLS 7 tables and smoke; trace 451/451; generated package
READMEs 44/44; API baseline 44/44; DEVAI strict zero findings. These results
are supporting evidence, not a substitute for source and sensor inspection.

Return one valid JSON object only, with `verdict` (`PASS|REVIEW|FAIL`),
`findings` (array of objects with `severity`, `file`, `issue`,
`required_change`) and `summary`. Use PASS only if no blocking issue remains.
No Markdown fences.
