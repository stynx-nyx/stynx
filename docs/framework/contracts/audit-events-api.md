# Audit Events API Contract

**Authority:** Architect (Constitution Article 6).
**Status:** Accepted for FE-E E.5-E.8.

This contract defines the frontend-facing HTTP routes for
`@stynx-nyx/angular-audit`. The existing `GET /_audit/log` route remains a
legacy platform-admin log view; FE-E targets the routes below.

## Permissions

| Permission              | Applies to                                                         |
| ----------------------- | ------------------------------------------------------------------ |
| `platform:audit:read:*` | All audit list, detail, entity-history, and integrity reads in v1. |

No mutation routes are part of this contract. Audit events are append-only
evidence.

## Tenancy

Audit reads execute under the active `TenantContext`.

### Chain epochs after CTG9

Migration ≥0021 preserves every legacy `audit.events` row, hash and timestamp. It diagnoses each tenant chain, including the NULL/system chain, by `previous_hash` links as linear, linear but temporally misordered, forked, or hash-mismatched. Tips and diagnostics remain inspectable; a legacy defect is never silently rehashed or marked valid. An explicit anchor begins a new epoch after the greatest legacy timestamp. `audit.verify_chain` retains its signature and result columns, partitions predecessor comparison by epoch and reports invalid legacy rows as `chain_valid=false`; `audit.verify_current_epoch(tenant,limit)` starts at the active anchor even when over 1000 legacy rows precede it. A separate diagnostic function exposes prior epoch state and tips. The FE integrity tone `valid` may describe only the segment actually verified; a valid current epoch does not erase a broken legacy segment. This is a database integrity contract, not a new HTTP route or permission.

Three database writers (`audit.fn_row_change`, `audit.write`, `audit.write_command_event`) serialize on the same tenant advisory before selecting the indexed head, with a fixed sentinel for NULL tenant. They assign `occurred_at` explicitly under lock, greater than the prior head by at least 1µs, call `audit.ensure_monthly_partition` with **that chosen timestamp**, and hash/insert the same value; a separate wall-clock call could select a wrong month. Each refuses RR/SERIALIZABLE before head lookup with fixed MESSAGE `audit_chain_requires_read_committed` (SQLSTATE `40001`, nonretryable data mapping). A transaction may use only one chain key: mismatch is SQLSTATE `STY41`/`AuditChainKeyMismatchError` before another advisory. Owner `AuditSqlSink` may write a real tenant ID despite owner sessions having no `app.tenant_id`; EXECUTE on `audit.write` remains revoked for app. The GUC binding is a transaction-level self-check and does not replace privileges or RLS. The head lookup has a tenant/time/event descending index plus a NULL partial index; equality and IS NULL paths avoid `IS NOT DISTINCT FROM` on the critical path. Inspector measures global-sentinel contention and verifies NULL, concurrent, inverse-BEGIN, month-boundary and multi-event cases in real PostgreSQL.

An outbox append that can hold the tenant clock obtains `outbox.legacy_ownership FOR SHARE` before its audit advisory (or uses `FOR SHARE NOWAIT` if a domain audit already acquired the advisory). The opt-in legacy cutover holds marker UPDATE while copying and may then acquire the clock; before mutation it checks `pg_trigger` for `audit.fn_row_change` on every mutated table and physical partition, failing typed if found. It never calls these audit writers or modifies an audit-triggered table until a separate transaction after commit. This prevents a clock holder from racing past marker UPDATE. A legacy audited-domain-write→`enqueue` can hold advisory first. With B holding marker SHARE and waiting for A’s advisory, C queued for marker UPDATE, and A asking for marker SHARE, PostgreSQL may immediately grant A’s compatible SHARE despite C waiting. The sensor requires bounded A/B completion before C, no 40P01 and no duplicate; 55P03 is optional in that queue. All legacy marker acquisitions still use NOWAIT. A separate case where C already **holds** UPDATE makes A receive typed 55P03 and roll back its entire caller transaction before same-key retry.

- Non-platform actors read only the active tenant.
- A `tenantId` query parameter is accepted only when it matches the active tenant
  or when the actor has platform audit authority.
- Cross-tenant event ids and entity ids return `404`, not `403`, to avoid
  existence leaks.
- Platform actors may pass `tenantId` to inspect a tenant. Omitting `tenantId`
  for a platform actor returns the platform-visible scope only if the backend
  explicitly supports that mode; otherwise it returns `400`.

