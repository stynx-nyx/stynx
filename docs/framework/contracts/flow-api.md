# Flow API Contract

**Authority:** Architect (Constitution Article 6).
**Status:** Draft for `@stynx-nyx/flow`.

This contract defines the API shape that the STYNX Flow backend must expose and that `@stynx-nyx/angular-flow` must consume. It is intentionally route-family oriented. DTOs must be typed and validated in code, but this document does not freeze every field.

## Permissions

| Permission            | Meaning                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `flow:read:design`    | Read scopes, graphs, nodes, edges, rules, effects, forms, questions, and design metadata.          |
| `flow:write:design`   | Create, update, import, export, soft-delete, or restore workflow design records.                   |
| `flow:publish:design` | Validate a draft graph and publish an immutable runtime version.                                   |
| `flow:read:runtime`   | Read runs, node runs, tasks, events, fills, answers, waivers, and target workflow status.          |
| `flow:execute:task`   | Accept, decline, act on, withdraw, or complete a task the actor is allowed to work.                |
| `flow:assign:task`    | Assign, unassign, transfer, or candidate-list tasks.                                               |
| `flow:read:analytics` | Read aggregate task, run, event, and operational views.                                            |
| `flow:admin:*`        | Administrative repair, system maintenance, privileged import, and break-glass workflow operations. |

Route handlers may require both a STYNX permission and an adapter `canView` or `canManage` decision for target-bound resources.

## Cross-Cutting Route Rules

| Rule        | Contract                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth        | Every non-public endpoint uses `StynxAuthGuard` and `PermissionGuard`; public Flow endpoints are not part of v1.                                                         |
| Tenancy     | Every request executes under `TenantContext`. Tenant isolation is enforced by RLS, not ad hoc predicates.                                                                |
| Read-only   | Read endpoints must use readonly transactions and the `@ReadOnly` route contract where the local package pattern supports it.                                            |
| Audit       | Mutations are platform-audited through STYNX audit and may also append Flow events.                                                                                      |
| Idempotency | Runtime creation, signal, task action, assignment, waiver approval, and import endpoints must support safe retry through idempotency keys or service-level natural keys. |
| Rate limit  | Mutation endpoints that a user or external automation can call repeatedly must carry an explicit rate-limit policy.                                                      |
| System-only | Administrative repair and maintenance routes are either internal providers or `@System`/admin guarded endpoints; they must not be reachable as ordinary user mutations.  |

## Common Response Shapes

Paged list endpoints return:

```ts
interface FlowPage<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```

The default `page` is `1`. The default `pageSize` is `50`. Implementations must clamp `pageSize` to a package-owned maximum and must not expose unbounded tenant data sets.

## Endpoint Groups

All paths below are canonical logical paths. A host app may mount the package under a global API prefix.

### Design

