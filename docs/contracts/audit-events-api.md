# Audit Events API Contract

**Authority:** Architect (Constitution Article 6).
**Status:** Accepted for FE-E E.5-E.8.

This contract defines the frontend-facing HTTP routes for
`@stynx-web/angular-audit`. The existing `GET /_audit/log` route remains a
legacy platform-admin log view; FE-E targets the routes below.

## Permissions

| Permission | Applies to |
| ---------- | ---------- |
| `platform:audit:read:*` | All audit list, detail, entity-history, and integrity reads in v1. |

No mutation routes are part of this contract. Audit events are append-only
evidence.

## Tenancy

Audit reads execute under the active `TenantContext`.

- Non-platform actors read only the active tenant.
- A `tenantId` query parameter is accepted only when it matches the active tenant
  or when the actor has platform audit authority.
- Cross-tenant event ids and entity ids return `404`, not `403`, to avoid
  existence leaks.
- Platform actors may pass `tenantId` to inspect a tenant. Omitting `tenantId`
  for a platform actor returns the platform-visible scope only if the backend
  explicitly supports that mode; otherwise it returns `400`.

## Routes

| Route | Permission | Behavior |
| ----- | ---------- | -------- |
| `GET /audit/events` | `platform:audit:read:*` | Cursor-paged event list with filters. |
| `GET /audit/events/:eventId` | `platform:audit:read:*` | Event detail, including diff payloads. |
| `GET /audit/entities/:entityKind/:entityId/history` | `platform:audit:read:*` | Cursor-paged history for one entity. |
| `GET /audit/events/:eventId/integrity` | `platform:audit:read:*` | Per-event hash-chain integrity report. |

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

| Status | Meaning |
| ------ | ------- |
| `400` | Invalid UUID, invalid date range, invalid cursor, unsupported platform-wide query, or `limit` outside the accepted range after parsing. |
| `401` | Missing or invalid STYNX session. |
| `403` | Authenticated actor lacks `platform:audit:read:*`. |
| `404` | Event or entity history not found in the caller-visible tenant scope. |
| `429` | Audit query rate limit exceeded. |
| `500` | Unexpected backend error; response follows `docs/contracts/errors.json`. |

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
