# PORM-FLOW-03 - Engineer: Create Backend Package Shell And Design API

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/03-backend-design`
**Depends on:** `PORM-FLOW-01`, `PORM-FLOW-02`
**Scope:** `@stynx/flow` package shell and workflow design API. No runtime task execution yet. No CMS.

## Goal

Create `packages/flow` as a STYNX backend package and implement the design-time Flow API: scopes, graphs, nodes, edges, agent rules, transition effects, node form rules, policy sets/rules, and graph import/export.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `packages/storage/package.json`
- `packages/audit/package.json`
- `packages/auth/src/decorators.ts`
- `packages/backend/src/audit/decorators.ts`
- `packages/backend/src/idempotency/*`
- `packages/data/src/database.ts`
- `../porm/backend/src/flow/flow.module.ts`
- `../porm/backend/src/flow/services/flow-design.service.ts`
- `../porm/backend/src/flow/services/flow-common.service.ts`
- `../porm/backend/src/flow/controllers/{scopes,graphs,nodes,edges,agent-rules,transition-effects,node-form-rules}.controller.ts`
- `../porm/backend/src/flow/dto/{scope,graph,node,edge,agent-rule,transition-effect,node-form-rule,graph-import}.dto.ts`
- `../porm/tests/backend/api/flow/{scopes,graphs_crud,graphs_nodes_edges,nodes_edges_crud,agent_and_form_rules_crud,flow_graphs_import_export,import_export,flow_graphs_design}.test.ts`

## Write Scope

Allowed:

- `packages/flow/**`
- root/package workspace metadata only if required by existing package conventions

Do not edit:

- runtime implementation beyond stubs needed for module compilation;
- `packages-web/angular-flow`;
- CMS paths;
- `.devai/state/*`.

## Package Shell

Create package files matching existing STYNX backend package conventions:

- `packages/flow/package.json`
- `packages/flow/tsconfig.json`
- `packages/flow/Vitest.config.cjs`
- `packages/flow/Vitest.integration.config.cjs`
- `packages/flow/README.md`
- `packages/flow/CHANGELOG.md`
- `packages/flow/LICENSE`
- `packages/flow/src/index.ts`
- `packages/flow/src/flow.module.ts`

The package must export:

- `StynxFlowModule`
- services implemented in this prompt
- public DTO/types needed by host apps

Use `@stynx/data`, `@stynx/auth`, and `@stynx/backend`. Do not import `pg` directly.

## Services And Controllers

Implement:

- `FlowDesignService`
- `FlowPolicyService` if policy tables are included in prompt 02
- controllers for scopes, graphs, nodes, edges, agent rules, transition effects, node form rules, policy sets/rules, import/export

Design API behavior must cover PORM's current surface:

- list/get/create/update/delete scopes;
- list/get/create/update/delete graphs;
- graph import/export;
- graph nodes and edges;
- node agent rules;
- node form rules;
- graph transition effects;
- policy set and rule CRUD if policy tables are included.

## STYNX Decorators

Apply route decorators:

- design reads: `@Permission('flow:read:design')`, `@ReadOnly()`;
- design writes: `@Permission('flow:write:design')`, `@Audit(...)`;
- graph import: `@Permission('flow:write:design')`, `@Audit(...)`, `@Idempotent('Idempotency-Key')`;
- no public Flow design routes.

Use existing decorator imports from live STYNX packages. If decorator locations differ, inspect package barrels and use the exported public surface.

## Implementation Rules

- Use `Database.tx`.
- Do not pass tenant IDs in application query filters except where writing `tenant_id` on insert. RLS owns tenant filtering.
- Use DTO validation consistent with STYNX package style.
- Graph import must validate node references, edge references, duplicate node codes, duplicate action edges where relevant, and missing start nodes.
- Graph export must not leak another tenant's graph due to RLS.
- Resolver functions and adapter function references must be opaque registered identifiers or database function references as defined in `docs/architecture/flow.md`; do not import host-domain code.

## Verification

Run:

```sh
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
pnpm lint:deps
pnpm lint:cycles
git diff --name-only
git diff --check
```

If tests are not yet meaningful because Inspector prompt 06 has not run, run typecheck/lint/build and document remaining test gaps in the final response. Do not create test files in this Engineer prompt.

## Acceptance Criteria

- `@stynx/flow` package builds and exports the design API.
- Design routes use STYNX decorators.
- No raw DB connections or PORM services are imported.
- No runtime domain branches exist.
- No CMS files are changed.
