# `@stynx-nyx/flow` — the STYNX workflow engine: forms, runs, nodes, tasks, policies

`@stynx-nyx/flow` is STYNX's workflow engine. It models **design-time** artifacts (forms with questions, graphs of nodes connected by edges, policies, agent-rules) and drives **runtime** execution (runs that traverse the graph, tasks that humans or agents act on, fills that capture form answers, effects + signals that fire side-effects). One cohesive NestJS module — `StynxFlowModule` — exposes ~113 REST endpoints across 20 controllers, all wired together. It powers the SPED-fiscal flow and the porm / PEC / SGP consumer apps.

> **This is one module, not a collection of mountable parts.** The 20 controllers share `StynxFlowModule` — you mount the whole engine, not individual controllers. This README is split into a [`docs/`](/docs/packages/flow/) subtree purely for readability (a flat README would exceed 600 lines); the split is editorial, not architectural.

## Purpose

Workflow apps — approval chains, multi-step forms, document pipelines, regulatory filings — need a consistent engine for: defining the shape of a process (forms + graph), executing instances of it (runs), routing work to actors (tasks), capturing input (fills + answers), enforcing who-can-do-what (policies), and firing side-effects on transitions (effects + signals). Building this per-app is a multi-month effort that drifts. `@stynx-nyx/flow` provides it as a mountable engine.

You reach for `@stynx-nyx/flow` when your app has any non-trivial multi-step process with state, actors, and transitions. If you just need CRUD, you don't need flow.