| Route family                                                                                                                                 | Permission                                                      | Behavior                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /flow/scopes` and `GET /flow/scopes/:id`                                                                                                | `flow:read:design`                                              | Read-only list/detail.                                                  |
| `POST /flow/scopes`, `PATCH /flow/scopes/:id`, `DELETE /flow/scopes/:id`                                                                     | `flow:write:design`                                             | Audited, rate-limited, soft-delete for delete.                          |
| `GET /flow/graphs`, `GET /flow/graphs/:id`, `GET /flow/graphs/:id/export`                                                                    | `flow:read:design`                                              | Read-only graph catalog/export.                                         |
| `POST /flow/graphs`, `POST /flow/graphs/import`, `PATCH /flow/graphs/:id`, `DELETE /flow/graphs/:id`                                         | `flow:write:design`                                             | Audited, idempotent where creation/import can be retried, rate-limited. |
| `POST /flow/graphs/:id/publish`                                                                                                              | `flow:publish:design`                                           | Audited, idempotent publish of the current draft to a runtime version.  |
| `GET /flow/graphs/:graphId/nodes`, `GET /flow/graphs/:graphId/edges`, `GET /flow/graphs/:graphId/transition-effects`                         | `flow:read:design`                                              | Read-only graph composition.                                            |
| `POST /flow/graphs/:graphId/nodes`, `POST /flow/graphs/:graphId/edges`, `POST /flow/graphs/:graphId/transition-effects`                      | `flow:write:design`                                             | Audited design mutations.                                               |
| `PATCH /flow/nodes/:id`, `DELETE /flow/nodes/:id`                                                                                            | `flow:write:design`                                             | Audited; delete is soft-delete.                                         |
| `PATCH /flow/edges/:id`, `DELETE /flow/edges/:id`                                                                                            | `flow:write:design`                                             | Audited; delete is soft-delete.                                         |
| `GET /flow/nodes/:nodeId/agent-rules`, `POST /flow/nodes/:nodeId/agent-rules`, `PATCH /flow/agent-rules/:id`, `DELETE /flow/agent-rules/:id` | read uses `flow:read:design`; mutations use `flow:write:design` | Assignment rule design.                                                 |
| `PATCH /flow/transition-effects/:id`, `DELETE /flow/transition-effects/:id`                                                                  | `flow:write:design`                                             | Effect design mutation, never direct domain mutation.                   |

### Runtime

| Route family                                                                                                                                            | Permission                                                                         | Behavior                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /flow/runs`, `GET /flow/runs/:id`, `GET /flow/runs/:id/nodes`, `GET /flow/runs/:id/tasks`, `GET /flow/runs/:id/events`, `GET /flow/runs/:id/facts` | `flow:read:runtime` plus adapter `canView` when target-bound                       | Read-only runtime inspection.                                                                                                        |
| `POST /flow/runs` and `POST /flow/runs/ensure`                                                                                                          | `flow:read:runtime` plus adapter `canManage` for creation                          | Idempotent run creation or lookup for one graph/target pair. Audited.                                                                |
| `PATCH /flow/runs/:id`                                                                                                                                  | `flow:admin:*` or adapter `canManage` with a narrow action permission              | Administrative status repair only; audited and rate-limited.                                                                         |
| `GET /flow/node-runs`, `GET /flow/node-runs/:id`                                                                                                        | `flow:read:runtime`                                                                | Read-only.                                                                                                                           |
| `GET /flow/events`                                                                                                                                      | `flow:read:runtime`                                                                | Read-only append-only event ledger. No update or delete endpoint.                                                                    |
| `POST /flow/signal`                                                                                                                                     | `flow:read:runtime` plus adapter `canManage` for the target or a system credential | Idempotent, audited, rate-limited. Rebuilds facts and advances eligible runs.                                                        |
| `POST /flow/effects/dispatch`                                                                                                                           | `flow:admin:*` or system worker context                                            | Retryable effect delivery. Calls `FlowDomainAdapter.applyEffect` and appends success/failure events without mutating request events. |

`POST /flow/effects/dispatch` accepts `runId`, `effectEventId`, `limit`, and `reason` filters. A user-facing admin route requires platform audit and rate limiting. A background worker may call the same service under system context. The response is a summary object with attempted, succeeded, failed, and skipped counts plus per-effect diagnostics.

### Tasks

