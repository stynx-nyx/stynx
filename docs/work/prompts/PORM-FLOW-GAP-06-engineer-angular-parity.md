# PORM-FLOW-GAP-06 - Engineer: Implement Angular Flow Parity

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-05`
**Scope:** Angular Flow production package. No backend production changes unless tests expose a pure type-contract mismatch. No CMS.

## Goal

Implement the Angular API facade and host-mountable UI behavior required by `PORM-FLOW-GAP-05` and the backend contract.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- updated `docs/contracts/flow-api.md`
- `packages-web/angular-flow/test/**`
- `packages-web/angular-flow/src/**`
- sibling packages:
  - `packages-web/angular-auth/src/**`
  - `packages-web/angular-ui/src/**`
  - `packages-web/sdk/src/**`
- PORM frontend evidence under `../porm/frontend/src/app/flow/**`

## Write Scope

Allowed:

- `packages-web/angular-flow/src/**`
- `packages-web/angular-flow/README.md`
- `packages-web/angular-flow/CHANGELOG.md`
- `packages-web/angular-flow/package.json` only if a package dependency is genuinely required

Do not edit:

- backend packages except for a documented, minimal type-contract correction required by Angular compile
- tests unless production implementation reveals a test bug that must be returned to Inspector
- `.devai/state/**`
- CMS files

## Required Implementation

Implement:

1. Full `FlowApiService` coverage for the backend contract.
2. Route-param aware components for scope, graph, form, fill, task, and analytics views.
3. Graph designer actions for node, edge, agent rule, form rule, and transition effect operations.
4. Form and fill editors with answer load/save and bulk answer support where contracted.
5. Waiver create/update/delete flows.
6. Task action commands for act, assign, unassign, accept, decline, unaccept, withdraw, candidates, role users, and user lookup.
7. Permission-aware controls using existing STYNX Angular auth/UI patterns.
8. Stable loading, empty, error, and readonly states.
9. Dependency-light graph canvas fallback that does not require Cytoscape unless the Architect contract explicitly adds that dependency.

## Verification

Run:

```sh
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow build
pnpm lint:deps
pnpm lint:cycles
git diff --check
git status --short --branch
```

## Acceptance Criteria

- Angular tests from `PORM-FLOW-GAP-05` pass without weakening.
- Package build emits declarations and advertised entrypoints.
- API facade maps to every backend route family in `docs/contracts/flow-api.md`.
- Components are host-mountable, permission-aware, and not coupled to PORM or CMS.
