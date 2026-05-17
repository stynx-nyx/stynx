# PORM-FLOW-GAP-02 - Architect: Set Flow Gap-Closure Contracts

**Discipline:** Architect
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-01`
**Scope:** Contracts, architecture, runbooks, trace, and prompt updates only. No implementation code. No tests. No CMS.

## Goal

Turn the ambiguous high-risk gaps from `docs/work/diag/porm-flow-reassessment.md` into explicit STYNX contracts that Inspectors and Engineers can implement without guessing.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `docs/operations/runbooks/flow.md`
- `docs/architecture/trace.json`
- `packages/flow/src/adapters.ts`
- `packages/flow/src/flow-runtime.service.ts`
- `packages/data/migrations/platform/0014_flow.sql`
- PORM evidence:
  - `../porm/backend/src/flow/services/flow-runtime.service.ts`
  - `../porm/backend/src/flow/services/flow-policy.service.ts`
  - `../porm/backend/src/flow/controllers/fills.controller.ts`
  - `../porm/backend/src/flow/controllers/forms.controller.ts`
  - `../porm/tests/backend/api/flow/`
  - `../porm/tests/backend/e2e/flow-tasks.e2e-spec.ts`

## Write Scope

Allowed:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `docs/operations/runbooks/flow.md`
- `docs/architecture/trace.json`
- `docs/work/prompts/PORM-FLOW-GAP-*.md` if a downstream prompt needs clarification

Do not edit:

- `packages/**`
- `packages-web/**`
- `reference/**`
- tests
- `.devai/state/**`
- CMS files

## Required Decisions

Document explicit decisions for these gaps:

1. **Effect dispatch:** decide whether STYNX Flow owns an effect delivery API or only emits `effect_requested` events. Recommended closure target: `@stynx/flow` exposes an explicit dispatch service that calls `FlowDomainAdapter.applyEffect`, records success/failure events, and is safe to retry.
2. **Resolver functions:** decide how `resolver_fn` agent rules become actionable candidates. Recommended closure target: runtime service expands resolver keys through `FlowDomainAdapter.resolveAgents` before task presentation and candidate APIs return concrete users/permissions where possible.
3. **Node form rules:** decide whether `flow.node_form_rules` are metadata-only or enforced gates. Recommended closure target: runtime enforces `all_required`, `score_threshold`, and `any_answered` semantics before human task completion when a node has required form rules.
4. **PORM-compatible aliases:** decide which PORM route shapes are intentionally supported for migration ergonomics:
   - `POST /flow/fills`
   - `PUT /flow/fills/:fillId/answers`
   - `GET /flow/forms/:formId/fills/:fillId`
   - `GET /flow/forms/:formId/fills/:fillId/answers`
   - `GET /flow/forms/:formId/fills/:fillId/waivers`
   - `POST /flow/forms/:formId/fills/:fillId/waivers`
5. **Analytics paging/filtering:** define query parameters and response envelope for `GET /flow/open-tasks` and `GET /flow/runs/summary`.
6. **Task privilege semantics:** define which task operations require current assignee, `flow:assign:task`, adapter `canManage`, or adapter `canView`.
7. **Policy evaluation:** define whether policy CRUD is enough for closure or whether the backend must expose/evaluate policy decisions.
8. **Angular package expectations:** define the minimum package-level UI/API behavior required before final closure.

## Required Trace Updates

Update `docs/architecture/trace.json` so it no longer points at nonexistent Angular tests as if they already exist. Add planned or expected test references only if the trace schema supports them without pretending they have passed.

## Verification

Run:

```sh
pnpm doctor
git diff --check
git status --short --branch
```

If schema validation for trace or invariants exists in this checkout, run the relevant command and record it in the prompt output.

## Acceptance Criteria

- Every high-risk deferral in the reassessment is either closed by a contract decision or explicitly deferred with rationale and downstream impact.
- Downstream Inspector and Engineer prompts have enough detail to implement tests and code.
- No production code, tests, `.devai/state`, or CMS files are changed.