| Route family                                                                                       | Permission                                                            | Behavior                                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /flow/tasks`, `GET /flow/tasks/:id`, `GET /flow/open-tasks`                                   | `flow:read:runtime` plus adapter `canView` where target-bound         | Read-only user and manager task lists.                                  |
| `POST /flow/tasks/:id/accept`                                                                      | `flow:execute:task`                                                   | Idempotent when already accepted by same actor; audited; appends event. |
| `POST /flow/tasks/:id/decline`                                                                     | `flow:execute:task`                                                   | Audited; appends event; may trigger reassignment.                       |
| `POST /flow/tasks/:id/unaccept`                                                                    | `flow:execute:task`                                                   | Audited; appends event.                                                 |
| `POST /flow/tasks/:id/withdraw`                                                                    | `flow:execute:task` or `flow:assign:task` depending on actor relation | Audited; appends event.                                                 |
| `POST /flow/tasks/:id/act`                                                                         | `flow:execute:task`                                                   | Idempotent by action key; audited; may complete task and advance run.   |
| `POST /flow/tasks/:id/assign`, `POST /flow/tasks/:id/unassign`                                     | `flow:assign:task`                                                    | Audited; appends event; adapter `canManage` may also be required.       |
| `GET /flow/tasks/:id/candidates`, `GET /flow/tasks/roles/:role/users`, `GET /flow/tasks/users/:id` | `flow:assign:task`                                                    | Read-only candidate resolution; no mutation.                            |

Task action privilege checks are:

- `accept`, `decline`, and `unaccept`: `flow:execute:task`; allowed for the current assignee or a concrete candidate returned by assignment resolution.
- `act`: `flow:execute:task`; allowed only for the current assignee or an accepted candidate, and the action key must be in `allowedActions`.
- `assign` and `unassign`: `flow:assign:task` and adapter `canManage` for target-bound tasks.
- `withdraw`: current assignee can withdraw with `flow:execute:task`; manager withdrawal requires `flow:assign:task` and adapter `canManage`.
- `candidates`, role-user lookup, and user lookup: `flow:assign:task`; target-bound task candidate views require adapter `canManage`.

### Forms

| Route family                                                                                                                                       | Permission                                                                        | Behavior                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /flow/forms`, `GET /flow/forms/:id`, `GET /flow/forms/:formId/questions`                                                                      | `flow:read:design`                                                                | Read-only form design.                                                                                                                                                                                                   |
| `POST /flow/forms`, `PATCH /flow/forms/:id`, `DELETE /flow/forms/:id`                                                                              | `flow:write:design`                                                               | Audited design mutation; delete is soft-delete.                                                                                                                                                                          |
| `POST /flow/forms/:formId/questions`, `PATCH /flow/questions/:id`, `DELETE /flow/questions/:id`                                                    | `flow:write:design`                                                               | Audited question design mutation.                                                                                                                                                                                        |
| `GET /flow/questions/:id/score`, `PUT /flow/questions/:id/score`, `DELETE /flow/questions/:id/score`                                               | read uses `flow:read:design`; mutations use `flow:write:design`                   | Optional scoring metadata.                                                                                                                                                                                               |
| `GET /flow/forms/:formId/fills`, `GET /flow/fills`, `GET /flow/fills/:id`                                                                          | `flow:read:runtime` plus adapter `canView` when target-bound                      | Read-only fill inspection.                                                                                                                                                                                               |
| `POST /flow/forms/:formId/fills`, `POST /flow/fills`, `DELETE /flow/fills/:id`                                                                     | `flow:execute:task` or `flow:admin:*` depending on context                        | Audited; delete is soft-delete or status transition, not hard delete.                                                                                                                                                    |
| `GET /flow/fills/:fillId/answers`, `POST /flow/fills/:fillId/answers`, `PUT /flow/fills/:fillId/answers`                                           | read uses `flow:read:runtime`; mutations use `flow:execute:task`                  | Answer writes are audited and idempotent by fill/question. Bulk PUT replaces/upserts the submitted answer set for a fill. Answer and waiver mutations re-signal the active target so form-gated auto nodes do not stale. |
| `PATCH /flow/answers/:id`, `DELETE /flow/answers/:id`                                                                                              | `flow:execute:task` or `flow:admin:*`                                             | Audited answer correction.                                                                                                                                                                                               |
| `GET /flow/waivers`, `POST /flow/waivers`, `PATCH /flow/waivers/:id`, `DELETE /flow/waivers/:id`                                                   | read uses `flow:read:runtime`; mutations use `flow:assign:task` or `flow:admin:*` | Waiver approval/correction; audited.                                                                                                                                                                                     |
| `GET /flow/nodes/:nodeId/form-rules`, `POST /flow/nodes/:nodeId/form-rules`, `PATCH /flow/node-form-rules/:id`, `DELETE /flow/node-form-rules/:id` | read uses `flow:read:design`; mutations use `flow:write:design`                   | Declarative form gates for task nodes.                                                                                                                                                                                   |

