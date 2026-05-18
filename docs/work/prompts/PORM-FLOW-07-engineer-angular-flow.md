# PORM-FLOW-07 - Engineer: Create Angular Flow Package

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/07-angular-flow`
**Depends on:** `PORM-FLOW-03`, `PORM-FLOW-04`, `PORM-FLOW-05`
**Scope:** `@stynx-web/angular-flow`. No CMS.

## Goal

Create `packages-web/angular-flow` as a host-mountable Angular package for Flow graph design, tasks, forms, fills, waivers, and analytics. Port PORM frontend behavior into STYNX package conventions without copying PORM app routing or role guards.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `packages-web/angular-storage/package.json`
- `packages-web/angular-storage/src/**`
- `packages-web/angular-ui/src/**`
- `packages-web/angular-auth/src/**`
- `packages-web/sdk/src/**`
- `../porm/frontend/src/app/flow/flow.module.ts`
- `../porm/frontend/src/app/flow/services/*.ts`
- `../porm/frontend/src/app/flow/models/*.ts`
- `../porm/frontend/src/app/flow/components/**`
- `../porm/frontend/src/app/flow/tasks/**`
- `../porm/tests/frontend/e2e/flow/**`

## Write Scope

Allowed:

- `packages-web/angular-flow/**`
- root/package workspace metadata only if required by existing package conventions

Do not edit:

- `packages-web/angular-cms`
- CMS paths;
- backend Flow package except exported types needed by the Angular package and already public;
- `.devai/state/*`.

## Package Shell

Create package files matching existing Angular packages:

- `packages-web/angular-flow/package.json`
- `packages-web/angular-flow/tsconfig.json`
- `packages-web/angular-flow/tsconfig.spec.json`
- `packages-web/angular-flow/Vitest.config.cjs`
- `packages-web/angular-flow/README.md`
- `packages-web/angular-flow/CHANGELOG.md`
- `packages-web/angular-flow/LICENSE`
- `packages-web/angular-flow/src/index.ts`

Package name: `@stynx-web/angular-flow`.

## Required Components And Services

Implement host-mountable surfaces:

- Flow API service using `@stynx-web/sdk`;
- typed models for scopes, graphs, nodes, edges, rules, effects, runs, tasks, forms, fills, answers, waivers;
- graph designer component;
- graph canvas component;
- graph/node/edge/rule/effect dialogs;
- forms list/editor;
- questions and score management;
- fills list/editor;
- waivers page/dialog;
- task list/card/list item;
- task assignment/action dialog;
- optional analytics/open-tasks component if backend API exists.

Use `@stynx-web/angular-auth` permissions instead of PORM `RoleGuard`.

## Dependency Decision

For Cytoscape:

- Prefer explicit peer dependencies if the package can render a clear fallback without them.
- If bundling is necessary for build/test reliability, add dependencies directly and justify the choice in `README.md`.
- Do not leave loose `any` renderer dependencies without a documented fallback.

## Route Model

Do not copy PORM app routes as the only integration path. Export route helpers such as:

- `provideFlowRoutes()` or `FLOW_ROUTES`;
- standalone components that host apps can mount under any prefix.

Default routes may mirror PORM concepts:

- `scopes`
- `scopes/:scopeId/graphs/:graphId`
- `forms`
- `forms/:formId`
- `fills`
- `fills/:fillId`
- `assignments`
- `waivers`

## Verification

Run:

```sh
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow build
pnpm lint:deps
pnpm lint:cycles
git diff --name-only
git diff --check
```

If package tests are not yet complete because Inspector prompt 08 has not run, run typecheck/lint/build and document remaining gaps. Do not create test files in this Engineer prompt.

## Acceptance Criteria

- `@stynx-web/angular-flow` package builds and exports host-mountable components/routes/services.
- UI uses STYNX SDK and permission packages, not PORM role guards.
- Cytoscape dependency behavior is explicit.
- No CMS files are changed.
