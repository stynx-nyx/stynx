# FE-04 — `@stynx-web/angular-flow` Inventory

**Compiled:** 2026-05-19
**Reads:** `packages-web/angular-flow/src/lib/*` and its `test/*` files.
**Why a dedicated file.** The user's assignment names the workflow UI as a deliverable in its own right: *"an installable full-featured workflow UI to create and compose arbitrary workflows on `@stynx/flow` engine."* This file enumerates what currently ships.

## Package facts

- **Name / version:** `@stynx-web/angular-flow@0.1.0` — pre-release per semver.
- **Peer deps:** `@angular/common`, `@angular/core`, `@angular/router`.
- **Source size:** 2 060 lines across `src/lib/`.
- **Test size:** 682 lines across 3 spec files (`flow-api.service.spec.ts`, `flow-graph-canvas.component.spec.ts`, `flow-graph-designer.component.spec.ts`).
- **Coverage:** branches 91.89 %, otherwise 100 %.
- **Mutation:** no `mutation.json` recorded.

## What ships

### Service layer

`FlowApiService` — full CRUD over the `@stynx/flow` HTTP surface:

- Scopes: `listScopes`, `getScope`, `createScope`, `updateScope`, `deleteScope`.
- Graphs: `listGraphs`, `getGraph`, `createGraph`, `updateGraph`, `publishGraph`, `deleteGraph`.
- Nodes / edges: managed inline on the graph payload.
- Forms: `listForms`, `getForm`, `createForm`, `updateForm`.
- Runs: `startRun`, `getRun`, `listRuns`, `cancelRun`.
- Tasks: `listTasks`, `getTask`, `claimTask`, `completeTask`, `reassignTask`.
- Fills: `submitFill`, `getFill`.
- Waivers: `requestWaiver`, `approveWaiver`, `denyWaiver`.
- Analytics: `summaryOpenTasks(scopeId?)`.

The service consumes an injected `STYNX_FLOW_CLIENT` — typically the `@stynx-web/sdk` instance. Returns `Observable<T>`; no signal facades on the service layer (signal cache lives in the components).

### Component layer (all standalone)

| Component                                | Selector                              | Responsibility                                                                          |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `StynxFlowGraphDesignerComponent`        | `<stynx-flow-graph-designer>`         | Top-level editor: scope picker, graph picker, embeds canvas + dialogs.                  |
| `StynxFlowGraphCanvasComponent`          | `<stynx-flow-graph-canvas>`           | List-based rendering of nodes + edges; selection, add, delete via dialog.               |
| `StynxFlowDesignDialogsComponent`        | `<stynx-flow-design-dialogs>`         | Modal forms for "add node", "add edge", "edit node properties", "configure form binding". |
| `StynxFlowTaskCardComponent`             | `<stynx-flow-task-card>`              | Renders one task tile with assignee, due date, claim / complete affordances.            |
| `StynxFlowFormsComponent`                | `<stynx-flow-forms>`                  | Form designer: questions, types, options.                                               |
| `StynxFlowFillsComponent`                | `<stynx-flow-fills>`                  | Runtime fill execution: boolean / number / date / single-select / multi-select inputs.  |
| `StynxFlowWaiversComponent`              | `<stynx-flow-waivers>`                | Question-level waiver entry; supports requesting / approving / denying.                 |
| `StynxFlowAnalyticsComponent`            | `<stynx-flow-analytics>`              | Open-tasks dashboard (counts by scope).                                                  |

### Routes and install

```ts
// Host application
import { provideStynxFlow, flowRoutes } from '@stynx-web/angular-flow';

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxFlow({ clientFactory: () => inject(StynxSdkClient) }),
    provideRouter([
      ...flowRoutes(),                          // mounts under root
      // or { path: 'flow', children: flowRoutes() }
    ]),
  ],
});
```

`flowRoutes()` exports an Angular `Routes` array; sub-paths cover design / runtime / analytics. The provider takes a `clientFactory` so the host can choose between the SDK client, a custom transport, or a mock.

### Types exported

