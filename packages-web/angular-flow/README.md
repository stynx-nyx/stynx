# `@stynx-nyx/angular-flow` — Angular workflow UI: graph designer, forms, tasks, run activity

`@stynx-nyx/angular-flow` is the Angular UI for the STYNX workflow engine. It provides a graph designer (visual canvas + design dialogs), form-render + fills components, a task inbox, run-activity timeline, waivers UI, and analytics. It consumes the backend's [`@stynx-nyx/flow`](/docs/packages/flow/) endpoints (20 controllers) via a `FlowApiService`. This is the visual half of the flow engine — pair it with the backend flow docs for end-to-end understanding.

## Purpose

Workflow apps need UI for the whole flow lifecycle: visually design the process graph, render forms for users to fill, route tasks to actors with an inbox, show run progress + activity, and surface analytics. Building all of this against flow's ~113 endpoints is a major effort. `@stynx-nyx/angular-flow` provides it as drop-in components.

You reach for it whenever your STYNX app exposes workflows to users.

What it does NOT do: it doesn't define the workflow (the backend graph does). It renders + drives runs of graphs the backend hosts.

## Audience

Angular frontend developers building workflow-driven UIs.

## Install

```bash
pnpm add @stynx-nyx/angular-flow
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/router` `^18`, `@stynx-nyx/angular` `^1`, `@stynx-nyx/angular-ui` `^1`, `@stynx-nyx/sdk` `^1`.

## Quick start

```ts
import { flowRoutes } from '@stynx-nyx/angular-flow';

export const routes: Routes = [
  { path: 'workflows', children: flowRoutes, canActivate: [authGuard] },
];
```

```html
<stynx-flow-tasks [assignee]="currentUser.id" />
```

## Public API surface

### Routes

| Export       | Description                                            |
| ------------ | ------------------------------------------------------ |
| `flowRoutes` | Ready-to-mount child routes covering the full flow UI. |

### Components

| Selector                      | Component                    | Description                                  |
| ----------------------------- | ---------------------------- | -------------------------------------------- |
| `<stynx-flow-graph-designer>` | `FlowGraphDesignerComponent` | The visual process-graph designer.           |
| `<stynx-flow-graph-canvas>`   | `FlowGraphCanvasComponent`   | The node/edge canvas (used by the designer). |
| `<stynx-flow-design-dialogs>` | `FlowDesignDialogsComponent` | Node / edge / rule edit dialogs.             |
| `<stynx-flow-forms>`          | `FlowFormsComponent`         | Form-render for filling.                     |
| `<stynx-flow-fills>`          | `FlowFillsComponent`         | View/manage fills.                           |
| `<stynx-flow-tasks>`          | `FlowTasksComponent`         | Task inbox; accept / act / assign.           |
| `<stynx-flow-run-activity>`   | `FlowRunActivityComponent`   | Run-activity timeline.                       |
| `<stynx-flow-waivers>`        | `FlowWaiversComponent`       | Waivers management.                          |
| `<stynx-flow-analytics>`      | `AnalyticsComponent`         | Dashboards (open tasks, throughput).         |
| `<stynx-flow-empty-state>`    | `FlowEmptyStateComponent`    | Empty-state for flow views.                  |

### Services

| Export           | Description                                 |
| ---------------- | ------------------------------------------- |
| `FlowApiService` | Wraps the SDK's 20-controller flow surface. |

### Types

| Export  | Description                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| (types) | Flow view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-flow/). |

## Configuration

| Option             | Type      | Default  | Description                                  |
| ------------------ | --------- | -------- | -------------------------------------------- |
| `taskRefreshMs`    | `number`  | `30_000` | Task-inbox poll interval.                    |
| `designerReadOnly` | `boolean` | `false`  | Render the graph designer in view-only mode. |

## Examples

### Example 1 — task inbox

```html
<stynx-flow-tasks [assignee]="user.id" (taskActed)="refresh()" />
```

### Example 2 — embedding form-render

```html
<stynx-flow-forms [formId]="form.id" [runId]="run.id" />
```

### Example 3 — end-to-end (UI side of the backend's expense-approval example)

This mirrors the backend [`@stynx-nyx/flow` examples](/docs/packages/flow/examples/): the submitter uses `<stynx-flow-forms>` to fill the expense form; the manager uses `<stynx-flow-tasks>` to review + act; `<stynx-flow-run-activity>` shows the event stream.

## Common pitfalls

- **Stale SDK after backend flow contract change** — `FlowApiService` calls the generated SDK; regenerate the SDK (`pnpm sdk:codegen`) after backend flow changes, or UI calls break.
- **Form-render state isolation** — multiple `<stynx-flow-forms>` instances on one page share state if not keyed; give each a distinct `[fillId]`.
- **Designer mutations without publish** — editing a graph in the designer doesn't affect in-flight runs until published (the backend publish gate).

## Related packages

- [`@stynx-nyx/flow`](/docs/packages/flow/) — the backend engine (20 controllers / ~113 endpoints) + the [domain model](/docs/packages/flow/domain-model/) this UI renders.
- [`@stynx-nyx/sdk`](/docs/packages-web/sdk/) — the generated client `FlowApiService` wraps.
- [`@stynx-nyx/angular-ui`](/docs/packages-web/angular-ui/) — shared components the flow UI builds on.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-flow/`](/docs/api-reference/stynx-web-angular-flow/)
