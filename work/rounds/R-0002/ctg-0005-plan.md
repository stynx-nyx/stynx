# CTG-0005 — transactional audit and idempotency

**Current role:** Architect. **State:** Opus prompt-review cycle 3 returned PASS on the behavioral contract. OD-S15-02 replaces intermediate PR/RC/full-CI cadence; the revised flow prompt-review and predecessor reconciliation precede Inspector dispatch. **Topological predecessors:** CTG-0003 authz/session and CTG-0004 jobs. **Source:** DETRAN C-0002 §6.2 (read only), UPS-TXN-01…05, all MUST under OD-S15-01.

## Boundary and locks

The proposed reference is `docs/framework/contracts/transactional-audit-idempotency-1.5.md`. Owned paths: `packages/contracts`, `packages/audit`, `packages/backend` (audit and new command boundary plus `package.json`), `packages/idempotency`, `packages/data`, platform migration `0020_transactional_commands.sql`, canonical `database/ddl`/seed, `test/db`, affected reference consumers and fixed-group changeset. The unexported `packages/backend/src/idempotency` duplicate is untouched. CTG-0005 does not own CTG-0004 schedule or worker behavior. Avoid simultaneous `packages/data`, shared RLS fixtures or manifest edits. Declare separate `(F1, transaction)`, `(F3, backend/audit/contracts/idempotency/data)`, and `(F2, same package paths)` semantic locks; release at role boundaries. The Architect contract, Inspector tests and Engineer implementation use separate commits.

### Predecessor dispatch gate

Inspector prompt 61 remains **blocked** until both rows contain exact contract and implementation SHAs, prompt/delivery PASS receipts, and the cumulative campaign HEAD. CTG-0003 is merged in `main` `48b42874`; CTG-0004 is implemented at `3a69785a` with final delivery-review PASS, but has no PR by OD-S15-02. The maestro must place the CTG4 tree on the cumulative branch and bring this worktree to that checkpoint before red tests. No CTG4 merge into `main` is required. This branch's old `a3c81645` base is insufficient.

| CTG                | Contract/implementation SHA | Cross-family PASS receipt                                                  | Cumulative HEAD | State                         |
| ------------------ | --------------------------- | -------------------------------------------------------------------------- | --------------- | ----------------------------- |
| 0003 authz/session | `48b42874` main             | `record.md` CTG3                                                           | `493fcd95` main | behavior available; reconcile |
| 0004 jobs          | `3a69785a`                  | `reviews/ctg4-final-delivery-review-2.json` in R-0002 conformance worktree | pending import  | PASS; import/reconcile        |

After both predecessors are integrated, the Architect must compare the frozen CTG-0003/0004 contracts and implemented behavior with this contract's assumptions: `RequestContext.actorId` as trusted default scope, the configured nominal or verified actor on a public route, and nested command transaction role/tenant/actor constraints. Record that reconciliation here with source SHAs before Inspector dispatch. If any assumption changes, amend the contract and obtain a new cross-family prompt-review PASS on the amended version. A predecessor row alone is insufficient.

## Baseline and design decisions

- `Database.tx` uses CLS for a live client and savepoints, but its nested branch does not validate requested role or identity against the actual connection. `TxOptions` lacks `requireActor`. The application role already requires tenant and actor.
- `AuditInterceptor` currently writes after handler emission through an independent `AuditSink` and catches/logs write failures.
- `IdempotencyInterceptor` currently has fixed tenant/user/route scope, a hand-rolled stable stringifier, 422 on body mismatch, status `<500` persistence and a Redis path. `DatabaseIdempotencyStore` starts owner-role transactions for reservation and completion. These are not command transaction semantics.
- Choose `@TransactionalCommand`/`StynxTransactionalCommandModule` as the sole boundary, with `@Audit({transactional:true})` and `@Idempotent({transactional:true})` participants. It uses app-role `Database.tx` with `retry:false`; it catches only `CommittedCommandError` inside the transaction. Plain thrown 502 rolls back. Key identity is tenant+scope+supplied key; method and concrete path are fingerprint inputs. App-role audit uses the restricted `audit.write_command_event` wrapper in migration 0020, keeping the hash chain. Cache publication follows commit. Preserve legacy routes by default.

## Coupled work

1. **Architect:** finalize this contract and prompts; after Inspector test paths exist, bind real sensors to applicable existing invariants in `law/trace.json` in an Architect commit. Creating a new invariant needs a separate Owner receipt under the forbidden-action policy. If schema changes are needed, specify them before Engineer migration work. Obtain cross-family prompt PASS before dispatch.
2. **Inspector:** write failing sensors first in `packages/audit/test`, `packages/idempotency/test`, `packages/data/test`, `test/db`, and the Nest HTTP integration harness where PostgreSQL dependencies already exist (`packages/audit/test` or a root integration test). A backend test may require a `devDependency`; route its manifest/lockfile edit to the Engineer after the red sensor is saved. Prove real app-role audit, RLS, rollback, same connection, replay, canonical JSON, route/tenant isolation, 409, status and actor handling. Preserve legacy sensors. Hand back red result/inventory.
3. **Engineer:** implement the approved surface in `packages/contracts`, `packages/audit`, `packages/backend`, `packages/idempotency`, `packages/data`, with migration 0020, canonical DDL and seeds as applicable. Own required `package.json` and lockfile edits, fixed-group changeset and consumer migration note. Do not edit tests or law.
4. **Architect maestro:** perform trace and API baseline rebinds in **separate Architect-role commits**; law commits are authored `DEVAI Architect`. **Engineer maestro:** perform package README write/check and implementation commits. Run focused gates and independent delivery-review, then import the role-separated work into the cumulative branch. The one full local CI, PR, remote CI and final publication are deferred until CTG8. No Inspector/Engineer dispatch until the revised prompt-review PASS, both predecessor rows above, and the reconciliation checkpoint are complete.

## Verification and release evidence

Run focused unit, integration and real database tests, `pnpm check:rls-negative`, `pnpm check:rls-smoke`, API baseline comparison, `pnpm check:trace`, and the affected package build/typecheck/lint. Do not run full `pnpm ci:stynx` or reference-consumer CI for this CTG alone; they are one consolidated final gate after CTG8. Record transaction role and connection proof, exact red/green commands, DDL/seed/test disposition, migration application from empty database, conformance mapping of UPS-TXN-01…05 to real symbols and tests, and any explicit uncertainty. No RC publication or CTG-specific PR.

Owner decision 2026-09-27: explicitly authorized the exceptional third prompt-review for CTGs 4–8 in this R-0002 session. This supersedes earlier pending-exception checkpoints. Inspector and Engineer dispatch still require an Opus PASS and all predecessor gates.

Prompt-review cycle 3: `reviews/ctg5-prompt-review-3.json` returned PASS. The Express wire-byte and filter-order clarifications are incorporated; this approval is conditional on CTG-0003/0004 integration and reconciliation before Inspector dispatch.