## Routes

| Route                                               | Permission              | Behavior                               |
| --------------------------------------------------- | ----------------------- | -------------------------------------- |
| `GET /audit/events`                                 | `platform:audit:read:*` | Cursor-paged event list with filters.  |
| `GET /audit/events/:eventId`                        | `platform:audit:read:*` | Event detail, including diff payloads. |
| `GET /audit/entities/:entityKind/:entityId/history` | `platform:audit:read:*` | Cursor-paged history for one entity.   |
| `GET /audit/events/:eventId/integrity`              | `platform:audit:read:*` | Per-event hash-chain integrity report. |

`entityKind` is the audit entity name, URL-encoded when it contains characters
outside a path segment. Table-backed events use `schema.table` names such as
`flow.graphs`.

## Query Parameters

`GET /audit/events` accepts:

```ts
interface AuditEventListQuery {
  actorId?: string;
  action?: string;
  entityKind?: string;
  entityId?: string;
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}
```

`GET /audit/entities/:entityKind/:entityId/history` accepts:

```ts
interface AuditEntityHistoryQuery {
  tenantId?: string;
  cursor?: string;
  limit?: number;
}
```

`action` is the frontend-facing name for the stored audit operation. Backends may
persist it as `operation`; response DTOs use `action`.

`limit` defaults to `50` and is clamped to `200`. Cursors are opaque strings and
must be treated as server-owned.

## Response Shapes

```ts
interface AuditPage<T> {
  items: T[];
  nextCursor?: string;
}

interface AuditActorSummary {
  id?: string | null;
  displayName?: string | null;
  role?: string | null;
}

interface AuditEntitySummary {
  kind: string;
  id?: string | null;
  label?: string | null;
}

interface AuditEventSummary {
  eventId: string;
  occurredAt: string;
  tenantId?: string | null;
  actor: AuditActorSummary;
  action: string;
  entity: AuditEntitySummary;
  requestId?: string | null;
  integrity: AuditIntegrityTone;
}

type AuditIntegrityTone = 'valid' | 'broken' | 'unchecked';
```

Event detail extends the summary:

```ts
interface AuditEventDetail extends AuditEventSummary {
  sessionId?: string | null;
  ipAddress?: string | null;
  metadata: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  previousHash?: string | null;
  rowHash?: string | null;
}
```

Integrity reports return:

```ts
interface AuditIntegrityReport {
  eventId: string;
  tenantId?: string | null;
  valid: boolean;
  checkedAt: string;
  checkedThroughEventId: string;
  previousEventId?: string | null;
  nextEventId?: string | null;
  previousHash?: string | null;
  rowHash?: string | null;
  totalChecked: number;
  firstBrokenEventId?: string;
}
```

`valid` means the tenant-local hash chain is valid through the requested event.
Because integrity is a chain property, the backend may inspect predecessor rows;
it must not expose unrelated predecessor payloads in this response.

## Error Semantics

| Status | Meaning                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Invalid UUID, invalid date range, invalid cursor, unsupported platform-wide query, or `limit` outside the accepted range after parsing. |
| `401`  | Missing or invalid STYNX session.                                                                                                       |
| `403`  | Authenticated actor lacks `platform:audit:read:*`.                                                                                      |
| `404`  | Event or entity history not found in the caller-visible tenant scope.                                                                   |
| `429`  | Audit query rate limit exceeded.                                                                                                        |
| `500`  | Unexpected backend error; response follows `docs/framework/contracts/errors.json`.                                                      |

Frontend components must distinguish `404` empty/not-found states from `403`
permission states. They must not infer that a cross-tenant entity exists.

## Engineer Guidance

- Implement these routes over `audit.events`, not the legacy `/_audit/log` list
  route, so detail and per-event integrity can share one event id.
- Preserve the existing `platform:audit:read:*` permission for v1. Do not invent
  package-local audit permissions in frontend code.
- Use active tenant RLS for ordinary reads. Platform-wide maintenance reads must
  use documented system context and remain backend-owned.
- The FE service names map directly: `listEvents`, `getEvent`,
  `listEntityHistory`, and `verifyHashIntegrity`.
- The integrity badge should call only `GET /audit/events/:eventId/integrity`;
  list rows may carry `unchecked` until the badge or detail view requests proof.
