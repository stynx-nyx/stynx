# PORM-FLOW-04 - Engineer: Implement Runtime, Tasks, Events, And Adapters

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/04-backend-runtime`
**Depends on:** `PORM-FLOW-02`, `PORM-FLOW-03`
**Scope:** Flow runtime behavior in `@stynx/flow`. No CMS.

## Goal

Implement Flow runtime execution: run creation, node opening, task lifecycle, events, signal refresh, facts/adapters, and run/task APIs. Preserve PORM semantics while removing PORM/CMS hard-coding and aligning with STYNX tenancy and route contracts.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `packages/data/src/database.ts`
- `packages/data/src/transaction.ts`
- `../porm/database/flow/ddl.sql`, especially runtime functions from `run_ensure` through `signal_changed`
- `../porm/backend/src/flow/services/flow-runtime.service.ts`
- `../porm/backend/src/flow/controllers/{runs,node-runs,tasks,events,signal}.controller.ts`
- `../porm/backend/src/flow/dto/{run,node-run,task,event,signal}.dto.ts`
- `../porm/tests/backend/api/flow/{runs_nodes_tasks_events,runs_tasks_events,flow_runs,flow-task-privileges,flow_extra_negative,flow_misc}.test.ts`
- `../porm/tests/backend/e2e/flow-tasks.e2e-spec.ts`

## Write Scope

Allowed:

- `packages/flow/src/**`
- `packages/flow/README.md` if runtime docs need package-level notes
- `packages/data/migrations/platform/0014_flow.sql` only if prompt 02 left runtime functions incomplete

Do not edit:

- CMS files;
- PORM domain consumer code;
- frontend package files;
- `.devai/state/*`.

## Required Runtime Surface

Implement services/controllers for:

- ensure run for graph/scope/target;
- list/get/update run status;
- list run node runs;
- list run tasks;
- list run events;
- compute run facts;
- list node runs;
- list/get tasks;
- task actions: act, assign, unassign, accept, decline, unaccept, withdraw;
- candidate users;
- user lookup only if backed by STYNX auth APIs;
- signal target changed.

## Adapter Contract

Generic Flow may call only registered domain adapters:

- facts adapter;
- effect adapter;
- can-view adapter;
- can-manage adapter;
- optional resolver adapter.

Generic Flow must not reference:

- `cms.content`
- `porm.opportunity`
- `porm.proposal`
- `porm.engagement`
- any host application module

If an adapter fails, record a Flow event and surface a typed STYNX error. Do not swallow adapter failures silently.

## STYNX Decorators

Apply route decorators:

- runtime reads: `@Permission('flow:read:runtime')`, `@ReadOnly()`;
- task action: `@Permission('flow:execute:task')`, `@Audit(...)`, `@Idempotent('Idempotency-Key')`;
- task assignment: `@Permission('flow:assign:task')`, `@Audit(...)`, `@Idempotent('Idempotency-Key')`;
- signal: `@Permission('flow:execute:task')` or `@System()` depending on the route contract from prompt 01.

## Behavior Requirements

- A run starts at the graph start node and opens eligible next nodes.
- A task can only act with an allowed action for its current node.
- Completing a task writes an event.
- Completing a node traverses matching edges and opens next nodes.
- End nodes complete runs.
- Assignment, unassignment, accept, decline, unaccept, and withdraw preserve PORM behavior where it is generic.
- Notes are stored on events or task metadata as defined by the Flow contract.
- Runtime APIs use tenant RLS rather than explicit tenant filters.

## Verification

Run:

```sh
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
pnpm --filter @stynx/flow test:int
pnpm lint:cycles
git diff --name-only
git diff --check
```

If integration tests are blocked by PostgreSQL/Testcontainers availability, capture the exact failure and run all static/unit checks.

## Acceptance Criteria

- Runtime API compiles and follows STYNX decorators.
- No generic runtime code imports or references CMS/PORM domains.
- Task lifecycle and event writes are implemented.
- Adapter failures are observable.
- No CMS files are changed.
