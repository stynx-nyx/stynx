# Flow Runbook

**Authority:** Architect (Constitution Article 6).
**Status:** Draft for `@stynx/flow`.

This runbook covers operational checks for the STYNX Flow module. It assumes the backend implementation uses `@stynx/data`, tenant RLS, STYNX audit, and the adapter contract in `docs/arch/flow.md`.

## Migration Deployment Checks

Before deploy:

- Confirm the Flow migration is ordered after auth, tenancy, audit, and data foundations.
- Confirm every tenant-owned Flow table has `tenant_id`.
- Confirm RLS is enabled and forced on every tenant-owned Flow table.
- Confirm RLS policies use STYNX transaction settings, especially `current_setting('app.tenant_id', true)`.
- Confirm soft-delete/archive support is present for mutable design and form tables.
- Confirm `flow.events` has no public update/delete path and no soft-delete API.
- Confirm indexes exist for common tenant-local access paths: graph by scope, run by target, node run by run, task by assignee/status, event by run/time.
- Confirm seed data grants the Flow permissions listed in `docs/contracts/flow-api.md` to the intended admin/operator roles.

After deploy:

- Run the migration verifier for the platform migrations.
- Run Flow RLS integration tests against at least two tenants.
- Call read-only design and runtime endpoints with tenant A and verify tenant B rows are not visible.
- Exercise one signal or run creation path in a non-production tenant.
- Check that mutation handlers emit STYNX platform audit entries and Flow event rows where expected.

## Inspect Stuck Runs

Use stuck-run inspection when a run remains open but no task is visible, a node run never completes, or a signal did not advance the graph.

Recommended read-only query shape:

```sql
select
  r.id as run_id,
  r.graph_id,
  r.target_type,
  r.target_id,
  r.status as run_status,
  nr.id as node_run_id,
  nr.node_id,
  nr.status as node_status,
  nr.opened_at,
  nr.completed_at,
  t.id as task_id,
  t.status as task_status,
  t.assignee_id,
  t.updated_at as task_updated_at
from flow.runs r
left join flow.node_runs nr on nr.run_id = r.id
left join flow.tasks t on t.node_run_id = nr.id
where r.id = $1
order by nr.opened_at nulls last, t.updated_at nulls last;
```

Interpretation:

- Open run and no open node run: runtime orchestration did not open the next node or the run reached an invalid state.
- Open node run and no task for a task node: agent resolution or task creation failed.
- Open task with no assignee and no candidates: assignment rules or adapter `resolveAgents` failed.
- Completed task but open node run: task action completed but transition evaluation did not finish.
- Event log stops at adapter effect request: adapter effect failed or timed out.

Next steps:

- Inspect the run event ledger for the same `run_id`.
- Inspect platform audit for the operator or system action that triggered the state.
- Check adapter logs by `request_id`, `tenant_id`, `run_id`, and `target_id`.
- Use an admin repair operation only after capturing evidence.

## Inspect Open Tasks

Use the open-task view or equivalent query for assignment queues:

```sql
select
  t.id,
  t.run_id,
  t.node_run_id,
  t.status,
  t.assignee_id,
  t.claimed_by,
  t.due_at,
  t.updated_at
from flow.tasks t
where t.status in ('open', 'assigned', 'accepted')
order by t.due_at nulls last, t.updated_at asc;
```

Operational checks:

- Verify the request tenant before comparing counts across users.
- Compare candidate rules to the actor's effective STYNX permissions and memberships.
- Confirm the adapter did not deny `canView` for tasks that exist but do not render in the UI.
- Confirm task lists do not use platform-admin privileges for ordinary user queues.

## Re-Signal Facts For A Target

Use re-signal when external facts changed and eligible runs should re-evaluate transitions.

Required inputs:

- tenant id;
- adapter key;
- target type;
- target id;
- signal key;
- optional signal payload;
- operator or system reason.

Operational flow:

1. Confirm the target exists in the host domain and belongs to the tenant.
2. Confirm the adapter can build facts for the target without error.
3. Send `POST /flow/signal` with an idempotency key derived from tenant, target, signal key, and the source event id when available.
4. Verify a `signal.received` Flow event was appended.
5. Verify affected runs either advanced or appended a no-op/blocked event explaining why no transition was taken.
6. Verify platform audit captures the operator or system reason.

Never repair a stale run by manually editing node runs, tasks, or events unless an explicit system-only repair procedure exists and has been approved.

## Diagnose Adapter Errors

Adapter failures appear in three places:

- service logs with request id, tenant id, adapter key, run id, and target id;
- `flow.events` entries for failed effect or signal handling;
- STYNX platform audit for the route invocation or system action.

Common causes:

- Adapter key is not registered in `StynxFlowModule`.
- Adapter uses raw database access instead of STYNX `Database`.
- Adapter cannot read the target because tenant context is absent or wrong.
- Adapter `buildFacts` returns values that do not match graph rule schemas.
- Adapter `applyEffect` is non-idempotent and fails on retry.
- Adapter `canView` or `canManage` denies access expected by the caller.

Resolution:

- Fix adapter registration before data repair.
- If a side effect partially completed, append a corrective event and platform audit entry; do not mutate the original event.
- If retry is safe, use the same idempotency key.
- If retry is not safe, use an admin repair action with explicit reason and audit.

## Dispatch Pending Effects

Use effect dispatch when run events show `effect_requested` entries without matching `effect_succeeded` or `effect_failed` terminal events.

Required inputs:

- tenant id;
- registered adapter key;
- optional run id or effect event id;
- dispatch limit;
- operator or system reason.

Operational flow:

1. Confirm the adapter is registered for the tenant and can execute `applyEffect`.
2. Inspect pending effect events by tenant and, if relevant, by run id.
3. Call the package dispatcher through the system worker or `POST /flow/effects/dispatch` with `flow:admin:*`.
4. Verify each attempted request appends `effect_succeeded` or `effect_failed` with the original effect event id in the payload.
5. For failures, inspect adapter logs by request id, tenant id, adapter key, run id, target id, and effect key.
6. Retry only through the dispatcher. Do not update or delete the original `effect_requested` event.

Expected behavior:

- Re-running the dispatcher skips effect events that already have a terminal result.
- Adapter partial failure is represented by a failure event and platform audit, not by mutating the workflow ledger.
- Non-idempotent host effects must be protected by adapter-side natural keys or idempotency keys derived from the effect event id.

## Verify No Cross-Tenant Leakage

For any suspected tenant isolation issue:

1. Capture the endpoint, actor id, tenant id, request id, and timestamp.
2. Re-run the same read as tenant A and tenant B using ordinary user credentials.
3. Confirm database session settings inside the transaction include the expected `app.tenant_id`.
4. Query counts by tenant with an owner-role diagnostic transaction; never use owner-role results as evidence that a user route is safe.
5. Confirm every involved table has RLS enabled and forced.
6. Confirm joins do not cross tenant boundaries through child tables missing `tenant_id`.
7. Confirm adapter-provided labels and links are also tenant-filtered.

Expected outcome:

- Tenant A cannot see tenant B scopes, graphs, runtime rows, tasks, forms, fills, answers, waivers, or event payloads.
- Analytics routes either filter by tenant through RLS or return only redacted cross-tenant platform metrics explicitly approved outside Flow v1.

## Escalation

Escalate to an Architect when an incident requires changing the adapter contract, event immutability rule, tenant model, or permission model.

Escalate to an Auditor when evidence suggests cross-tenant leakage, missing audit, or mutation of append-only event rows in production.
