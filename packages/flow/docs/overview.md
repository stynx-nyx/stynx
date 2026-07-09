---
title: flow/overview
---

# Flow engine overview

`@stynx-nyx/flow` is one cohesive NestJS module that models and executes workflows. This page orients you before diving into the endpoint groups.

## The two halves: design-time and runtime

**Design-time** — you author the shape of a process:

- A **form** is a questionnaire template (a set of **questions** with scoring + validation rules).
- A **graph** is a process definition: **nodes** (states) connected by **edges** (transitions), with **node-form-rules** binding forms to nodes and **transition-effects** firing when an edge is traversed.
- **Policies** declare who can act on what; **agent-rules** let automated agents act; **scopes** bound visibility.

**Runtime** — instances of those designs execute:

- A **fill** is one submission of a form (a set of **answers**, plus **waivers** for skipped requirements).
- A **run** is one execution of a graph: it traverses nodes (producing **node-runs**) and generates **tasks**.
- A **task** is a unit of work routed to an actor, who can accept / act / assign / decline / withdraw it.
- **Effects** and **signals** fire side-effects on transitions or in response to external events; **events** are the audit stream of what happened.

## How a run flows

1. An app calls `POST /flow/runs/ensure` to start (or resume) a run of a published graph.
2. The run enters the graph's start node; a **node-run** is created.
3. Node-form-rules attach forms; the actor fills them (`POST /flow/fills`).
4. The run evaluates edges; **policy** decides if the transition is allowed.
5. On transition, **transition-effects** fire; the run advances to the next node.
6. Each node generates **tasks** for actors; tasks are acted on (`POST /flow/tasks/:id/act`).
7. **Events** record every transition; **analytics** aggregates open tasks + dashboards.

## State + persistence

Flow stores everything through `@stynx-nyx/data`'s request-scoped DB context — so every flow query is tenant-scoped and RLS-aware. Tables are prefixed (default `flow_`). All mutations emit audit events via `@stynx-nyx/audit`.

## Reading order for the endpoint pages

1. [domain-model](/docs/packages/flow/domain-model/) — the full glossary.
2. [endpoints-forms](/docs/packages/flow/endpoints-forms/) — author forms + questions.
3. [endpoints-graph](/docs/packages/flow/endpoints-graph/) — author the process graph.
4. [endpoints-policies](/docs/packages/flow/endpoints-policies/) — define authZ.
5. [endpoints-runs-tasks](/docs/packages/flow/endpoints-runs-tasks/) — execute + act.
6. [endpoints-fills-answers](/docs/packages/flow/endpoints-fills-answers/) — capture input.
7. [endpoints-effects](/docs/packages/flow/endpoints-effects/) — side-effects + signals.
8. [endpoints-analytics](/docs/packages/flow/endpoints-analytics/) — read aggregates.
9. [examples](/docs/packages/flow/examples/) — an end-to-end scenario.
