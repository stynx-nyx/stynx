# CTG-0005 — transactional audit and idempotency

**Current role:** Architect. **State:** prompt-review cycle 1 REVIEW repaired; no Inspector/Engineer dispatched. **Topological predecessors:** CTG-0003 authz/session and CTG-0004 jobs. **Source:** DETRAN C-0002 §6.2 (read only), UPS-TXN-01…05, all MUST under OD-S15-01.

## Boundary and locks

The proposed reference is `docs/framework/contracts/transactional-audit-idempotency-1.5.md`. Owned paths: `packages/contracts`, `packages/audit`, `packages/backend` (audit and new command boundary plus `package.json`), `packages/idempotency`, `packages/data`, platform migration `0020_transactional_commands.sql`, canonical `database/ddl`/seed, `test/db`, affected reference consumers and fixed-group changeset. The unexported `packages/backend/src/idempotency` duplicate is untouched. CTG-0005 does not own CTG-0004 schedule or worker behavior. Avoid simultaneous `packages/data`, shared RLS fixtures or manifest edits. Declare separate `(F1, transaction)`, `(F3, backend/audit/contracts/idempotency/data)`, and `(F2, same package paths)` semantic locks; release at role boundaries. The Architect contract, Inspector tests and Engineer implementation use separate commits.

### Predecessor dispatch gate

Inspector prompt 61 is **blocked** until both rows are complete and recorded here, with the exact contract commit SHA and prompt-review PASS receipt path. Integrate CTG-0003 and CTG-0004 into this worktree before writing red tests; the current branch is based on `a3c81645` and is insufficient. CTG-0004 currently has two REVIEW results and Owner escalation pending. An Architect-only draft or REVIEW does not meet this gate.

| CTG                | Contract commit SHA | Cross-family prompt PASS receipt | Integrated HEAD | State   |
| ------------------ | ------------------- | -------------------------------- | --------------- | ------- |
| 0003 authz/session | pending             | pending                          | pending         | blocked |
| 0004 jobs          | pending             | pending                          | pending         | blocked |

## Baseline and design decisions

- `Database.tx` uses CLS for a live client and savepoints, but its nested branch does not validate requested role or identity against the actual connection. `TxOptions` lacks `requireActor`. The application role already requires tenant and actor.
- `AuditInterceptor` currently writes after handler emission through an independent `AuditSink` and catches/logs write failures.
- `IdempotencyInterceptor` currently has fixed tenant/user/route scope, a hand-rolled stable stringifier, 422 on body mismatch, status `<500` persistence and a Redis path. `DatabaseIdempotencyStore` starts owner-role transactions for reservation and completion. These are not command transaction semantics.
- Choose `@TransactionalCommand`/`StynxTransactionalCommandModule` as the sole boundary, with `@Audit({transactional:true})` and `@Idempotent({transactional:true})` participants. It uses app-role `Database.tx` with `retry:false`; it catches only `CommittedCommandError` inside the transaction. Plain thrown 502 rolls back. Key identity is tenant+scope+supplied key; method and concrete path are fingerprint inputs. App-role audit uses the restricted `audit.write_command_event` wrapper in migration 0020, keeping the hash chain. Cache publication follows commit. Preserve legacy routes by default.

## Coupled work

1. **Architect:** finalize this contract and prompts; after Inspector test paths exist, bind real sensors to applicable existing invariants in `law/trace.json` in an Architect commit. Creating a new invariant needs a separate Owner receipt under the forbidden-action policy. If schema changes are needed, specify them before Engineer migration work. Obtain cross-family prompt PASS before dispatch.
2. **Inspector:** write failing sensors first in `packages/audit/test`, `packages/idempotency/test`, `packages/data/test`, `test/db`, and the Nest HTTP integration harness where PostgreSQL dependencies already exist (`packages/audit/test` or a root integration test). A backend test may require a `devDependency`; route its manifest/lockfile edit to the Engineer after the red sensor is saved. Prove real app-role audit, RLS, rollback, same connection, replay, canonical JSON, route/tenant isolation, 409, status and actor handling. Preserve legacy sensors. Hand back red result/inventory.
3. **Engineer:** implement the approved surface in `packages/contracts`, `packages/audit`, `packages/backend`, `packages/idempotency`, `packages/data`, with migration 0020, canonical DDL and seeds as applicable. Own required `package.json` and lockfile edits, fixed-group changeset and consumer migration note. Do not edit tests or law.
4. **Architect maestro:** perform trace and API baseline rebinds in **separate Architect-role commits**; law commits are authored `DEVAI Architect`. **Engineer maestro:** perform package README write/check and implementation commits. Then run focused/full gates, independent delivery review, PR/release. No Inspector/Engineer dispatch until cycle-2 prompt PASS and both predecessor rows above are complete.

## Verification and release evidence

Run focused unit, integration and real database tests, `pnpm check:rls-negative`, `pnpm check:rls-smoke`, API baseline comparison, `pnpm check:trace`, and the affected package build/typecheck/lint. Then run `pnpm ci:stynx` and reference consumers at the reviewed HEAD. Record transaction role and connection proof, exact red/green commands, DDL/seed/test disposition, migration application from empty database, conformance mapping of UPS-TXN-01…05 to published symbols and tests, and any explicit uncertainty. The release remains subject to the R-0002 RC/final policy.
