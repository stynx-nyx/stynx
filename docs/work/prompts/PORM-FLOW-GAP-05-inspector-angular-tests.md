# PORM-FLOW-GAP-05 - Inspector: Write Real Angular Flow Tests

**Discipline:** Inspector
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-04`
**Scope:** Angular package tests and test-intent config only. No production code. No CMS.

## Goal

Replace the weak Angular test pass identified in the reassessment with real package tests for `@stynx-web/angular-flow`. The command must no longer rely on `passWithNoTests`.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- updated `docs/contracts/flow-api.md`
- `packages-web/angular-flow/src/**`
- `packages-web/angular-flow/jest.config.cjs`
- `packages-web/angular-flow/tsconfig.spec.json`
- sibling package tests:
  - `packages-web/angular-auth/test/**`
  - `packages-web/angular-storage/test/**`
  - `packages-web/angular-ui/test/**`
- PORM frontend evidence:
  - `../porm/frontend/src/app/flow/flow.module.ts`
  - `../porm/frontend/src/app/flow/services/flow-api.service.ts`
  - `../porm/frontend/src/app/flow/services/flow-runs.service.ts`
  - `../porm/frontend/src/app/flow/services/flow-tasks.service.ts`
  - `../porm/frontend/src/app/flow/components/**`
  - `../porm/frontend/src/app/flow/tasks/**`
  - `../porm/tests/frontend/e2e/flow/routes/flow-routes.spec.ts`
  - `../porm/tests/frontend/e2e/flow/tasks/flow-tasks.spec.ts`
  - `../porm/tests/frontend/e2e/flow/forms/flow-fills-loading.spec.ts`

## Write Scope

Allowed:

- `packages-web/angular-flow/test/**`
- `packages-web/angular-flow/jest.config.cjs`
- `packages-web/angular-flow/tsconfig.spec.json`
- test fixtures/helpers under `packages-web/angular-flow/test/**`

Do not edit:

- `packages-web/angular-flow/src/**`
- backend packages
- migrations
- `.devai/state/**`
- CMS files

## Required Tests

Add tests for:

1. Package exports.
2. Route helper shape, including PORM-derived route concepts and STYNX route names.
3. `FlowApiService` endpoint coverage for every route family in `docs/contracts/flow-api.md`.
4. API methods for scopes, graphs, nodes, edges, agent rules, transition effects, forms, questions, scores, fills, answers, waivers, runs, events, node runs, tasks, analytics, policies, signal/effect flows.
5. Graph designer and graph canvas rendering with stable empty/loading/error states.
6. Forms/fills editor behavior: load questions/answers, emit save, support bulk answer upsert where contracted.
7. Waiver list/detail actions: create, update, delete.
8. Task actions: act, assign, unassign, accept, decline, unaccept, withdraw, candidate lookup, role users, user lookup.
9. Permission-aware controls hide or disable mutations when permission is absent.
10. Component route-param binding expectations for scope, graph, form, and fill ids.

## Test Config Rules

- Remove `passWithNoTests: true` or make it irrelevant because tests exist.
- Keep build output free of test files.
- Do not add ambient shims that hide missing production exports.

## Verification

Run:

```sh
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow build
git diff --check
git status --short --branch
```

If tests fail because production behavior is missing, keep the tests and report the failing test names as expected handoff to `PORM-FLOW-GAP-06`.

## Acceptance Criteria

- `packages-web/angular-flow/test/**` exists and is meaningful.
- Test command exercises real tests.
- Production code is not changed by this Inspector prompt.
- No CMS files are changed.