What it does NOT do: it is not a BPMN engine (no XML process definitions — STYNX uses its own form+graph model). It does not render UI (that's [`@stynx-nyx/angular-flow`](/docs/packages-web/angular-flow/)). It does not own your domain entities (it references them; you model them in `@stynx-nyx/data`).

## Audience

Backend developers building workflow-driven STYNX apps. You mount `StynxFlowModule`, model your forms + graphs through its design endpoints, and drive runs + tasks through its runtime endpoints. The paired frontend is [`@stynx-nyx/angular-flow`](/docs/packages-web/angular-flow/) and the generated REST client is [`@stynx-nyx/sdk`](/docs/packages-web/sdk/).

## Install

```bash
pnpm add @stynx-nyx/flow
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/contracts` `^1`, `@stynx-nyx/data` `^1`, `@stynx-nyx/audit` `^1`, `@stynx-nyx/auth` `^1`.

## Quick start

```ts
import { Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { StynxFlowModule } from '@stynx-nyx/flow';

@Module({
  imports: [
    StynxCoreModule.forRoot({ appName: 'my-app', schema: ConfigSchema }),
    StynxFlowModule.forRoot({
      // flow reads + writes through @stynx-nyx/data; ensure StynxDataModule is mounted
    }),
  ],
})
export class AppModule {}
```

All 20 controllers mount under `/flow/*`. See the [endpoints pages](/docs/packages/flow/) for the full surface.

## Domain model

The conceptual map — read [`domain-model`](/docs/packages/flow/domain-model/) for the full glossary:

- **Form** — a design-time template: a set of **questions** with scoring + validation. Authored once, filled many times.
- **Fill** — a runtime instance of a form: a set of **answers** to the form's questions, plus **waivers** for skipped requirements.
- **Graph** — a design-time process definition: **nodes** connected by **edges**, with **node-form-rules** binding forms to nodes and **transition-effects** firing on edge traversal.
- **Run** — a runtime instance of a graph: traverses nodes, produces **node-runs**, generates **tasks**.
- **Task** — a unit of work within a run, assigned to an actor (human or agent), acted on (accept / act / assign / unassign).
- **Policy** — an authZ rule set evaluated to decide who can act on what.
- **Agent-rule** — a rule that lets an automated agent act on tasks.
- **Effect / Signal** — side-effects fired on transitions / external signals received.
- **Scope** — a visibility boundary for design + runtime entities.

## Public API surface

### Module

| Export            | Signature                                    | Description                                                 |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `StynxFlowModule` | `.forRoot(options?: StynxFlowModuleOptions)` | Mounts the entire flow engine: 20 controllers + 5 services. |

### Services / Injectables

| Export                 | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `FlowDesignService`    | CRUD on design entities (forms, graphs, nodes, edges, policies, etc.).                   |
| `FlowFormsService`     | Form-filling runtime: fills, answers, waivers, scoring.                                  |
| `FlowRuntimeService`   | Run + task lifecycle: `ensureRun`, `getRunFacts`, `actTask`, `assignTask`, `acceptTask`. |
| `FlowPolicyService`    | Policy evaluation: `evaluate(input)` → authorization decision.                           |
| `FlowAnalyticsService` | Read-only aggregates over runs + tasks.                                                  |

### Endpoints (20 controllers, ~113 routes)

Grouped by domain — see the per-group pages:

| Group                                                     | Controllers                                          | Routes | Page                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Forms + questions                                         | forms, questions                                     | 19     | [endpoints-forms](/docs/packages/flow/endpoints-forms/)                 |
| Fills + answers                                           | fills, answers                                       | 12     | [endpoints-fills-answers](/docs/packages/flow/endpoints-fills-answers/) |
| Graphs + nodes + edges                                    | graphs, nodes, edges                                 | 24     | [endpoints-graph](/docs/packages/flow/endpoints-graph/)                 |
| Runs + node-runs + tasks                                  | runs, node-runs, tasks                               | 24     | [endpoints-runs-tasks](/docs/packages/flow/endpoints-runs-tasks/)       |
| Policies + scopes + agent-rules                           | policies, scopes, agent-rules, node-form-rules       | 22     | [endpoints-policies](/docs/packages/flow/endpoints-policies/)           |
| Effects + signals + events + waivers + transition-effects | effects, signal, events, waivers, transition-effects | 10     | [endpoints-effects](/docs/packages/flow/endpoints-effects/)             |
| Analytics                                                 | analytics                                            | 2      | [endpoints-analytics](/docs/packages/flow/endpoints-analytics/)         |

### Types / Interfaces

| Export                         | Description                                                               |
| ------------------------------ | ------------------------------------------------------------------------- |
| `StynxFlowModuleOptions`       | `forRoot()` options.                                                      |
| `FlowJsonObject`               | The generic row shape flow entities serialise to/from.                    |
| (adapters, tokens, validation) | See [TypeDoc](/docs/api-reference/stynx-flow/) for the full type surface. |

## Configuration

| Option            | Type             | Default    | Description                       |
| ----------------- | ---------------- | ---------- | --------------------------------- |
| `tablePrefix`     | `string`         | `'flow_'`  | Prefix for flow's DB tables.      |
| `enableAnalytics` | `boolean`        | `true`     | Mount the analytics controller.   |
| `policyDefaults`  | `PolicyDefaults` | permissive | Default policy when none matches. |

## Examples

See [`examples`](/docs/packages/flow/examples/) for an end-to-end scenario: author a 3-node form-driven flow, start a run, advance through tasks, read an event.

## Common pitfalls

- **Mounting `@stynx-nyx/flow` without `@stynx-nyx/data`** — flow reads/writes through the request-scoped DB context. Mount `StynxDataModule` (or `backend/db-context`) first.
- **Treating controllers as independently mountable** — they're not; `StynxFlowModule` wires them as a unit.
- **Confusing forms with fills** — a form is the template (design-time); a fill is one submission (runtime). See [domain-model](/docs/packages/flow/domain-model/).
- **Bypassing policy evaluation** — runtime task actions go through `FlowPolicyService`; don't call task mutations directly without the policy gate.

## Related packages

- [`@stynx-nyx/angular-flow`](/docs/packages-web/angular-flow/) — the Angular UI: form-render, run-viewer, task-inbox.
- [`@stynx-nyx/sdk`](/docs/packages-web/sdk/) — the generated REST client for flow's endpoints.
- [`@stynx-nyx/data`](/docs/packages/data/) — flow's persistence layer.
- [`@stynx-nyx/audit`](/docs/packages/audit/) — flow mutations emit audit events.
- [`@stynx-nyx/auth`](/docs/packages/auth/) — flow policies consume the principal.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-flow/`](/docs/api-reference/stynx-flow/)
