# CTG-0005 — transactional audit and idempotency

**Current role:** Architect. **State:** contract and prompts drafted; no worker dispatched. **Topological predecessor:** CTG-0004 jobs. **Source:** DETRAN C-0002 §6.2 (read only), UPS-TXN-01…05, all MUST under OD-S15-01.

## Boundary and locks

The approved reference is `docs/framework/contracts/transactional-audit-idempotency-1.5.md`. CTG-0005 owns the transactional option for `@stynx-nyx/backend` audit, `@stynx-nyx/idempotency`, and `@stynx-nyx/data` transaction context. It does not own CTG-0004 schedule or worker behavior. Begin Inspector only after CTG-0004 has reached its Architect checkpoint and the predecessor's actor/context API is frozen; rebase onto its integrated HEAD before the CTG-0005 hard gate. Avoid simultaneous F2/F3 edits to `packages/data` or shared RLS fixtures. Declare separate `(F1, transaction)`, `(F3, backend-audit/idempotency/data)`, and `(F2, backend-audit/idempotency/data)` semantic locks in the coupled triplet; release at each role boundary under the DEVAI runtime. The Architect contract, Inspector tests, and Engineer implementation use separate commits and the required merge order. Do not use this plan to bypass backlog or worktree rules.

## Baseline and design decisions

- `Database.tx` uses CLS for a live client and savepoints, but its nested branch does not validate requested role or identity against the actual connection. `TxOptions` lacks `requireActor`. The application role already requires tenant and actor.
- `AuditInterceptor` currently writes after handler emission through an independent `AuditSink` and catches/logs write failures.
- `IdempotencyInterceptor` currently has fixed tenant/user/route scope, a hand-rolled stable stringifier, 422 on body mismatch, status `<500` persistence and a Redis path. `DatabaseIdempotencyStore` starts owner-role transactions for reservation and completion. These are not command transaction semantics.
- Choose an opt-in command transaction boundary with one actual app-role client. Audit and durable key writes finish before commit, and cache publication occurs only after commit. A selected 502 is a deliberate committed terminal outcome; a rolled-back exception releases the key. Preserve legacy routes by default.

## Coupled work

1. **Architect:** finalize this contract and prompts; after Inspector test paths exist, bind real sensors to applicable existing invariants in `law/trace.json` in an Architect commit. Creating a new invariant needs a separate Owner receipt under the forbidden-action policy. If schema changes are needed, specify them before Engineer migration work. Obtain cross-family prompt PASS before dispatch.
2. **Inspector:** write failing sensors first in `packages/backend/test`, `packages/idempotency/test`, `packages/data/test`, and `test/db` only as needed. Prove real Nest/PostgreSQL, application-role RLS, rollback, same-connection identity, replay, scope/canonical JSON, 409, status policy and actor rejection. Do not edit production or weaken tests. Hand back the red result and test inventory.
3. **Engineer:** implement only against the approved contract and Inspector sensors in `packages/backend`, `packages/idempotency`, and `packages/data`; make the gate green. Add migration/DDL/seed only if the design requires it, with the required database tests already defined by Inspector. Add a fixed-group changeset and migration guidance; do not edit tests or law.
4. **Maestro:** perform authorized trace/API baseline/package README rebinds, check role-separated commits, run focused and full gates, obtain independent delivery review, and handle PR/release. No Inspector/Engineer dispatch until prompt review passes and CTG-0004 predecessor checkpoint is satisfied.

## Verification and release evidence

Run focused unit, integration and real database tests, `pnpm check:rls-negative`, `pnpm check:rls-smoke`, API baseline comparison, `pnpm check:trace`, and the affected package build/typecheck/lint. Then run `pnpm ci:stynx` and reference consumers at the reviewed HEAD. Record transaction role and connection proof, exact red/green commands, DDL/seed/test disposition, migration application from empty database, conformance mapping of UPS-TXN-01…05 to published symbols and tests, and any explicit uncertainty. The release remains subject to the R-0002 RC/final policy.
