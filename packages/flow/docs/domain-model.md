---
title: flow/domain-model
---

# Flow domain model — entity glossary

Every flow entity, what it is, and how it relates. Terminology gates everything else in this subtree.

## Design-time entities

| Entity                       | What it is                                                                 | Key relationships                                                  |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Form**                     | A questionnaire template. Authored once, filled many times.                | Has many **questions**. Bound to **nodes** via node-form-rules.    |
| **Question**                 | A single prompt within a form, with optional **score** + validation.       | Belongs to a **form**. Answered in a **fill**.                     |
| **Graph**                    | A process definition: the shape of a workflow. Versioned + publishable.    | Has many **nodes** + **edges** + **transition-effects**.           |
| **Node**                     | A state in the graph (e.g. "awaiting approval").                           | Belongs to a **graph**. Has **agent-rules** + **node-form-rules**. |
| **Edge**                     | A transition between two nodes.                                            | Belongs to a **graph**. May fire **transition-effects**.           |
| **Node-form-rule**           | Binds a form to a node — "at this node, fill this form".                   | Links **node** ↔ **form**.                                         |
| **Transition-effect**        | A side-effect declaration on an edge — "when this transition fires, do X". | Belongs to an **edge** (via graph).                                |
| **Policy set / Policy rule** | AuthZ rules: who can act on what.                                          | Evaluated by `FlowPolicyService`.                                  |
| **Agent-rule**               | Lets an automated agent act on a node's tasks.                             | Belongs to a **node**.                                             |
| **Scope**                    | A visibility boundary for design + runtime entities.                       | Cross-cutting.                                                     |

## Runtime entities

| Entity       | What it is                                                                                   | Key relationships                                          |
| ------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Run**      | One execution of a graph.                                                                    | Of a **graph**. Has **node-runs**, **tasks**, **events**.  |
| **Node-run** | The execution record of a single node within a run.                                          | Belongs to a **run** + **node**.                           |
| **Task**     | A unit of work routed to an actor.                                                           | Belongs to a **run** (via node-run). Acted on by an actor. |
| **Fill**     | One submission of a form.                                                                    | Of a **form**. Has **answers** + **waivers**.              |
| **Answer**   | A response to one question within a fill.                                                    | Belongs to a **fill** + **question**.                      |
| **Waiver**   | A skip of a required question, with justification.                                           | Belongs to a **fill**.                                     |
| **Effect**   | A dispatched side-effect (the runtime instance of a transition-effect or a manual dispatch). | Fired during a run.                                        |
| **Signal**   | An external event delivered into a run.                                                      | Received by a **run**.                                     |
| **Event**    | An audit record of a flow state change.                                                      | Belongs to a **run**.                                      |

## The lifecycle in one diagram (textual)

```
DESIGN:  Graph ──has──> Node ──edge──> Node
                         │
                  node-form-rule
                         │
                         ▼
                       Form ──has──> Question

RUNTIME: Run (of Graph) ──> NodeRun (of Node) ──> Task ──> [actor acts]
                                  │
                            Fill (of Form) ──> Answer (of Question)
                                  │
                                Waiver
```

## Task lifecycle

A task moves through states via the task endpoints:

```
created ──assign──> assigned ──accept──> accepted ──act──> completed
   │                   │                     │
   └──candidates──┘    └──unassign──┘        └──decline / unaccept / withdraw──┘
```

See [endpoints-runs-tasks](/docs/packages/flow/endpoints-runs-tasks/) for the per-action endpoints.
