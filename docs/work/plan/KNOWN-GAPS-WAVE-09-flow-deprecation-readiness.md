# Wave 09 — Flow Deprecation Readiness

**Roles:** Engineer implements; Inspector proves.
**Branch suggestion:** `known-gaps/09-flow-deprecation-readiness`.
**Primary gaps:** PF-04, PF-05, PF-06, PF-10, PF-12.

Purpose: Finish proof needed to deprecate ../porm local Flow module without reopening closed Flow gaps.

Inputs:
- docs/KNOWN_GAPS.md section 12
- docs/work/diag/porm-flow-gap-closure.md
- packages/flow/**
- packages-web/angular-flow/**
- reference/{api,web}/**
- ../porm/tests/backend/e2e/flow-*
- ../porm/tests/frontend/e2e/flow/**

Tasks:
1. Add representative full Nest HTTP request-pipeline tests for Flow route families: guards, interceptors, idempotency, audit writes, request context.
2. Port focused PORM Flow E2E journeys into stynx reference/package surfaces: task assignment/action, form answer/waiver execution, signal freshness, analytics smoke.
3. Evaluate whether richer visual/editor parity belongs in @stynx-web/angular-flow or remains a host extension point. Implement only generic framework UX.
4. Add a packaged Angular host store only if package-owned screens duplicate loading/selection/refresh/error orchestration.
5. Prepare consuming-repo cutover plan for ../porm, execute only when explicitly requested.

Acceptance:
- Flow route-family E2E proof broader than route metadata and service tests.
- Remaining visual/editor caveats explicit framework decisions.
- ../porm can consume packages through concrete cutover plan.

Verification:
pnpm --filter @stynx/flow test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx/reference-api test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test:int
pnpm --filter @stynx/reference-web test:e2e
git diff --check
