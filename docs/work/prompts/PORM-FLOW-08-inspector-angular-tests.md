# PORM-FLOW-08 - Inspector: Write Angular Flow Tests

**Discipline:** Inspector
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/08-angular-tests`
**Depends on:** `PORM-FLOW-07`
**Scope:** Angular Flow tests only. No CMS.

## Goal

Create package-level tests for `@stynx-web/angular-flow` that cover the host-mountable Flow UI, SDK integration, permissions, and component behavior derived from PORM Flow frontend tests.

## Required Reading

Read:

- `packages-web/angular-flow/src/**`
- `packages-web/angular-storage/test/angular-storage.spec.ts`
- `packages-web/angular-ui/test/angular-ui.spec.ts`
- `packages-web/angular-auth/test/angular-auth.spec.ts`
- `../porm/tests/frontend/e2e/flow/routes/flow-routes.spec.ts`
- `../porm/tests/frontend/e2e/flow/tasks/flow-tasks.spec.ts`
- `../porm/tests/frontend/e2e/flow/forms/flow-fills-loading.spec.ts`
- `../porm/frontend/src/app/flow/components/**`
- `../porm/frontend/src/app/flow/tasks/**`

## Write Scope

Allowed:

- `packages-web/angular-flow/test/**`
- `packages-web/angular-flow/jest.config.cjs`
- `packages-web/angular-flow/tsconfig.spec.json`
- test fixtures/helpers under `packages-web/angular-flow/test`

Do not edit production code. If production code needs testability exports or fixes, document the exact missing seam and expected Engineer follow-up.

Do not edit CMS files.

## Required Tests

Write tests for:

- package exports are stable;
- route helper exports expected route concepts;
- API service calls expected Flow endpoints through mocked STYNX SDK/transport;
- graph designer renders sample scope/graph/nodes/edges;
- graph canvas handles missing Cytoscape dependency with the documented fallback;
- forms page renders and opens create/edit flows;
- fill editor renders answers and emits save commands;
- waivers page opens create/delete/update actions;
- task list/card render open tasks;
- task action dialog emits act/assign/unassign/accept/decline/unaccept/withdraw commands;
- permission-aware controls hide mutations when permission is absent.

Convert PORM E2E route expectations into package tests where practical. Do not require a full host app unless this package already has an established E2E harness.

## Verification

Run:

```sh
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow build
git diff --name-only
git diff --check
```

## Acceptance Criteria

- Angular Flow tests cover routes, services, graph UI, forms/fills, waivers, tasks, and permissions.
- Tests do not depend on PORM app routes or CMS modules.
- No CMS files are changed.
