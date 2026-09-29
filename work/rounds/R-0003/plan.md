# R-0003 — post-1.5.0 debt closure

**Current role:** Architect. **Status:** active. **Base:**
`64d7906682d00ea929e1b48cb7b67e477a46766a` (published STYNX 1.5.0
plus postrelease evidence). The root checkout is preserved; work proceeds in
the existing clean Codex worktree on `codex/post-1-5-0-debt`.

## Scope

1. Reconcile all 76 C-0002 requirement IDs against the published 1.5.0
   receipts and close GitHub issues #289–307 only after each checklist has
   evidence. Remove stale prepublication language from the ledger.
2. Close nonblocking CTG5 documentation and CTG9 OFS/SIG sensor gaps without
   weakening tests. Rebind `law/trace.json` after Inspector changes.
3. Triage and remediate the five open Dependabot alerts under the repository
   security-auditor procedure; preserve the fixed package group and release
   policy.
4. Complete or explicitly retire R-0001's queued TASK-0003/0004 and reconcile
   the pilot's active marker through supported DEVAI actions. Revalidate the
   historical k6 known gap; improve the one-run comparison only under an ADR
   and the exact workflow-edit receipt.
5. Resolve Owner issues #222–225: a coherent visibility decision, reconciled
   ref protection, exact legacy deprecation approval/action, and positive
   credential governance verification. Do not disclose token material.
6. Plan and execute PF-06 PORM Flow consumer cutover in the PORM repository,
   including Angular compatibility and a data-preserving schema transition.
   Preserve PORM's own authority and user data.
7. Close the DEVAI 100% coverage and signed local-RC evidence debt with
   meaningful tests and an exact candidate observation.
8. Resolve #306's additional request-path constraint with a tenant-scoped
   public outbox dispatch/ACK path under `stynx_app` and RLS. Keep the
   existing owner/system dispatch path for internal cross-tenant control.

DETRAN R-0022…R-0024 packed-consumer and domain-equivalence proofs are
explicitly out of scope. No writes to DETRAN.

## Sequence and roles

Architect records contracts and documentation; Inspector strengthens sensors;
Engineer changes implementation and dependency graph. Commits remain
role-separated. Only the maestro runs Git and operates GitHub. No test or gate
may be weakened to make work pass. Each external setting/deprecation/workflow
mutation is reviewed against the exact Owner receipt rule before execution.

## Checkpoints

- Capture current state and evidence for each debt before mutation.
- Run focused checks after each change and the applicable full gates before PR.
- Reconcile generated API/trace/package files with supported generators.
- Do not close an issue until its acceptance evidence is attached.
- Record blockers and exact next action in `record.md` if a dependency requires
  Owner-only information or an action-specific receipt.

## Contract decisions for remaining product gaps

- Postrelease patch: the Owner's direction to complete the remaining STYNX
  work includes the fixed-group patch generated from the R-0003 changeset.
  An authenticated 44-package census on 2026-09-29 found `latest=1.5.0`
  and `rc=1.5.0-rc.2` throughout. The Architect policy binds the next exact
  candidate to 1.5.1, with preflight latest 1.5.0. An exact-main-SHA
  publication receipt remains required when the merged SHA is known.
- Release preparation recognizes the exact stable patch marker
  `chore(repo): version fixed group to 1.5.1` after the 1.5.0 base. It must
  prove a single consumed changeset, all 44 manifests and changelogs at
  1.5.1, no pre mode, and a bounded set of policy, sensor and R-0003 evidence
  follow-ups. The root manifest must equal the version marker after follow-up
  commits. Invalid or duplicate markers fail closed; earlier 1.5.0 final and
  RC classifiers retain their contracts. A valid patch candidate produces an
  empty release status because the changeset was consumed by versioning.

- OD-R0003-02 (2026-09-29): `origin/main` later introduced the independently
  approved session-policy HTTP patch with an unconsumed Changeset. The
  integration made the former 1.5.1 candidate invalid under the exact patch
  classifier; Opus delivery-review 5 returned FAIL, and `pnpm release:status`
  reproduced `RELEASE_CONTEXT_PATCH_INVALID`. Under the Owner's standing
  authorization to finish the campaign, the next fixed-group release is the
  generator-computed 1.5.2 patch. Consume the session Changeset through
  `pnpm version-packages`, bind a second exact version marker and its bounded
  follow-up contract, update the registry anomaly policy for 1.5.2, and
  repeat local CI, 44-package coverage, signed RC and cross-family review.
  The original 1.5.1 marker remains historical evidence.

- CTG5: add an optional positive `deadlineMs` to transactional-command
  module/route options. Pass it to `Database.tx` as PostgreSQL
  `statement_timeout` for each statement. Keep `lockTimeoutMs` scoped to the
  idempotency reservation; neither setting promises an end-to-end wall-clock
  deadline. A timeout in audit remains a dependency failure, with rollback of
  domain, audit and idempotency writes.
- OBX: expose tenant-scoped dispatch and ACK entry points whose tenant comes
  only from trusted `RequestContext`. Run claim, persistence and ACK under
  `Database.tx({role:'app',requireActor:true,retry:false})`; use explicit
  `tenant_id` predicates in addition to FORCE RLS. The transport may run
  outside a transaction, with attempt updates in new app-role transactions.
  Invalid HMAC and cross-tenant identities do not perform a domain lookup or
  owner-role fallback. Existing owner methods remain internal-control paths.
  An additive migration may grant `stynx_app` the minimum missing update
  privilege on attempt ledger rows. The grant is column-scoped to request
  result evidence. A database trigger permits app-role updates only once,
  from an uncompleted `CLAIMED` attempt to a terminal `SENT` or `ERROR`;
  completed and migrated legacy rows are immutable to the app role. Tests
  must use real PostgreSQL, two tenants, and verify absence of cross-tenant
  writes and same-tenant evidence rewrites.
