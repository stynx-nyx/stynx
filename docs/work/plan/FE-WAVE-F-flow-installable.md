# FE-WAVE-F — `@stynx-web/angular-flow` 1.0 Polish

**Wave goal.** Bring `@stynx-web/angular-flow` from `0.1.0` to `1.0.0`. Polish UX, add the missing first-class surfaces (empty states, publish badge, my-tasks inbox, activity timeline), enrich the fill question set, translate every string, and add real router tests.

## Scope

| Area                          | Change                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Empty / first-run UX          | "Create your first scope" empty-state in `StynxFlowGraphDesignerComponent`.                  |
| Publish vs draft separation   | Visible badge on graphs ("Draft" / "Published v3"); explicit publish action.                 |
| My-tasks inbox                | New `StynxFlowMyTasksInboxComponent`.                                                         |
| Per-run activity timeline     | New `StynxFlowRunActivityComponent`.                                                          |
| Richer fill question types    | Text (short / long), file (via `angular-storage`), signature, conditional reveal, ICU plural counts. |
| Analytics breadth             | Per-graph SLA, cycle time, completion rate — `StynxFlowDashboardComponent`.                    |
| OnPush uniform                | All flow components declare `OnPush`.                                                          |
| Translated strings            | Every template literal → `| translate`.                                                       |
| Router tests                  | Real router spec navigating `flowRoutes()` and asserting component activation under guards. |
| `provideStynxFlow` ergonomics | Accept `clientFactory` returning either the SDK or a custom transport; document recipes.    |

## Workstreams

### F.1 — Empty / first-run states

In `StynxFlowGraphDesignerComponent`: when `scopes().length === 0`, render `StynxFlowEmptyStateComponent` with a CTA "Create your first scope". When the active scope has no graph, render an inline "Create your first graph" prompt.

### F.2 — Publish / draft separation

Extend `FlowGraph` types with `status: 'draft' | 'published'` and `publishedVersion?: number`. Designer shows a badge per graph. Publish action posts to `POST /flows/graphs/{id}/publish`; runtime resolves to the latest published version.

### F.3 — My-tasks inbox

```ts
@Component({ standalone: true, changeDetection: OnPush, selector: 'stynx-flow-my-tasks-inbox', ... })
export class StynxFlowMyTasksInboxComponent { ... }
```

Calls `FlowApiService.listTasks({ assignee: 'me', status: 'open' })`. Renders each task with a `StynxFlowTaskCardComponent`. Refreshes on signal-driven interval and on `tenantChanged$`.

### F.4 — Per-run activity timeline

`StynxFlowRunActivityComponent` — consumes `GET /flows/runs/{id}/activity`. Renders a vertical timeline of events. Pagination via cursor.

### F.5 — Richer fill question types

`StynxFlowFillsComponent` learns:
- `text` (short, max 200 chars; or long, max 4000).
- `file` — delegates to `<stynx-document-upload>` from `@stynx-web/angular-storage`; resolves to a `documentId` answer.
- `signature` — `<canvas>`-based signature capture; resolves to base64 PNG.
- Conditional reveal — `revealIf: { question: 'q1', equals: 'YES' }`.
- ICU pluralised labels — leverage the upgraded `TranslatePipe`.

### F.6 — Analytics breadth

`StynxFlowDashboardComponent` consumes `GET /flows/analytics/dashboard?scopeId=...`. Renders:
- Open tasks (existing metric).
- Cycle time (p50, p95).
- Completion rate (last 7 / 30 days).
- SLA breach count.

Each metric is a `StynxMetricCardComponent` from `@stynx-web/angular-ui` (a new primitive added in this wave or in FE-A).

### F.7 — `OnPush` uniform

Audit every `@Component` in `packages-web/angular-flow/src/lib/`. Add `OnPush` where missing. Fix any change-detection regressions.

### F.8 — Translation migration

Migrate every template literal to `| translate`. Ship `src/i18n/{en,pt-BR}.json`.

### F.9 — Real router tests

`packages-web/angular-flow/test/routing/flow-routes.spec.ts`:
- Use `provideRouter([...flowRoutes()])` + a stubbed permission set.
- For each route, call `router.navigate([url])` and assert the activated component.
- Assert that without `flow:design` permission, navigation to `/scopes/:id/graphs/:id/design` lands on the denial component.

### F.10 — `provideStynxFlow` ergonomics

Document the three common shapes in `packages-web/angular-flow/README.md`:
1. SDK-backed: `provideStynxFlow({ clientFactory: () => inject(StynxSdkClient) })`.
2. Mock-backed (for demos): `provideStynxFlow({ clientFactory: () => new MockFlowClient() })`.
3. Custom-backed: `provideStynxFlow({ clientFactory: () => inject(MyFlowClient) })`.

### F.11 — Tests

- TestBed spec per new component (inbox, run activity, dashboard, new fill types).
- Router spec (F.9).
- Mutation threshold ≥ 70 %.

(Playwright design + runtime + analytics scenarios in FE-WAVE-G.)

## Success criteria

1. Empty states ship.
2. Publish / draft badge and action ship; type model updated.
3. My-tasks inbox and run activity timeline are shipped.
4. Fill question set includes text / file / signature / conditional reveal / ICU plurals.
5. Dashboard adds cycle time, completion rate, SLA breach.
6. `OnPush` is uniform across `angular-flow`.
7. Every flow template literal is translated; `en` + `pt-BR` shipped.
8. Real router spec passes.
9. `@stynx-web/angular-flow` releases as `1.0.0`.
10. `pnpm test:matrix` records the new tests; mutation ≥ 70 %.

## Closure artifact

`docs/work/plan/FE-WAVE-F-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| F.1–F.7, F.10 components / standards | Engineer |
| F.8 catalog | Engineer |
| F.11 tests | Inspector |
| Publish/draft contract ADR | Architect |
