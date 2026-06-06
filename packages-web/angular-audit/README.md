# `@stynx-web/angular-audit` — Angular audit-trail UI: log timeline, entity history, integrity badge

`@stynx-web/angular-audit` is the Angular audit-viewing package. It provides an audit-log timeline, an entity-history panel (the audit trail for a single record), an event-detail view, and a hash-integrity badge that surfaces whether the audit chain verifies. Backed by the backend's [`@stynx/audit`](/docs/packages/audit/) read endpoint.

## Purpose

Regulated apps need to _show_ the audit trail, not just record it: a global activity feed, a per-record history ("who changed this and when"), and a visible signal that the chain hasn't been tampered with. `@stynx-web/angular-audit` provides those views.

You reach for it when your app surfaces audit data to users / compliance officers.

What it does NOT do: it doesn't emit audit events (the backend does). It's read-only.

## Audience

Angular frontend developers building compliance / activity views.

## Install

```bash
pnpm add @stynx-web/angular-audit
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/angular-ui` `^1`, `@stynx-web/sdk` `^1`.

## Quick start

```ts
import { provideAudit, auditRoutes } from '@stynx-web/angular-audit';

export const appConfig = { providers: [provideAudit()] };
```

```html
<stynx-audit-log [filters]="{ entity: 'order' }" />
```

## Public API surface

### Providers + routes

| Export         | Description                                               |
| -------------- | --------------------------------------------------------- |
| `provideAudit` | Registers the audit API service + component dependencies. |
| `auditRoutes`  | Ready-to-mount audit-browser routes.                      |

### Components

| Selector                             | Component                          | Description                                                |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------- |
| `<stynx-audit-log>`                  | `AuditLogComponent`                | Paginated audit-event timeline with filtering.             |
| `<stynx-entity-history>`             | `EntityHistoryComponent`           | The audit trail for one entity (`[entity]`, `[entityId]`). |
| `<stynx-audit-event-detail>`         | `AuditEventDetailComponent`        | Single-event detail with before/after diff.                |
| `<stynx-audit-hash-integrity-badge>` | `AuditHashIntegrityBadgeComponent` | Visual signal of audit-chain integrity.                    |

### Services

| Export            | Description                            |
| ----------------- | -------------------------------------- |
| `AuditApiService` | Wraps the SDK's audit read operations. |

### Types

| Export  | Description                                                                          |
| ------- | ------------------------------------------------------------------------------------ |
| (types) | Audit view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-audit/). |

## Configuration

| Option             | Type     | Default | Description               |
| ------------------ | -------- | ------- | ------------------------- |
| `pageSize`         | `number` | `25`    | Timeline pagination size. |
| `defaultDateRange` | `string` | `'7d'`  | Initial timeline window.  |

## Examples

### Example 1 — per-record audit panel

```html
<stynx-entity-history entity="order" [entityId]="order.id" />
```

### Example 2 — global activity feed

```html
<stynx-audit-log />
```

### Example 3 — integrity badge

```html
<stynx-audit-hash-integrity-badge />
<!-- green if `stynx audit verify` would pass, red if the chain is broken -->
```

## Common pitfalls

- **Audit scope leakage** — the backend scopes audit events per tenant; the UI shows what the API returns. Don't assume the UI filters tenant — the backend does.
- **Large result sets** — the timeline paginates; an unbounded date range over a high-volume app is slow. Default the range.
- **Integrity badge red after partial restore** — the chain hash breaks if a backup is partially restored (the R15 `audit verify` finding); a red badge may be operational, not malicious.

## Related packages

- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx/audit`](/docs/packages/audit/) — the backend counterpart.
- [`@stynx/cli`](/docs/packages/cli/) — `stynx audit verify` is the CLI equivalent of the integrity badge.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-audit/`](/docs/api-reference/stynx-web-angular-audit/)
