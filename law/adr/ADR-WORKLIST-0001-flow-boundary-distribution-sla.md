---
adr_id: ADR-WORKLIST-0001
title: Flow and Worklist Boundary, Distribution, and SLA Clocks
status: accepted
date: 2026-08-24
authors: ['@aarusso']
tags: [stynx, worklist, flow, rbac, sla, concurrency]
---

# ADR-WORKLIST-0001 — Flow and Worklist Boundary, Distribution, and SLA Clocks

**Authority:** Architect.
**Related:** `docs/framework/contracts/flow-api.md`,
`docs/framework/contracts/worklist-api.md`, `ADR-003`, `INV-RBAC-001`.

## Status

Accepted on 2026-08-24 for `@stynx-nyx/worklist`.

## Context

STYNX Flow already owns workflow design and execution: published graphs, runs,
human tasks, allowed actions, assignment rules, task decisions, forms, facts,
and transitions. A work-distribution package must compose with those tasks
without creating a second workflow engine.

The immediate portfolio need is RAIT, where traffic-ticket appeals must be
distributed among reviewers and JARI boards while statutory deadlines remain
observable. Two PEC precedents sharpen the decision:

- `transmissions.service.ts` claims due rows atomically with a
  `FOR UPDATE SKIP LOCKED` CTE and an `UPDATE ... RETURNING` hand-off;
- complaints store `assigned_to` directly during a status update, with no
  queue eligibility, atomic claim, load policy, or SLA clock. Worklist replaces
  that assignment pattern; it does not replace the complaint or appeal state
  machine.

## Decision

### Boundary with Flow

Flow owns **what work means and how it advances**. Worklist owns **who receives
open work, under which queue policy, and by when it should be handled**.

| Concern | Flow | Worklist |
| --- | --- | --- |
| Process graph, run, node, transition | Owns | Never models |
| Human task actions and completion semantics | Owns | Never interprets |
| Queue/pool, claim, release, reassignment, workload | Never owns | Owns |
| Operational due date and breach observation | May supply a task SLA hint | Owns the persisted distribution clock |
| Domain entity lifecycle | Host domain owns | References only |

A work item references any host entity through `(entity_type, entity_id)`. A
Flow integration uses `entity_type = 'flow.task'` and the Flow task UUID as
`entity_id`. Completing a work item does not complete the Flow task, and a Flow
task transition does not silently mutate a work item. A host that needs both
changes atomically must invoke the two package operations in one explicit
transactional integration boundary. This keeps retries and reconciliation
visible instead of hiding cross-package side effects.

### Queue eligibility is RBAC, not a second ACL

Each queue stores a concrete STYNX `resource:action:scope` permission key. The
eligible worker set is derived from active tenant memberships and effective
role, group-role, or direct permission grants. Wildcard grants are expanded by
the same segment semantics as STYNX auth.

An optional worker-state row may record availability, weight, and the
round-robin cursor. It never grants access: absence means the permission holder
is available with weight `1`, and a state row cannot make a user without the
queue permission eligible. Supervisor operations require the queue's separate
supervisor permission and always carry a reason.

### Atomic claim and distribution strategies

Claim and push assignment use a single database transaction with
`FOR UPDATE SKIP LOCKED` selection followed by `UPDATE ... RETURNING`. A pending
row can therefore be handed to at most one worker even when claimers race.
Per-worker claim limits are serialized for the `(queue, user)` pair.

The built-in strategies are:

- `pull`: an eligible worker claims the next priority/deadline-ordered item;
- `round_robin`: selects the least-recently assigned eligible worker;
- `load_balanced`: selects the smallest weighted open-item count, then the
  least-recently assigned worker.

Strategy keys are text, not a PostgreSQL enum. The package registry reserves
the three built-ins and accepts adopter strategies. A custom strategy receives
only RBAC-eligible candidates and returns a user id; the database still performs
the atomic item hand-off and re-checks eligibility and claim limits.

### SLA and prazo clocks

Every item may have no deadline, an absolute deadline, or a business-day
deadline. Business-day arithmetic is performed through an injected calendar
port; STYNX does not embed Brazilian federal, state, municipal, or agency
holidays. The resolved `due_at` and the original deadline inputs are persisted
so decisions remain explainable after a calendar implementation changes.

Breach detection is an idempotent, batch-limited `SKIP LOCKED` sweep. It marks
each item once and appends one `deadline_breach` event. Worklist defines a
narrow recurring-scheduler port and a stable breach job type but has no package
dependency on `@stynx-nyx/jobs`. The host adapter schedules the job and invokes
the public breach driver under the tenant context.

### Events, audit, and notifications

Queue configuration, worker state, items, and item-event rows are covered by
the platform `audit.enable_for` triggers. `worklist.item_events` is additionally
an append-only operational ledger; corrective events replace mutation.

The event read surface and optional event-sink port expose stable worklist
events, including deadline breaches, without importing a notifications
package. A durable adapter may bridge the sink or ledger to outbox and
notifications. Notification delivery state is not stored in worklist.

### Tenancy

All tables are tenant-scoped, force RLS, and use tenant-qualified foreign keys
where one worklist table references another. Runtime functions are security
invoker functions and fail when tenant or actor context is absent.

## Alternatives Considered

- **Add distribution fields to `flow.tasks`.** Rejected because non-Flow domain
  entities also need work distribution and Flow would acquire queue/SLA policy.
- **Make worklist a second task engine.** Rejected because action semantics,
  state transitions, forms, and decisions already belong to Flow or the host
  domain.
- **Maintain a queue-member ACL.** Rejected because it would drift from STYNX
  RBAC and permit contradictory authorization states.
- **Depend directly on jobs or notifications.** Rejected because both are
  optional runtime integrations and are developed on independent package
  release paths.
- **Implement claiming as select-then-update in TypeScript.** Rejected because
  two claimers can observe and receive the same pending row.

## Consequences

- Flow adopters must explicitly coordinate task completion and work-item
  completion; the packages never advance each other implicitly.
- Queue permission changes immediately alter eligibility; worker-state rows do
  not need ACL reconciliation.
- Custom strategies can change assignee selection but cannot bypass RBAC, RLS,
  claim limits, or the atomic database hand-off.
- Applications own statutory prazo values and calendar data. This package
  supplies clocks and evidence, not RAIT-specific legal policy.
- Jobs, outbox, and notifications adapters remain integration TODOs until their
  parallel packages expose stable published contracts.
