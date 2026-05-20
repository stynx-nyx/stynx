# Prompt — Worker FE-F: `@stynx-web/angular-flow` 1.0 Polish

## Runtime

- **Tier:** default.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-06-WORKER-F-flow-installable.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-06-WORKER-F-flow-installable.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-F — `@stynx-web/angular-flow` 1.0** in the stynx frontend completeness programme.

## Scope

- F.1 — Empty / first-run states (`StynxFlowEmptyStateComponent`, scope / graph empty prompts).
- F.2 — Publish / draft separation (`status` field, publish action, badge UI).
- F.3 — `StynxFlowMyTasksInboxComponent`.
- F.4 — `StynxFlowRunActivityComponent`.
- F.5 — Richer fill question types (text short / long, file via storage, signature, conditional reveal, ICU plurals).
- F.6 — Analytics breadth (`StynxFlowDashboardComponent` with cycle time / completion rate / SLA breach).
- F.7 — `OnPush` uniform across `angular-flow`.
- F.8 — Translation migration (`flow.*` keys).
- F.9 — Real router tests.
- F.10 — `provideStynxFlow` ergonomics + recipes in README.
- F.11 — Tests.

## Role (Article 6)

- F.1–F.10: **Engineer**.
- F.11: **Inspector**.
- ADR for publish/draft contract: **Architect**.

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-F-flow-installable.md`)

1. Empty states ship.
2. Publish / draft badge and action ship; type model updated.
3. My-tasks inbox and run activity timeline are shipped.
4. Fill question set includes text / file / signature / conditional reveal / ICU plurals.
5. Dashboard adds cycle time, completion rate, SLA breach.
6. `OnPush` is uniform across `angular-flow`.
7. Every flow template literal is translated; `en` + `pt-BR` shipped.
8. Real router spec passes.
9. `@stynx-web/angular-flow` releases as `1.0.0`.
10. `pnpm test:matrix` records the new tests; mutation passes the configured repository threshold for `@stynx-web/angular-flow`.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-F-flow-installable.md`.
2. `./docs/work/inv/FE-04-flow-ui-inventory.md`.
3. `./packages-web/angular-flow/src/lib/` — current shape.
4. `./packages/flow/` (read-only) — the engine's publish / draft semantics.
5. The OpenAPI spec for `/flows/*` — to confirm `publish`, `/runs/{id}/activity`, `/analytics/dashboard` endpoints.
6. Wave FE-A's closure report.

## Constraints

- `1.0.0` release is gated on **every** F-\* workstream landing. The orchestrator bumps the version at wave closure, not per-workstream.
- Fill question types are additive; don't break existing single-select / multi-select / number / date / boolean rendering.
- The signature question stores a base64 PNG; cap at 50 KB after compression.
- `StynxFlowMyTasksInboxComponent` refresh: signal-driven, 30 s polling by default, configurable via input.
- Templates use `| translate`; key namespace `flow.*`.
- Real router test mounts `provideRouter([...flowRoutes()])` and asserts component activation under stubbed permissions.

## Validation commands

```bash
pnpm -r --filter @stynx-web/angular-flow build
pnpm -r --filter @stynx-web/angular-flow test
pnpm test:matrix --no-color --coverage
pnpm lint
```

## Closure

Append to `docs/work/plan/FE-WAVE-F-report.md`. The orchestrator bumps `packages-web/angular-flow/package.json#version` from `0.1.0` to `1.0.0` only after every workstream's row is green.

## Stop conditions

Stop and ask if:

- The backend `/flows/graphs/{id}/publish` endpoint doesn't exist (backend gap, not in scope).
- The activity timeline data is too large to paginate as designed (UX strategy decision).
- A conditional-reveal rule introduces cyclic dependencies between questions (semantic decision).
