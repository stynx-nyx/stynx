# `@stynx-nyx/worklist` — tenant-scoped work queues, atomic claiming, distribution strategies and SLA clocks

`@stynx-nyx/worklist` provides tenant-scoped work distribution for STYNX applications: RBAC-derived queues, atomic claiming, pull, round-robin, load-balanced and custom strategies, audited assignment operations, and SLA/prazo clocks. A work item is a polymorphic reference (`entityType`, `entityId`) to something owned elsewhere; the package distributes the reference and tracks who holds it and when it is due.

## Purpose

Applications that route cases to people need more than an `assigned_to` column: who is eligible, who claims first when two people click at once, how work is balanced, who may reassign, and whether a deadline was missed. This package answers those questions with three services over a PostgreSQL schema that enforces eligibility and claim atomicity in the database.

Worklist composes with [`@stynx-nyx/flow`](/docs/packages/flow/); it does not replace Flow tasks or domain state machines. Enqueue a Flow task as a polymorphic reference and coordinate completion explicitly in the host application: `WorklistItemsService.complete()` closes only the work item.

What it does not do: it does not expose HTTP routes, it does not grant eligibility (worker state records availability, not access), it does not embed a holiday catalog, and it has no hard dependency on a jobs, outbox or notifications package. The scheduler, business calendar and event sink are host-supplied ports.

See `docs/framework/contracts/worklist-api.md` and `law/adr/ADR-WORKLIST-0001-flow-boundary-distribution-sla.md` for the contract and boundary decision.

## Audience

Backend developers building case, appeal or task distribution with eligibility rules and deadlines, and hosts integrating breach detection with their own scheduler and notification stack.

## Install

```bash
pnpm add @stynx-nyx/worklist
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

## Quick start

```ts
import { StynxWorklistModule } from '@stynx-nyx/worklist';

@Module({
  imports: [StynxWorklistModule.forRoot()],
})
export class AppModule {}
```

The services inject `Database` from [`@stynx-nyx/data`](/docs/packages/data/) and `RequestContext` from [`@stynx-nyx/core`](/docs/packages/core/). Calls run inside an active tenant and actor request context.

```ts
import { WorklistItemsService, WorklistQueuesService } from '@stynx-nyx/worklist';

const queue = await queues.create({
  code: 'appeals-review',
  name: 'Appeals review',
  requiredPermission: 'rait:review:appeals',
  supervisorPermission: 'rait:supervise:appeals',
  defaultDeadline: { kind: 'elapsed', seconds: 86_400 },
});

await items.enqueue({
  queueCode: 'appeals-review',
  entityType: 'rait.appeal',
  entityId: appeal.id,
});

const claimed = await items.claimNext(queue.id); // null when nothing is claimable
if (claimed) await items.complete(claimed.id, 'reviewed');
```

## Public API surface

### Modules

| Export                | Signature                                   | Description                                                                                   |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `StynxWorklistModule` | `.forRoot(options?: WorklistModuleOptions)` | Provides and exports the three services, `WorklistStrategyRegistry` and the four port tokens. |

### `WorklistQueuesService`

| Method                           | Description                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create(input)`                  | Creates a tenant queue with concrete worker and supervisor permission keys. `strategy` defaults to `pull`.    |
| `update(id, input)`              | Updates queue policy; `code` cannot be changed.                                                               |
| `get(id)` / `getByCode(code)`    | Reads one queue; throws `WorklistNotFoundError` when absent.                                                  |
| `list(query?)`                   | Paged queue list ordered by `code`. `page` defaults to 1, `pageSize` to 50 (maximum 100).                     |
| `setWorkerState(queueId, input)` | Records availability, weight (default 1) and metadata for an RBAC-eligible user; it never grants eligibility. |

### `WorklistItemsService`

| Method                               | Description                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `enqueue(input)`                     | Creates an item in the queue named by `queueCode` and resolves its deadline.                                            |
| `claimNext(queueId, userId?)`        | Atomically claims the next ordered item for the actor or the given eligible user; `null` when none.                     |
| `claim(itemId, userId?)`             | Atomically claims one known pending item.                                                                               |
| `assignNext(queueId)`                | Applies the queue's push strategy; `null` when nothing is assignable. `pull` queues reject this call.                   |
| `release(itemId, reason?)`           | Returns a claimed item to pending; only its assignee may call it.                                                       |
| `complete(itemId, note?, payload?)`  | Completes a claimed item for its assignee.                                                                              |
| `cancel(itemId, reason)`             | Cancels an item.                                                                                                        |
| `reassign(itemId, toUserId, reason)` | Supervisor-authorized reassignment; the reason is mandatory.                                                            |
| `supervisorOverride(input)`          | Explicit `release`, `complete` or `reassign` override; `reason` is mandatory and `toUserId` is required for `reassign`. |
| `get(id)` / `list(query?)`           | Reads items. `list` filters by `queueId`, `status`, `assigneeId`, `entityType`.                                         |
| `listEvents(query?)`                 | Reads the append-only item event ledger, filtered by `itemId`, `after`, `afterId`.                                      |

