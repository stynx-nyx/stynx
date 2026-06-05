# `@stynx/audit` — audit-event decorator + SQL sink + retention policy

`@stynx/audit` emits structured audit events for mutating endpoints. Mark a controller method with `@Audit({ action, entity })` and the audit interceptor captures before-state, the principal, the request id, the after-state, and writes an `AuditEventEnvelope` to the configured sink (default: SQL via `@stynx/data`). A retention policy can periodically prune older events to control table growth.

## Purpose

Regulated apps need an audit trail. Hand-emitting audit events from every mutating method drifts. `@stynx/audit` provides a single decorator + the canonical `AuditEventEnvelope` shape + retention enforcement.

You reach for it whenever your app needs an audit log (almost always in regulated domains; nice-to-have otherwise).

What it does NOT do: it's not an SIEM (use Splunk/Datadog for that). It doesn't sign audit events for tamper-evidence by default (use `@stynx/cli`'s `stynx audit verify` for chain integrity instead). It doesn't query — exposes one read endpoint, but rich filtering is downstream.

## Audience

Backend developers in any app with compliance + audit requirements.

## Install

```bash
pnpm add @stynx/audit
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx/core` `^1`, `@stynx/contracts` `^1`, `@stynx/data` `^1`.

## Quick start

```ts
import { StynxAuditModule } from '@stynx/audit';

StynxAuditModule.forRoot({
  sink: 'sql',
  retention: { keepDays: 365 * 7 },
});
```

```ts
import { Audit } from '@stynx/audit';

@Controller('orders')
export class OrdersController {
  @Post()
  @Audit({ action: 'create', entity: 'order' })
  create(@Body() input: CreateOrderDto) {
    /* ... */
  }
}
```

Every call emits an `AuditEventEnvelope` with the principal, before/after snapshot, and timestamp.

## Public API surface

### Modules

| Export             | Signature                                    | Description                                    |
| ------------------ | -------------------------------------------- | ---------------------------------------------- |
| `StynxAuditModule` | `.forRoot(options: StynxAuditModuleOptions)` | Registers interceptor, sink, retention runner. |

### Services / Injectables

| Export                  | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `StynxAuditService`     | High-level: emit an audit event programmatically (rare; use the decorator). |
| `AuditInterceptor`      | The `APP_INTERCEPTOR` consuming `@Audit(...)` metadata.                     |
| `SqlAuditAdapter`       | Default sink: write to `stynx_audit_events` table via `@stynx/data`.        |
| `AuditRetentionService` | Schedules retention cleanup.                                                |

### Decorators

| Export                                | Targets | Description                                                                                                                                      |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@Audit({ action, entity, redact? })` | Methods | Emit an audit event on the call. `action`: verb. `entity`: target entity name. `redact`: optional path list to omit from before/after snapshots. |

### Endpoints (1 read-only controller)

| Method | Path            | Auth                  | Description                   |
| ------ | --------------- | --------------------- | ----------------------------- |
| `GET`  | `/audit/events` | bearer + `audit:read` | List audit events. Paginated. |

### Types / Interfaces

| Export                                         | Description                 |
| ---------------------------------------------- | --------------------------- |
| `StynxAuditModuleOptions`                      | `forRoot()` options.        |
| `AuditEventEnvelope` (from `@stynx/contracts`) | The canonical event shape.  |
| `RedactionPolicy`                              | Path-based redaction rules. |

## Configuration

### `StynxAuditModule.forRoot()` options

| Option                   | Type                 | Default                            | Description                                              |
| ------------------------ | -------------------- | ---------------------------------- | -------------------------------------------------------- |
| `sink`                   | `'sql' \| AuditSink` | `'sql'`                            | Sink. Custom impls implement `AuditSink` from contracts. |
| `retention.keepDays`     | `number`             | n/a                                | If set, auto-prune events older than this.               |
| `defaultRedactionPolicy` | `RedactionPolicy`    | `{ paths: ['password', 'token'] }` | Cross-cutting redaction.                                 |
| `tableName`              | `string`             | `'stynx_audit_events'`             | SQL sink table name.                                     |

## Examples

### Example 1 — auditing a mutating endpoint

```ts
@Patch(':id')
@Audit({ action: 'update', entity: 'order' })
update(@Param('id') id: string, @Body() body: UpdateOrderDto) { /* ... */ }
```

Emits: `{ action: 'update', entity: 'order', entityId: ':id', oldData: <pre>, newData: <post>, actorId: ..., tenantId: ..., requestId: ... }`.

### Example 2 — per-endpoint redaction

```ts
@Audit({ action: 'create', entity: 'user', redact: ['ssn', 'password'] })
create() { /* ... */ }
```

### Example 3 — custom sink

```ts
class CloudWatchAuditSink implements AuditSink {
  async write(event: AuditEventEnvelope) {
    /* push to CloudWatch */
  }
}

StynxAuditModule.forRoot({ sink: new CloudWatchAuditSink() });
```

## Common pitfalls

- **Decorating a `@Public()` endpoint** — no actor; the audit envelope's `actorId` is undefined. Audit still fires; downstream may filter such events.
- **Redaction path mismatch** — typed as dot-paths; case-sensitive; doesn't traverse arrays unless `'array[*].field'`.
- **High-throughput SQL sink** — high write volume on `stynx_audit_events` can overwhelm. Consider partitioning or moving to an async sink.
- **`audit verify` chain breaks after a partial restore** — the chain hashes are sequential; restoring a partial backup gaps the chain. Document the procedure for handling this.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides `RequestContext` for `actorId`, `tenantId`, `requestId`.
- [`@stynx/data`](/docs/packages/data/) — provides the DB connection for the SQL sink.
- [`@stynx/contracts`](/docs/packages/contracts/) — defines `AuditEventEnvelope`, `AuditSink`.
- [`@stynx/cli`](/docs/packages/cli/) — `stynx audit verify` checks chain integrity.
- [`@stynx-web/angular-audit`](/docs/packages-web/angular-audit/) — Angular pair: audit timeline UI.
- [`backend/audit`](/docs/packages/backend/audit/) — `@stynx/backend` submodule.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-audit/`](/docs/api-reference/stynx-audit/)
