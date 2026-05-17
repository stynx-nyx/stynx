# PORM-FLOW-02 - Engineer: Implement Flow Data Model And Migration

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/02-data-model`
**Depends on:** `PORM-FLOW-01`
**Scope:** STYNX Flow data model only. No CMS.

## Goal

Implement the STYNX Flow database model and TypeScript schema from PORM Flow behavior while satisfying STYNX data invariants.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `../porm/database/flow/ddl.sql`
- `../porm/database/flow/rls.sql`
- `../porm/database/flow/audit.sql`
- `packages/data/migrations/platform/0010_data_helpers.sql`
- `packages/data/migrations/platform/0011_storage.sql`
- `packages/data/src/schema/*.ts`
- `packages/data/test/integration/migrations.spec.ts`
- `packages/data/test/integration/soft-delete.spec.ts`

## Write Scope

Allowed:

- `packages/data/migrations/platform/0014_flow.sql`
- `packages/data/src/schema/flow.ts`
- `packages/data/src/schema/index.ts`

Do not edit:

- `packages/flow`
- `packages-web/angular-flow`
- test files; Inspector prompt 06 owns test coverage
- any CMS path
- `.devai/state/*`

## Required Database Model

Create schema `flow` and implement the PORM feature set with STYNX constraints.

Port the conceptual table groups from PORM:

- design: `scopes`, `graphs`, `nodes`, `edges`, `agent_rules`, `transition_effects`, `policy_sets`, `policy_rules`;
- runtime: `runs`, `node_runs`, `tasks`, `events`;
- forms: `forms`, `questions`, `scores`, `fills`, `answers`, `waivers`, `node_form_rules`.

Use these enum concepts from PORM unless the docs from prompt 01 changed them:

- `node_kind`: `human`, `auto`, `system`, `start`, `end`, `gateway`
- `decision_policy`: `all`, `any`, `quorum`
- `run_status`: `active`, `completed`, `canceled`
- `node_run_status`: `pending`, `in_progress`, `completed`, `canceled`
- `task_status`: `open`, `completed`, `expired`, `canceled`
- `agent_rule_type`: `permission`, `user`, `resolver_fn`
- `gating_mode`: `all_required`, `any`, `threshold`
- `field_type`: `boolean`, `string`, `text`, `number`, `date`, `select`, `multiselect`, `file`, `url`, `cnpj`, `email`
- `event_kind`: preserve PORM event coverage and add only if tests require it
- `policy_effect`: `allow`, `deny`

## STYNX Requirements

- Every tenant-scoped table must have `tenant_id uuid not null`.
- Every mutable tenant-scoped table must be created with `data.create_soft_deletable_table`.
- `flow.events` is append-only and no-soft-delete. Add an explicit migration comment explaining this.
- Enable and force RLS on every Flow table.
- RLS must use `NULLIF(current_setting('app.tenant_id', true), '')::uuid`.
- Do not use PORM `auth.*` helper functions or `auth.app_user_id` GUC names.
- Enable audit for no-soft-delete tables explicitly; soft-delete helper should handle the others.
- Add indexes for tenant plus high-cardinality lookup paths:
  - graph by tenant/code/version/scope;
  - nodes by graph/code;
  - edges by graph/from/action;
  - runs by tenant/scope/target/status;
  - tasks by tenant/assignee/status;
  - events by run/created_at;
  - fills by target/form.

## Runtime Functions

Port the PORM runtime functions only after adapting to STYNX tenant/session context:

- `forms_facts`
- `build_facts`
- `eval_rule`
- `resolve_agents`
- `run_ensure`
- `node_open`
- `task_complete`
- `task_assign`
- `task_unassign`
- `task_accept`
- `task_decline`
- `task_unaccept`
- `task_withdraw`
- `node_try_complete`
- `signal_changed`

Do not hard-code CMS or PORM domain effects. Domain behavior must flow through registered scope adapter functions or later service hooks.

## TypeScript Schema

Create `packages/data/src/schema/flow.ts` with Drizzle table definitions matching the new migration. Export it from `packages/data/src/schema/index.ts`.

Follow existing schema style in:

- `packages/data/src/schema/storage.ts`
- `packages/data/src/schema/auth.ts`
- `packages/data/src/schema/tenancy.ts`

## Verification

Run:

```sh
pnpm --filter @stynx/data typecheck
pnpm --filter @stynx/data test:int
pnpm db:verify
pnpm lint:migrations
git diff --name-only
git diff --check
```

If Testcontainers or PostgreSQL is unavailable, capture the exact failure and run all static checks that do not require the missing service.

## Acceptance Criteria

- Flow migration applies from an empty database.
- Migration linter accepts the new Flow DDL.
- `flow.events` has explicit no-soft-delete rationale.
- No Flow table lacks tenant RLS unless documented as non-tenant in `docs/architecture/flow.md`.
- Drizzle schema exports compile.
- No CMS files are changed.