Claim and list ordering is priority ascending, due date ascending with undated items last, creation time ascending, then id.

### `WorklistSlaService`

| Method                           | Description                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `detectBreaches(limit = 100)`    | Marks at most `limit` (1–1000) overdue open items and returns the newly appended `deadline_breach` events. |
| `scheduleBreachDetection(input)` | Delegates recurring scheduling to `WorklistSchedulerPort` with job type `WORKLIST_BREACH_JOB_TYPE`.        |

### Strategies

| Export                           | Description                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `WorklistStrategyRegistry`       | Holds custom strategies: `register(strategy)`, `get(key)`, `require(key)`. Built-in keys cannot be registered. |
| `RoundRobinWorklistStrategy`     | Selects the available candidate with the oldest `lastAssignedAt`, ties broken by `userId`.                     |
| `LoadBalancedWorklistStrategy`   | Selects the available candidate with the lowest `openItemCount / weight`.                                      |
| `BUILTIN_WORKLIST_STRATEGY_KEYS` | `['pull', 'round_robin', 'load_balanced']`.                                                                    |

### Calendar, clock and ports

| Export                       | Description                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `TenantBusinessCalendar`     | `WorklistBusinessCalendar` implementation over host-provided `timezoneForTenant` and `holidaysFor` callbacks. |
| `SystemWorklistClock`        | Default `WorklistClock`; returns `new Date()`.                                                                |
| `NoopWorklistEventSink`      | Default `WorklistEventSink`; discards events.                                                                 |
| `WORKLIST_BUSINESS_CALENDAR` | Injection token for the calendar (`null` when not configured).                                                |
| `WORKLIST_SCHEDULER`         | Injection token for the scheduler port (`null` when not configured).                                          |
| `WORKLIST_EVENT_SINK`        | Injection token for the event sink.                                                                           |
| `WORKLIST_CLOCK`             | Injection token for the clock.                                                                                |
| `WORKLIST_BREACH_JOB_TYPE`   | `'stynx.worklist.detect-breaches'`.                                                                           |

### Functions

| Export                    | Description                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `resolveWorklistDeadline` | Resolves an item deadline or queue default to `ResolvedWorklistDeadline`, or `null` when neither is given.             |
| `parseWorklistInput`      | `(schema, input)`; returns parsed data or throws `WorklistInputError` with the zod issues in its context.              |
| `mapWorklistSqlError`     | Maps the schema's SQL error codes and constraint violations to the typed errors below; returns other errors unchanged. |

The barrel also re-exports the zod schemas the services validate with (`createQueueSchema`, `updateQueueSchema`, `workerStateSchema`, `enqueueWorkItemSchema`, `supervisorOverrideSchema`, `worklistDeadlineSchema`, `queueDefaultDeadlineSchema`, `pageQuerySchema`, `itemListQuerySchema`, `eventListQuerySchema`, `scheduleBreachSchema`) and the row-mapping helpers used internally (`mapQueueRow`, `mapWorkerStateRow`, `mapItemRow`, `mapEventRow`, `mapCandidateRow`, `pageLimitOffset`, `requireObject`, and the `QUEUE_COLUMNS`, `WORKER_STATE_COLUMNS`, `ITEM_COLUMNS`, `EVENT_COLUMNS` column lists).

### Errors

All extend `StynxWorklistError`, which extends `StynxError` from [`@stynx-nyx/core`](/docs/packages/core/).

| Export                              | Code                                     | Status | Raised when                                                                                   |
| ----------------------------------- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `WorklistInputError`                | `WORKLIST_INPUT_INVALID`                 | 400    | Validation failure, invalid calendar data, or a custom strategy selecting an ineligible user. |
| `UnknownWorklistStrategyError`      | `WORKLIST_STRATEGY_UNKNOWN`              | 400    | A queue names a custom strategy that is not registered.                                       |
| `WorklistForbiddenError`            | `WORKLIST_FORBIDDEN`                     | 403    | The actor lacks the permission, is unavailable, or is not the assignee.                       |
| `WorklistNotFoundError`             | `WORKLIST_NOT_FOUND`                     | 404    | Queue or item not found.                                                                      |
| `WorklistConflictError`             | `WORKLIST_CONFLICT`                      | 409    | State conflict, claim limit reached, uniqueness violation, or `assignNext` on a `pull` queue. |
| `WorklistStrategyRegistrationError` | `WORKLIST_STRATEGY_REGISTRATION_INVALID` | 500    | Registering a built-in or duplicate strategy key.                                             |
| `WorklistCalendarRequiredError`     | `WORKLIST_BUSINESS_CALENDAR_REQUIRED`    | 500    | A business-day deadline is requested with no calendar configured.                             |
| `WorklistSchedulerRequiredError`    | `WORKLIST_SCHEDULER_REQUIRED`            | 500    | `scheduleBreachDetection` is called with no scheduler configured.                             |

