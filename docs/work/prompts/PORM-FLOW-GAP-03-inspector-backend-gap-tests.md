# PORM-FLOW-GAP-03 - Inspector: Write Backend Gap Tests

**Discipline:** Inspector
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-02`
**Scope:** Backend/database/API tests only. No production code. No CMS.

## Goal

Write tests that lock the backend behavior required by the gap-closure contracts from `PORM-FLOW-GAP-02`. Tests may initially fail until `PORM-FLOW-GAP-04` implements the behavior; do not weaken existing tests to make them pass.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- updated `docs/architecture/flow.md`
- updated `docs/contracts/flow-api.md`
- `packages/flow/test/**`
- `packages/flow/src/controllers/**`
- `packages/flow/src/flow-runtime.service.ts`
- `packages/flow/src/flow-forms.service.ts`
- `packages/flow/src/flow-analytics.service.ts`
- `packages/flow/src/flow-policy.service.ts`
- `packages/data/migrations/platform/0014_flow.sql`
- PORM tests:
  - `../porm/tests/backend/api/flow/fills_answers_waivers_crud.test.ts`
  - `../porm/tests/backend/api/flow/flow_forms_fills_answers_waivers.test.ts`
  - `../porm/tests/backend/api/flow/analytics_views.test.ts`
  - `../porm/tests/backend/api/flow/flow-task-privileges.test.ts`
  - `../porm/tests/backend/unit/flow-policy.service.test.ts`
  - `../porm/tests/backend/unit/flow-runtime.service.test.ts`
  - `../porm/tests/backend/e2e/flow-tasks.e2e-spec.ts`

## Write Scope

Allowed:

- `packages/flow/test/**`
- package-local Jest config only if needed for test discovery
- test fixtures/helpers under `packages/flow/test/**`
- `packages/data/test/**` only if backend behavior requires DB migration assertions

Do not edit:

- production code
- migrations
- package manifests unless test discovery is impossible without config adjustment
- `.devai/state/**`
- CMS files

## Required Tests

Add focused tests for:

1. Effect dispatch calls `FlowDomainAdapter.applyEffect`, records success/failure events, and is retry-safe according to the Architect contract.
2. `resolver_fn` agent rules resolve through adapter behavior or produce the explicit deferred shape defined by the contract.
3. Node form rules gate human task completion according to the documented gating modes.
4. PORM-compatible fill and answer aliases exist, or documented contract-break behavior returns an explicit not-supported response.
5. Bulk answer upsert is idempotent by fill/question and preserves audit/idempotency expectations.
6. Form-scoped fill detail, answer, and waiver aliases respect tenant isolation and permissions.
7. Analytics endpoints support paging/filtering and return stable envelopes.
8. Task privilege semantics reject unauthorized actor operations for act, withdraw, assign, unassign, accept, decline, and candidate access.
9. Policy evaluation produces deterministic allow/deny outcomes if the Architect contract requires evaluation.
10. Representative HTTP/Nest route tests cover guards/interceptors/request context for one design route, one runtime route, one task route, one form/fill route, and one signal/effect route.

## Verification

Run as far as possible:

```sh
pnpm --filter @stynx/flow test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
git diff --check
git status --short --branch
```

If tests fail because production behavior is missing, keep the tests and report the failing test names as expected handoff to `PORM-FLOW-GAP-04`.

## Acceptance Criteria

- Tests describe every backend high/medium gap assigned to backend closure.
- Existing tests are not weakened.
- No production code or CMS files are changed.