PORM-compatible aliases are intentionally supported:

| Alias                                            | Canonical behavior                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `POST /flow/fills`                               | Creates a fill; body must include `formId`.                                                  |
| `PUT /flow/fills/:fillId/answers`                | Bulk answer upsert for one fill.                                                             |
| `GET /flow/fills/:fillId/waivers`                | Lists waivers for the fill target without requiring the host to preserve form route context. |
| `GET /flow/forms/:formId/fills/:fillId`          | Same as `GET /flow/fills/:id`, with form consistency validation.                             |
| `GET /flow/forms/:formId/fills/:fillId/answers`  | Same as `GET /flow/fills/:fillId/answers`, with form consistency validation.                 |
| `GET /flow/forms/:formId/fills/:fillId/waivers`  | Lists waivers for the fill target and form.                                                  |
| `POST /flow/forms/:formId/fills/:fillId/waivers` | Creates a waiver for the fill target and form.                                               |

Node form rules expose `gatingMode` as `all_required`, `any_answered`, or `score_threshold`. Until the database enum is renamed, the backend maps `any_answered` to `any` and `score_threshold` to `threshold` at persistence boundaries.

### Policies

| Route family                                                                                                       | Permission                                                   | Behavior                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `GET /flow/policies/sets`, `GET /flow/policies/sets/:id`                                                           | `flow:read:design`                                           | Read-only policy set design.                                        |
| `POST /flow/policies/sets`, `PATCH /flow/policies/sets/:id`, `DELETE /flow/policies/sets/:id`                      | `flow:write:design`                                          | Audited design mutation; delete is soft-delete.                     |
| `GET /flow/policies/sets/:policySetId/rules`, `GET /flow/policies/rules/:id`                                       | `flow:read:design`                                           | Read-only policy rule design.                                       |
| `POST /flow/policies/sets/:policySetId/rules`, `PATCH /flow/policies/rules/:id`, `DELETE /flow/policies/rules/:id` | `flow:write:design`                                          | Audited design mutation; delete is soft-delete.                     |
| `POST /flow/policies/evaluate`                                                                                     | `flow:read:runtime` plus adapter `canView` when target-bound | Evaluates an active or explicit policy set against submitted facts. |

Policy evaluation input includes `scopeId` or `scopeCode`, optional `policySetId`, optional `nodeCode`, optional `statusCode`, exactly one of `action` or `capability`, optional `facts`, and optional target context for adapter checks. The response includes `allowed`, `effect`, `reasonCode`, `matchedRuleId`, and `defaulted`.

### Graph Publishing

Draft graph editing and runtime graph execution are separate contracts.

`FlowGraph` DTOs returned by graph list/detail/export must expose:

```ts
interface FlowGraph {
  id: string;
  scopeId: string;
  code: string;
  version: string;
  status: 'draft' | 'published';
  publishedVersion?: number;
  publishedAt?: string;
  publishedBy?: string | null;
  name?: string | null;
  description?: string | null;
  meta: Record<string, unknown>;
}
```

`status` is a presentation/runtime contract. Implementations may derive it from
first-class columns or from package-owned publish metadata, but API responses
must not require Angular clients to inspect internal persistence fields such as
`isActive`.

`POST /flow/graphs/:id/publish` accepts:

```ts
interface PublishFlowGraphRequest {
  expectedDraftVersion?: string;
  notes?: string;
}
```

The request must also honor the standard `Idempotency-Key` header.

The response is:

```ts
interface PublishFlowGraphResponse {
  graphId: string;
  status: 'published';
  draftVersion: string;
  publishedVersion: number;
  publishedAt: string;
  publishedBy?: string | null;
  runtimeGraphRef: {
    graphId: string;
    version: number;
  };
}
```

