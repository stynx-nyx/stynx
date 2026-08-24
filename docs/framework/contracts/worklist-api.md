# Worklist API Contract

**Authority:** Architect (Constitution Article 6).
**Status:** Accepted for `@stynx-nyx/worklist`.

This contract defines the programmatic work-distribution surface exported by
`@stynx-nyx/worklist`. It is deliberately independent of HTTP routing, Flow,
jobs, outbox, and notifications packages.

## Boundary

Worklist distributes references to work. It does not define a business process
or complete the referenced entity.

- Flow owns graphs, runs, tasks, forms, allowed actions, decisions, and
  transitions.
- Worklist owns queues, RBAC-derived worker eligibility, claim/release,
  reassignment, supervisor overrides, workload strategy, and due/breach clocks.
- A Flow task is enqueued as `{ entityType: 'flow.task', entityId: task.id }`.
- `WorklistItemsService.complete()` closes only the work item. The host invokes
  Flow's task action separately and chooses an explicit transaction or
  reconciliation policy.

See `ADR-WORKLIST-0001` for the durable decision.

## Module and public services

```ts
import {
  StynxWorklistModule,
  WorklistItemsService,
  WorklistQueuesService,
  WorklistSlaService,
} from '@stynx-nyx/worklist';
```

`StynxWorklistModule.forRoot(options)` exports the three services and the
strategy registry. All database calls require an active STYNX tenant and actor
request context unless the documented host scheduler adapter establishes one.

### `WorklistQueuesService`

| Operation | Contract |
| --- | --- |
| `create(input)` | Creates a tenant queue with concrete worker and supervisor RBAC permission keys. |
| `update(id, input)` | Updates queue policy; permission and strategy changes are audited. |
| `get(id)` / `list(query)` | Reads tenant-visible queue definitions. |
| `setWorkerState(queueId, input)` | Records availability, weight, and rotation state for an RBAC-eligible user; it never grants eligibility. |

Queue strategy keys are `pull`, `round_robin`, `load_balanced`, or a registered
custom key. Queue defaults may define either elapsed seconds or business days,
never both.

### `WorklistItemsService`

| Operation | Contract |
| --- | --- |
| `enqueue(input)` | Creates one open item per `(queue, entityType, entityId)` and resolves the deadline. |
| `claimNext(queueId, userId?)` | Atomically claims the next ordered item for the actor or specified eligible user. |
| `claim(itemId, userId?)` | Atomically claims one known pending item. |
| `assignNext(queueId)` | Applies the queue's push strategy; `pull` queues reject this operation. |
| `release(itemId, reason?)` | Returns a claimed item to pending; only its assignee may call it. |
| `complete(itemId, note?, payload?)` | Idempotently completes a claimed item for its assignee. |
| `reassign(itemId, toUserId, reason)` | Supervisor-authorized reassignment; reason is mandatory. |
| `supervisorOverride(input)` | Explicit `release`, `complete`, or `reassign` override; supervisor permission and reason are mandatory. |
| `get(id)` / `list(query)` | Reads tenant-visible work items. |
| `listEvents(query)` | Reads the append-only, cursor-ordered worklist event stream. |

Claim ordering is priority ascending, due date ascending with undated items
last, creation time ascending, then id. Claim and assignment return `null` when
no item is currently claimable. A claim-limit or state conflict is distinct
from an empty queue.

### Deadline inputs

```ts
type WorklistDeadline =
  | { kind: 'absolute'; dueAt: Date | string }
  | {
      kind: 'business_days';
      businessDays: number;
      calendarKey?: string;
      startAt?: Date | string;
    };
```

An explicit item deadline overrides the queue default. Business-day deadlines
require `WorklistBusinessCalendar`; there is no weekend-only fallback because
that would fabricate statutory prazo semantics. The service persists both the
resolved `dueAt` and the deadline kind/count/calendar key.

### `WorklistSlaService`

| Operation | Contract |
| --- | --- |
| `detectBreaches(limit?)` | Atomically marks at most `limit` overdue open items and returns their newly appended breach events. |
| `scheduleBreachDetection(input)` | Delegates recurring scheduling through the optional narrow scheduler port. |

`detectBreaches` is safe under concurrent sweepers: each item produces at most
one `deadline_breach` event. The stable job type is
`stynx.worklist.detect-breaches`.

## Ports

```ts
interface WorklistBusinessCalendar {
  addBusinessDays(input: {
    tenantId: string;
    calendarKey?: string;
    startAt: Date;
    businessDays: number;
  }): Promise<Date>;
}

interface WorklistSchedulerPort {
  scheduleRecurring(input: {
    key: string;
    tenantId: string;
    jobType: 'stynx.worklist.detect-breaches';
    intervalSeconds: number;
    payload: { tenantId: string; limit: number };
  }): Promise<unknown>;
}

interface WorklistEventSink {
  publish(event: WorklistEvent): Promise<void>;
}
```

The calendar, scheduler, and event sink are host-owned adapters. The event sink
should be backed by a durable outbox when notification delivery must survive a
process crash. If no sink is configured, events remain consumable from the
append-only database ledger.

## Strategy extension

Custom strategies implement `WorklistDistributionStrategy` and are registered
through module options. They receive a queue snapshot and only RBAC-eligible
candidates with current open counts, weights, availability, and rotation
timestamps. They return a candidate user id or `null`.

The service rejects an unknown key, a returned user outside the supplied
candidate set, or custom registration under a built-in key. The database
re-checks tenant, permission, availability, and claim limit during the atomic
hand-off; custom code cannot bypass those controls.

## RBAC and supervisor rules

Permission keys follow STYNX's canonical `resource:action:scope` shape and must
already exist in `auth.perms`.

- Worker eligibility is derived from active `auth.memberships`, role grants,
  group-role grants, and direct allow grants, including segment wildcards.
- A worker-state row without the worker permission grants nothing.
- `reassign` and every supervisor override require the queue's supervisor
  permission for the current actor.
- Override may bypass worker availability but never the worker's RBAC
  permission or tenant membership.

Suggested route permissions for host APIs are:

| Host operation | Permission |
| --- | --- |
| Read queues/items/events | `worklist:read:*` |
| Enqueue | `worklist:enqueue:*` |
| Claim/release/complete own work | queue-specific worker permission |
| Configure queues | `worklist:configure:*` |
| Reassign/override | queue-specific supervisor permission |

## Audit, events, and tenancy

- Every table forces RLS and is scoped by `app.tenant_id`.
- Worklist-to-worklist foreign keys include `tenant_id`.
- Platform audit triggers cover queue definitions, worker state, items, and the
  operational event ledger.
- Item events are append-only and include actor, before/after assignee, reason,
  event payload, and timestamp.
- Reassignment and every override require a non-empty reason.
- Deadline breach events include the resolved due date and referenced entity.

## Jobs and notifications integration

Worklist has no hard dependency on either package. The host integration:

1. adapts the jobs scheduler to `WorklistSchedulerPort`;
2. registers `stynx.worklist.detect-breaches` as a tenant-context job handler;
3. calls `WorklistSlaService.detectBreaches(payload.limit)`;
4. bridges returned or ledger-read `deadline_breach` events to outbox and
   notifications through a durable `WorklistEventSink` adapter.

The host, not this package, owns recipient choice, templates, channels, retry,
delivery tracking, and escalation policy.
