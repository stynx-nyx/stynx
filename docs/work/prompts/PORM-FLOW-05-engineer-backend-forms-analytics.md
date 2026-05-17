# PORM-FLOW-05 - Engineer: Implement Forms, Fills, Waivers, Policy, And Analytics

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/05-forms-analytics`
**Depends on:** `PORM-FLOW-02`, `PORM-FLOW-03`, `PORM-FLOW-04`
**Scope:** Remaining backend Flow feature surfaces. No CMS.

## Goal

Complete the backend Flow package by implementing forms, questions, scores, fills, answers, waivers, node form rules integration, optional policy evaluation, and analytics/open-task views.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `../porm/database/flow/ddl.sql`, especially forms tables, `forms_facts`, analytics views
- `../porm/backend/src/flow/services/flow-forms.service.ts`
- `../porm/backend/src/flow/services/flow-analytics.service.ts`
- `../porm/backend/src/flow/services/flow-policy.service.ts`
- `../porm/backend/src/flow/controllers/{forms,questions,fills,answers,waivers,analytics}.controller.ts`
- `../porm/backend/src/flow/dto/{form,question,score,fill,answer,waiver,analytics}.dto.ts`
- `../porm/tests/backend/api/flow/{forms_questions_scores,forms_questions_scores_crud,fills_answers_waivers,fills_answers_waivers_crud,flow_forms_fills_answers_waivers,analytics_views,flow_questions_single_item,flow_validation}.test.ts`

## Write Scope

Allowed:

- `packages/flow/src/**`
- `packages/flow/README.md` if package docs need the completed feature surface
- `packages/data/migrations/platform/0014_flow.sql` only for missing indexes/functions required by this prompt

Do not edit:

- CMS files;
- frontend package files;
- `.devai/state/*`.

## Required Backend Surface

Implement APIs/services for:

- form CRUD;
- question CRUD;
- question score get/put/delete;
- fill CRUD;
- answer list/upsert/update/delete;
- waiver list/create/update/delete;
- form-scoped fill detail routes;
- node form rule integration with runtime facts;
- analytics: open tasks and run summaries;
- optional policy set/rule evaluation if prompt 02 created the policy tables.

## Validation Requirements

- Reject missing required fields.
- Reject invalid enum values.
- Reject answer writes for unknown questions.
- Enforce form/fill/answer tenant isolation through RLS.
- Ensure waiver writes are audited.
- Ensure analytics read routes are read-only.
- Preserve enough PORM validation behavior to satisfy converted tests.

## STYNX Decorators

Apply route decorators:

- forms/design reads: `@Permission('flow:read:design')`, `@ReadOnly()`;
- forms/design writes: `@Permission('flow:write:design')`, `@Audit(...)`;
- fill/answer/waiver reads: `@Permission('flow:read:runtime')`, `@ReadOnly()`;
- fill/answer/waiver writes: `@Permission('flow:execute:task')`, `@Audit(...)`, `@Idempotent('Idempotency-Key')` where retryable;
- analytics reads: `@Permission('flow:read:analytics')`, `@ReadOnly()`.

## Verification

Run:

```sh
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
pnpm --filter @stynx/flow test:int
pnpm lint:deps
git diff --name-only
git diff --check
```

If PostgreSQL/Testcontainers is unavailable, capture the exact failure and run static/unit checks.

## Acceptance Criteria

- Forms/fills/answers/waivers APIs compile and follow STYNX decorators.
- Analytics reads are read-only.
- Form facts integrate with runtime fact building.
- Policy is either implemented as documented or explicitly left out with docs and tests proving the unsupported paths fail clearly.
- No CMS files are changed.