Publish semantics:

- publishing validates that the graph has exactly one start node, at least one
  terminal node, no dangling edges, and no invalid rule/effect/form references;
- publish creates or updates a tenant-local immutable runtime snapshot and
  increments `publishedVersion` monotonically for the graph id;
- repeated publish with the same idempotency key returns the original response;
- `PATCH /flow/graphs/:id` and child design mutations affect the draft only and
  must not mutate an already published runtime snapshot;
- new runs and `POST /flow/runs/ensure` resolve the latest published version
  unless an explicit published version is supplied;
- draft-only graphs return `409` when used for runtime creation.

Publish errors:

| Status | Meaning                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Draft graph is structurally invalid; response details identify validation failures by node/edge/effect/form key where possible.                    |
| `403`  | Actor lacks `flow:publish:design`.                                                                                                                 |
| `404`  | Graph is not visible in the active tenant.                                                                                                         |
| `409`  | `expectedDraftVersion` does not match the current draft, a conflicting idempotency key was reused, or runtime attempted to use a draft-only graph. |

Publish is a platform-audited mutation with action `flow.graph.publish` and
entity `flow.graphs`. It may also append a Flow event for design diagnostics,
but platform audit remains the security/compliance record.

### Analytics

| Route family                              | Permission                                                 | Behavior                       |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `GET /flow/runs/summary`                  | `flow:read:analytics`                                      | Read-only aggregate run view.  |
| `GET /flow/open-tasks`                    | `flow:read:analytics` or `flow:read:runtime` for own tasks | Read-only open-task view.      |
| `GET /flow/events` with aggregate filters | `flow:read:analytics`                                      | Read-only event log reporting. |

Analytics routes must not reveal target data unless the adapter `canView` check permits it or the adapter has provided pre-redacted labels.

`GET /flow/open-tasks` returns `FlowPage<FlowOpenTask>` and supports `page`, `pageSize`, `scopeId`, `scopeCode`, `graphId`, `targetType`, `targetId`, `status`, `assigneeUserId`, `mine`, `dueBefore`, and `dueAfter`.

`GET /flow/runs/summary` returns `FlowPage<FlowRunSummary>` and supports `page`, `pageSize`, `scopeId`, `scopeCode`, `graphId`, `targetType`, `targetId`, `status`, `createdFrom`, and `createdTo`.

## DTO And Schema Principles

DTOs must follow these rules:

- Every tenant-owned record has server-owned `tenantId`; clients do not submit it.
- Every mutable record exposes `id`, `createdAt`, `updatedAt`, `createdBy`, and `updatedBy` where the underlying table carries those columns.
- Soft-deleted records are excluded by default. Admin/read-design APIs may opt into deleted records only through an explicit query option and permission.
- Design DTOs separate identity from graph shape. Import/export DTOs may carry nested graph documents, but regular mutation DTOs operate on one aggregate root or child collection at a time.
- Runtime DTOs expose opaque target identifiers and adapter labels/links, not host-domain table internals.
- Graph DTOs expose `status` and `publishedVersion` for UI behavior; Angular clients must not derive publish state from persistence-only fields.
- JSON rule/effect payloads must be validated against package-owned schemas or adapter-declared schemas before persistence.
- Task action DTOs carry an action key, optional payload, optional idempotency key, and optional comment/reason.
- Form answer DTOs carry question id, value, optional evidence metadata, and idempotency key when written in bulk.
- Date/time fields are ISO strings at the API boundary.
- Stable branching uses machine codes and enum values, never localized messages.

## System-Only Operations

The following operations are not ordinary public API routes unless a later Architect decision says otherwise:

- Backfilling graph versions.
- Replaying or repairing stuck runs.
- Rebuilding analytics materialized views.
- Re-emitting events after failed adapter effects.
- Tenant-wide workflow archival.

If exposed, they must require `flow:admin:*`, system context, platform audit, and explicit rate limits.