### Types

| Export                                                                                    | Description                                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `WorklistModuleOptions`                                                                   | `forRoot()` options.                                                         |
| `WorklistQueueRecord`, `WorklistWorkerStateRecord`, `WorklistItemRecord`, `WorklistEvent` | Persisted record shapes.                                                     |
| `WorklistItemStatus`, `WorklistEventKind`                                                 | Item states (`pending`, `claimed`, `completed`, `canceled`) and event kinds. |
| `CreateWorklistQueueInput`, `UpdateWorklistQueueInput`, `SetWorklistWorkerStateInput`     | Queue service inputs.                                                        |
| `EnqueueWorkItemInput`, `WorklistSupervisorOverrideInput`                                 | Item service inputs.                                                         |
| `WorklistDeadline`, `WorklistQueueDefaultDeadline`, `ResolvedWorklistDeadline`            | Item deadline, queue default and resolved deadline.                          |
| `WorklistPage`                                                                            | `{ data, meta: { page, pageSize, total } }`.                                 |
| `WorklistDistributionStrategy`, `WorklistDistributionContext`, `WorklistCandidate`        | Custom strategy contract and its inputs.                                     |
| `WorklistBusinessCalendar`, `WorklistSchedulerPort`, `WorklistEventSink`, `WorklistClock` | Host-supplied ports.                                                         |
| `TenantBusinessCalendarSource`                                                            | Callbacks consumed by `TenantBusinessCalendar`.                              |
| `BuiltinWorklistStrategyKey`, `WorklistJsonObject`, `WorklistRow`                         | Supporting types.                                                            |

## Configuration

### `StynxWorklistModule.forRoot()` options

| Option       | Type                             | Default                 | Description                                                                |
| ------------ | -------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `calendar`   | `WorklistBusinessCalendar`       | none (`null`)           | Required for `business_days` deadlines.                                    |
| `scheduler`  | `WorklistSchedulerPort`          | none (`null`)           | Required for `scheduleBreachDetection`.                                    |
| `eventSink`  | `WorklistEventSink`              | `NoopWorklistEventSink` | Receives each item event after the service's transaction callback returns. |
| `clock`      | `WorklistClock`                  | `SystemWorklistClock`   | Source of "now" for deadline resolution.                                   |
| `strategies` | `WorklistDistributionStrategy[]` | `[]`                    | Custom strategies registered in `WorklistStrategyRegistry`.                |

### Queue policy

Queue-level settings are data, set through `WorklistQueuesService.create` and `update`:

- `code` matches `^[a-z][a-z0-9_-]*$`; a strategy key matches `^[a-z][a-z0-9_]*$`.
- `requiredPermission` and `supervisorPermission` are concrete `resource:action:scope` keys without wildcards.
- `claimLimit` is a positive integer or absent.
- `defaultDeadline` is either `{ kind: 'elapsed', seconds }` or `{ kind: 'business_days', businessDays, calendarKey? }`.

### Business calendar

`TenantBusinessCalendar` implements `WorklistBusinessCalendar` with host-provided `timezoneForTenant` and `holidaysFor` callbacks. The host supplies every holiday as a valid `YYYY-MM-DD` civil date; STYNX does not embed a holiday catalog. The calendar counts local civil days across DST transitions and returns the exclusive start of the day after the last counted business day. Pass it through `StynxWorklistModule.forRoot` for business-day deadlines.

The tenant timezone must be an IANA name (a fixed offset is rejected), `businessDays` is an integer from 0 through 366, and zero business days returns a copy of `startAt`. The starting local date is not counted. Saturdays, Sundays and supplied holidays are skipped.

The package reads no environment variables.

## Examples

### Example 1 — business-day deadlines with host holidays