20+ models: `FlowScope`, `FlowGraph`, `FlowNode`, `FlowEdge`, `FlowForm`, `FlowQuestion`, `FlowOption`, `FlowTask`, `FlowRun`, `FlowFill`, `FlowFillAnswer`, `FlowWaiver`, `FlowAnalyticsSummary`, plus the request / response shapes consumed by `FlowApiService`.

## Gaps and weaknesses

1. **Canvas is intentionally list-based.** The codebase carries a documented decision not to bundle Cytoscape / D3 / svg.js (avoids a large peer dep). For a "full-featured" graph editor expectation, this is a gap — even a thin SVG layout (force-directed or grid) would lift the UX. See [diag/FE-02](../diag/FE-02-completeness-gaps.md#flow-canvas).

2. **Forms have only the basic input types.** `StynxFlowFillsComponent` handles boolean / number / date / single-select / multi-select. Missing: text (short / long), file upload (delegating to `angular-storage`), signature, rating, currency, ICU / pluralised number, conditional reveal (show question Q2 only if Q1=YES).

3. **Analytics is a single metric.** Open-tasks-by-scope. Missing: per-graph cycle time, completion rate, SLA breach, throughput trend. A consuming app cannot show a useful flow-health dashboard out of the box.

4. **No "publish / preview / draft" badge UI.** The designer commits straight into the graph; there is no visible separation between "draft I'm editing" and "version that's running". The backend supports `publishGraph` semantics; the FE doesn't surface it.

5. **No runtime "my open tasks" inbox component.** `StynxFlowAnalyticsComponent` is the dashboard but not a per-user inbox. A consuming app must compose `FlowApiService.listTasks({ assignee: me })` itself.

6. **No event / activity timeline per run.** The data exists on the backend (audit log + flow events); no component renders it.

7. **No first-run / empty-state UX.** Opening the designer in a tenant that has zero scopes / graphs lands on an empty list with no guidance. A "create your first scope" empty state would smooth onboarding.

8. **No translation usage.** The component templates contain literal English strings ("Add node", "Approve waiver", "No tasks yet"). Once `@stynx-web/angular-i18n` ships real catalogs, every label must be migrated to `{{ 'flow.designer.add-node' | translate }}`. See [diag/FE-03](../diag/FE-03-standards-compliance.md).

9. **`OnPush` is not uniform.** Spot check of the designer + canvas components: change detection strategy is mixed; some templates rely on `Default` to pick up unsignalled service-cache updates.

10. **No `axe-core` or accessibility-targeted tests.** Designer dialogs are full of `<input>` + `<button>` without label association assertions.

11. **No real router exercise.** Per `inv/03-frontend.md`, the existing spec asserts `flowRoutes() === FLOW_ROUTES` for shape only. No spec navigates `'/flow/scopes/:scopeId/graphs/:graphId/design'` and asserts the right component activates.

12. **Version 0.1.0 — pre-release.** This is honest about the package's maturity, but the goal is to ship 1.0 alongside the rest of the suite.

## Tests we have

- `flow-api.service.spec.ts` — HTTP service unit tests against a stubbed transport.
- `flow-graph-canvas.component.spec.ts` — renders the canvas with stubbed data, asserts list-row count.
- `flow-graph-designer.component.spec.ts` — renders the designer shell, asserts the canvas is present.

## Tests we don't have

- End-to-end designer flow: open scope → create graph → add 3 nodes → add 2 edges → save → re-load → assert structure.
- Form designer end-to-end: add 3 question types → bind to a node → publish → run a fill → assert answer collected.
- Waiver flow: request → approve → reflect in task state.
- Permission-gated designer: user without `flow:design` permission sees a denied banner.
- Analytics refresh: signal recomputes when a task closes.

## Verdict

`@stynx-web/angular-flow` is the **most complete feature package** in the suite — the only one that meaningfully delivers its scope today. Its weaknesses are around polish (canvas UX, empty states, ICU forms), uniform standards (`OnPush`, i18n), and exhaustiveness (test coverage of designer & runtime), not around missing capability. A 1.0 release after addressing items 1–11 above is realistic. See [plan/FE-WAVE-F](../plan/FE-WAVE-F-flow-installable.md).
