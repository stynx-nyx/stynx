# Flow Architecture

**Authority:** Architect (Constitution Article 6).
**Status:** Draft for the PORM-to-STYNX Flow port.

Flow is a reusable workflow framework for tenant-scoped business processes. It is not a CMS feature, and generic Flow code must never reference CMS, PORM opportunity, proposal, engagement, or any other host-domain concept directly. Host applications attach domain meaning through an adapter contract.

## Source Evidence

The first STYNX Flow implementation is derived from PORM Flow behavior, but not copied wholesale. PORM supplies the behavior inventory; STYNX supplies the governance, tenancy, RLS, audit, package, and frontend boundaries.

| Source                                                                  | Evidence used                                                                                                       | STYNX interpretation                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../porm/database/flow/ddl.sql`                                         | Workflow schema, runtime functions, event views, open-task views, forms, questions, scores, fills, answers, waivers | Defines the feature vocabulary and expected runtime semantics; must be rewritten for tenant RLS, STYNX soft-delete, and explicit service boundaries |
| `../porm/backend/src/flow/flow.module.ts` and flow controllers/services | Design, runtime, task, form, fill, waiver, event, analytics, and signal APIs                                        | Defines the route families; must use STYNX `Database`, auth decorators, tenancy context, audit, idempotency, and rate-limit packages                |
| `../porm/frontend/src/app/flow/flow.module.ts`                          | Angular routes and feature pages for scopes, graphs, forms, fills, assignments, and waivers                         | Defines the expected UI surface for `@stynx-web/angular-flow`, mounted by a host shell                                                              |
| `../porm/docs/eng/domains/flow/*.md`                                    | Human documentation of schema, backend, frontend, and workflow behavior                                             | Provides invariants, vocabulary, and acceptance expectations                                                                                        |
| PORM flow tests and OpenAPI inventory                                   | CRUD, task action, runtime, form, and analytics surfaces                                                            | Provides route coverage targets; STYNX Inspectors must rewrite tests against STYNX contracts                                                        |

Known copy blockers from PORM are intentional design inputs: PORM Flow rows are not consistently tenant-scoped, use PORM auth roles and database services, include hard-coded domain effects in task actions, and expose mutable workflow event rows. STYNX Flow must close those gaps.

## Package Boundary

STYNX Flow is split into two independent packages:

| Package                   | Owns                                                                                                                                                                            | Must reuse                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@stynx-nyx/flow`             | Backend NestJS module, database schema bindings, DTOs, controllers, services, adapter tokens, runtime orchestration, task APIs, form APIs, analytics APIs, and OpenAPI metadata | `@stynx-nyx/data`, `@stynx-nyx/auth`, `@stynx-nyx/backend`, `@stynx-nyx/tenancy`, `@stynx-nyx/audit`, `@stynx-nyx/idempotency`, `@stynx-nyx/ratelimit`, `@stynx-nyx/contracts`, `@stynx-nyx/testing` |
| `@stynx-web/angular-flow` | Angular route definitions, API client facade, graph/form/task/fill/waiver components, stores, guards, and host mount helpers                                                    | `@stynx-web/sdk`, `@stynx-web/angular`, `@stynx-web/angular-auth`, `@stynx-web/angular-ui`, and Angular CDK primitives where useful                              |

The backend package is the source of truth for workflow behavior. The Angular package is a client package and may not duplicate orchestration decisions that belong to `@stynx-nyx/flow`.

## Concepts

| Concept           | Definition                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope             | Tenant-local namespace for a family of graphs and forms. Scopes separate workflow catalogs within one tenant.                                                                               |
| Graph             | Versioned workflow definition inside a scope. A graph contains nodes, edges, rules, and effects.                                                                                            |
| Node              | A step in a graph. Nodes model start, task, decision, wait, end, or host-defined categories carried as data.                                                                                |
| Edge              | Directed transition from one node to another with optional rule expressions and priority.                                                                                                   |
| Agent rule        | Declarative assignment rule for task candidates or assignees. Rules may name roles, explicit actors, groups, or an adapter-resolved expression.                                             |
| Transition effect | Declarative side effect to request from the host domain adapter when a transition completes. Effects are data, not framework hard-coding.                                                   |
| Run               | One execution instance of a graph for a target domain object. The target is typed by adapter key plus opaque target id.                                                                     |
| Node run          | Runtime state for one node within a run.                                                                                                                                                    |
| Task              | Human-actionable work item emitted by a node run. Tasks may be assigned, accepted, declined, acted on, withdrawn, or completed.                                                             |
| Event             | Append-only domain ledger row recording workflow runtime facts such as run started, node opened, task assigned, task acted, transition taken, signal received, or adapter effect requested. |
| Form              | Tenant-scoped questionnaire definition used by task nodes or host workflows.                                                                                                                |
| Question          | Ordered form field definition.                                                                                                                                                              |
| Score             | Optional scoring metadata for a question.                                                                                                                                                   |
| Fill              | One actor's answer set for a form against a run, node run, task, or target.                                                                                                                 |
| Answer            | One answer value for one fill/question pair.                                                                                                                                                |
| Waiver            | Explicit approval to bypass a required form or question, with reason, actor, and validity rules.                                                                                            |

## Domain Adapter Contract

Generic Flow stores orchestration state. Host applications provide domain behavior through registered adapters. The adapter key is persisted on graph/run/signal records and selects a concrete implementation at runtime.

Minimum adapter contract:

```ts
export interface FlowDomainAdapter {
  readonly key: string;
  buildFacts(input: FlowFactsInput): Promise<Record<string, unknown>>;
  applyEffect(input: FlowEffectInput): Promise<FlowEffectResult>;
  canView(input: FlowAccessInput): Promise<boolean>;
  canManage(input: FlowAccessInput): Promise<boolean>;
  resolveAgents?(input: FlowAgentResolutionInput): Promise<FlowResolvedAgent[]>;
}
```

Required semantics:

- `buildFacts` returns the facts used by rule evaluation. It must be deterministic for the same tenant, target, graph version, and signal.
- `applyEffect` executes host-side behavior requested by a transition effect. Flow records the requested effect and result, but the adapter owns the domain mutation.
- `canView` gates read access to target-bound workflow state when route permissions are not sufficient by themselves.
- `canManage` gates mutations such as graph changes, reassignment, waiver approval, and administrative run repair.
- `resolveAgents` is optional. If absent, only first-party actor and role assignment rules are available.

The adapter must receive the STYNX tenant context and actor context from the request or system execution context. It must not open raw database connections or bypass `@stynx-nyx/data`.

## Runtime Gap-Closure Decisions

The following decisions close the high-risk gaps found during the PORM Flow reassessment and are binding for `@stynx-nyx/flow` v1.

### Effect Dispatch

Flow owns effect delivery as a framework concern. Completing a node still appends `effect_requested` events, but those events are not the end of the contract. `@stynx-nyx/flow` must expose an explicit retryable dispatcher that:

- selects pending `effect_requested` events inside the current tenant;
- calls `FlowDomainAdapter.applyEffect` with tenant, actor/system, run, node, target, effect key, action, and payload context;
- appends exactly one terminal event per delivery attempt outcome, `effect_succeeded` or `effect_failed`;
- skips events that already have a terminal delivery event for the same request id or parent event id;
- never mutates the original `effect_requested` event.

Hosts may run the dispatcher from an admin route, a system worker, or a reference app job, but the delivery semantics remain package-owned so adapters do not need to poll the raw event table.

### Resolver Functions

`resolver_fn` agent rules are executable assignment rules, not final task assignees. Database functions may persist a task with `assignee_type = 'resolver'` as an unresolved intermediate, but runtime presentation must expand that resolver through `FlowDomainAdapter.resolveAgents` before returning candidates to callers. Returned agents are concrete STYNX user ids or permission keys whenever possible. If no adapter is registered, no resolver method exists, or the adapter returns no agents, the task remains visible to managers as unresolved with the resolver key and rule id for diagnosis.

### Node Form Rules

`flow.node_form_rules` are enforced gates. Human task completion may satisfy the node decision policy and still remain blocked when required form rules fail. Runtime must evaluate active rules before completing the node run:

- `all_required` requires the form facts for that form to have no missing required questions, considering active waivers;
- `any_answered` requires at least one answer or waiver for that form;
- `score_threshold` requires the form score to be greater than or equal to the rule threshold.

The database enum currently carries legacy values `all_required`, `any`, and `threshold`; API and Angular contracts expose the clearer aliases `all_required`, `any_answered`, and `score_threshold`. The backend must accept the aliases and persist the canonical database values until a migration renames the enum.

### PORM-Compatible API Aliases

STYNX keeps PORM-compatible fill and waiver aliases for migration ergonomics where they do not weaken tenancy, audit, or idempotency rules. These aliases are first-class routes over the same service methods as the canonical STYNX routes. Contract-compatible aliases must include `POST /flow/fills`, bulk `PUT /flow/fills/:fillId/answers`, fill-scoped waiver listing, form-scoped fill detail, form-scoped fill answers, and form-scoped fill waivers.

Answer and waiver mutations must refresh runtime facts for active targets. The current implementation does this through database triggers that call `flow.signal_changed(...)` after answer/waiver insert, update, or delete. This preserves PORM's useful freshness behavior without moving host-domain decisions into Flow.

### Analytics Paging And Filtering

Analytics list endpoints must be bounded. `GET /flow/open-tasks` and `GET /flow/runs/summary` return `&#123; data, meta &#125;`, where `meta` includes `page`, `pageSize`, and `total`. Supported filters are tenant-local and include scope, graph, status, target type/id, assignee user, current-user task view, and date ranges where the underlying query can support them without bypassing RLS.

### Task Privilege Semantics

Route permission is necessary but not sufficient for target-bound task work.

- Read operations require `flow:read:runtime` and adapter `canView` when the run is target-bound.
- Accept, decline, unaccept, and act require `flow:execute:task` and either the current assignee relation or an actionable candidate relation.
- Assign, unassign, transfer, manager candidate inspection, and withdraw-as-manager require `flow:assign:task` plus adapter `canManage` for the target.
- A current assignee may withdraw or unaccept their own accepted task through `flow:execute:task`; manager withdrawal requires `flow:assign:task`.
- Administrative repair remains `flow:admin:*` and must not be reachable through ordinary task actions.

### Policy Evaluation

Policy set and rule CRUD is not enough for closure. `@stynx-nyx/flow` must expose policy evaluation through a service and guarded HTTP route. Evaluation selects the active policy set for a scope unless a policy set id is supplied, applies rule priority, returns the first matching allow/deny decision, and returns a deterministic default allow result when no rule matches. Rule conditions use the same JSONPath rule evaluator as graph edges and node rules.

### Publish Versus Draft

Graph design edits are draft edits. Runtime execution must be bound to an
immutable published graph version.

`@stynx-nyx/flow` must expose `POST /flow/graphs/:id/publish` as the only public
transition from draft design state to runtime-eligible state. Publishing
validates graph structure, records a monotonically increasing
`publishedVersion`, and stores a runtime snapshot that later draft edits cannot
change. The implementation may choose the persistence model, but the API
contract in `docs/contracts/flow-api.md` is stable: Angular clients see
`status: 'draft' | 'published'` and `publishedVersion`, and runtime APIs resolve
only published versions.

This keeps `@stynx-web/angular-flow` presentation simple without moving runtime
selection rules into the browser.

### Angular Package Minimum

`@stynx-web/angular-flow` is closure-ready only when it has real package tests and a host can build the core PORM-derived workflows from exported package APIs. Minimum closure requires:

- route providers for design, runtime, tasks, forms, fills, waivers, analytics, and policies;
- a tested API facade for every route family in `docs/contracts/flow-api.md`, including aliases;
- publish/draft presentation backed by the `POST /flow/graphs/:id/publish` contract;
- permission-aware controls for mutating actions;
- host extension points for labels, links, target badges, and adapter-specific view/manage hints;
- component tests for route-bound graph, task, form, fill, waiver, and analytics workflows.

## Generic-Code Rule

`@stynx-nyx/flow` and `@stynx-web/angular-flow` must stay host-domain neutral.

Forbidden in generic Flow code:

- Imports from CMS packages or paths.
- Imports from PORM opportunity, proposal, engagement, or other PORM domain modules.
- Switch statements or string checks that special-case host domain names.
- Embedded domain SQL, domain table names, or domain permission names outside adapter configuration.
- Runtime callbacks that mutate host tables without going through the registered adapter.

Allowed:

- Opaque `adapter_key`, `target_type`, and `target_id` values.
- Declarative effect payloads stored as JSON.
- Adapter-provided labels, link builders, and candidate-agent results.
- Host-provided Angular route mounting and permission policy.

This rule is captured by `INV-FLOW-002`.

## Tenant And RLS Model

Every Flow row that belongs to a tenant must carry `tenant_id` and must be protected by PostgreSQL RLS using the STYNX transaction GUCs established by `@stynx-nyx/data`.

Tenant-owned tables include:

- `flow.scopes`
- `flow.graphs`
- `flow.nodes`
- `flow.edges`
- `flow.agent_rules`
- `flow.transition_effects`
- `flow.runs`
- `flow.node_runs`
- `flow.tasks`
- `flow.forms`
- `flow.questions`
- `flow.scores`
- `flow.fills`
- `flow.answers`
- `flow.waivers`
- `flow.node_form_rules`
- `flow.events`

Cross-row references must remain inside the same tenant. For example, a task may only reference a node run from the same tenant, and a graph may only reference a scope from the same tenant. Migrations must enforce this through composite foreign keys where practical and through integration tests where PostgreSQL cannot express the full rule cleanly.

Services must not manually add tenant predicates as their primary protection. Queries run inside `Database.tx(...)`; RLS is the boundary. Explicit tenant predicates are allowed only as defense-in-depth or for index selectivity, never as the sole isolation mechanism.

System maintenance operations must use `withSystemContext` with owner-role transactions and must document the reason string.

This rule is captured by `INV-FLOW-001`.

## Soft-Delete Model

Mutable design and user-owned data must use the STYNX soft-delete/archive model:

- scopes
- graphs
- nodes
- edges
- agent rules
- transition effects
- forms
- questions
- scores
- fills
- answers
- waivers
- node form rules

Runtime state rows are split:

- runs, node runs, and tasks are operational records. They may be cancellable, withdrawn, completed, or superseded through status transitions. They are not hard-deleted by normal APIs.
- events are an append-only workflow ledger and must not be soft-deleted through public APIs.

The no-soft-delete rule for `flow.events` is intentional. Events are evidence of workflow behavior and are distinct from editable design data. If an event contains incorrect payload data, the repair is a corrective event or platform audit entry, not mutation of the existing event.

## Event Ledger Versus Platform Audit

Flow events and STYNX platform audit answer different questions.

| Surface        | Purpose                                                                                       | Examples                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `flow.events`  | Domain workflow ledger for replay, diagnostics, task history, analytics, and adapter behavior | run started, signal received, node opened, task accepted, transition taken, effect requested |
| `@stynx-nyx/audit` | Platform security and compliance audit for who invoked which protected operation              | user updated graph, user assigned task, system repaired stuck run, admin approved waiver     |

Mutating HTTP handlers must emit platform audit through the normal STYNX audit path. Runtime services must also append Flow events when workflow state changes. One does not replace the other. Current curated Flow live tables have database DML audit enabled; future mutable curated Flow tables must do the same unless an explicit exception is documented.

This rule is captured by `INV-FLOW-003`.

## Backend Module Shape

`@stynx-nyx/flow` should expose:

- `StynxFlowModule` with `forRoot` or equivalent adapter registration.
- `FLOW_DOMAIN_ADAPTERS` provider token.
- Controllers for design, runtime, tasks, forms, analytics, and signal.
- Services equivalent in responsibility to PORM's design, runtime, forms, and analytics services, but rewritten on STYNX primitives.
- Public DTO and enum exports needed by host APIs and frontend packages.

Services must use `@stynx-nyx/data` transactions, STYNX route decorators, typed DTO validation, and host adapter injection. PORM's PL/pgSQL orchestration functions may be used as behavior evidence, but business orchestration should live in TypeScript services unless a future Architect decision explicitly moves a stable subset into database functions.

## Frontend Package Boundary

`@stynx-web/angular-flow` is a feature package that a host Angular shell mounts under a chosen route, commonly `/flow`.

It should expose:

- Route providers for design, runtime, task assignment, forms, fills, and waivers.
- An API facade over `@stynx-web/sdk` using the backend contract in `docs/contracts/flow-api.md`.
- Graph designer UI for scopes, graphs, nodes, edges, agent rules, and transition effects.
- Task workbench UI for open tasks, assignment, acceptance, action, withdrawal, and history.
- Form builder and fill UI for questions, scores, answers, waivers, and required-form gates.
- Host extension points for target labels, target links, adapter-specific badges, and can-view/can-manage policy hints.

The Angular package must respect STYNX auth and tenant headers through the shared frontend packages. It must not implement private token, tenant, or permission handling.

## Non-Goals

- CMS editorial workflows.
- PORM opportunity/proposal/engagement-specific behavior.
- A BPMN-complete engine.
- Cross-tenant shared workflows.
- A public plugin marketplace for workflow adapters.
- A standalone workflow UI shell independent of the STYNX frontend packages.

## Verification Requirements

Implementation prompts must create:

- database RLS and tenant-leak integration tests for `INV-FLOW-001`;
- static or unit tests proving generic Flow code has no host-domain imports or hard-coded domain behavior for `INV-FLOW-002`;
- event immutability and audit/event distinction tests for `INV-FLOW-003`;
- backend route permission tests covering every route family in `docs/contracts/flow-api.md`;
- Angular route, permission, service, and component tests for the expected host-mount model.