```ts
import { StynxWorklistModule, TenantBusinessCalendar } from '@stynx-nyx/worklist';

StynxWorklistModule.forRoot({
  calendar: new TenantBusinessCalendar({
    timezoneForTenant: (tenantId) => tenantSettings.timezone(tenantId),
    holidaysFor: ({ tenantId, calendarKey, year }) => holidays.load(tenantId, calendarKey, year),
  }),
});

await items.enqueue({
  queueCode: 'appeals-review',
  entityType: 'rait.appeal',
  entityId: appeal.id,
  deadline: { kind: 'business_days', businessDays: 3, calendarKey: 'state-sp' },
});
```

With timezone `UTC` and `2024-02-26` as a holiday, two business days from `2024-02-23T10:00:00Z` resolve to `2024-02-29T00:00:00Z`.

### Example 2 — enqueue a Flow task

```ts
await items.enqueue({
  queueCode: 'appeals-review',
  entityType: 'flow.task',
  entityId: task.id,
  deadline: { kind: 'absolute', dueAt: '2026-08-26T12:00:00.000Z' },
});
```

### Example 3 — custom push strategy

```ts
import type { WorklistDistributionStrategy } from '@stynx-nyx/worklist';

const seniorFirst: WorklistDistributionStrategy = {
  key: 'senior_first',
  async select({ candidates }) {
    const available = candidates.filter((candidate) => candidate.available);
    return available.sort((a, b) => b.weight - a.weight)[0]?.userId ?? null;
  },
};

StynxWorklistModule.forRoot({ strategies: [seniorFirst] });

// for a queue created with strategy: 'senior_first'
const assigned = await items.assignNext(queue.id);
```

### Example 4 — breach detection job

```ts
await sla.scheduleBreachDetection({ intervalSeconds: 300, limit: 200 });

// in the host's handler for WORKLIST_BREACH_JOB_TYPE, inside the tenant context
const breaches = await sla.detectBreaches(payload.limit);
```

### Example 5 — supervisor override

```ts
await items.supervisorOverride({
  itemId,
  operation: 'reassign',
  toUserId: reviewerId,
  reason: 'original reviewer on leave',
});
```

## Common pitfalls

- **`enqueue` needs a deadline source.** `WorklistItemsService.enqueue` reads the resolved deadline unconditionally. When the input has no `deadline` and the queue has no `defaultDeadline`, the current implementation fails with a plain `TypeError`, not a `WorklistInputError`. Give the queue a default or pass a deadline per item.
- **Business days without a calendar.** A `business_days` deadline with no `calendar` configured raises `WorklistCalendarRequiredError`. There is no weekend-only fallback.
- **Permission keys must already exist.** Queue permission keys follow the `resource:action:scope` shape and, per `docs/framework/contracts/worklist-api.md`, must already be registered in the platform permission catalog.
- **Worker state is not an ACL.** `setWorkerState` records availability and weight for a user who already holds the queue's worker permission. A worker-state row without the permission grants nothing.
- **`assignNext` on a `pull` queue.** It raises `WorklistConflictError`; pull queues distribute through `claimNext`.
- **`null` is not an error.** `claimNext` and `assignNext` return `null` for an empty queue. A claim-limit or state conflict is a `WorklistConflictError`.
- **Custom strategies cannot bypass eligibility.** Returning a user outside the supplied candidate set raises `WorklistInputError`, and the database re-checks tenant, permission, availability and claim limit during the hand-off.
- **Completing an item does not complete the referenced entity.** The host invokes Flow's task action (or its own domain transition) separately and chooses the transaction or reconciliation policy.
- **The default event sink discards events.** Events remain readable through `listEvents`. Back `eventSink` with a durable outbox when notification delivery must survive a crash; the sink is called after the service's transaction callback returns, so a sink failure does not roll the mutation back.
- **Scheduling for another tenant.** `scheduleBreachDetection` raises `WorklistInputError` when `tenantId` differs from the active tenant context, or when neither is present.

## Related packages

- [`@stynx-nyx/data`](/docs/packages/data/) — `Database`; the worklist schema ships in its platform migration `packages/data/migrations/platform/0018_worklist.sql`.
- [`@stynx-nyx/core`](/docs/packages/core/) — `RequestContext` and the `StynxError` base class.
- [`@stynx-nyx/flow`](/docs/packages/flow/) — workflow engine whose tasks can be enqueued as work items; not a dependency.
- [`@stynx-nyx/jobs`](/docs/packages/jobs/) — a scheduler the host can adapt to `WorklistSchedulerPort`; not a dependency.
- [`@stynx-nyx/outbox`](/docs/packages/outbox/) — durable delivery the host can place behind `WorklistEventSink`; not a dependency.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `zod`: `^4.3.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/platform-express`: `^11.1.26`
- `@nestjs/testing`: `^11.1.26`
- `@stynx-nyx/testing`: `workspace:*`
- `@types/node`: `24.13.4`
- `ts-node`: `^10.9.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
