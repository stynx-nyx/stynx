# Audit Agent Scope (code-only)

## Scope

Inspected audit decorators/interceptors, audit event envelope shaping, and persistence sinks across `porm`, `pec`, `sgp`, and `stynx`.

## Files inspected (paths + symbols)

### stynx

- `stynx/backend/src/core/audit/decorators/audit.decorator.ts`
  - `AUDIT_METADATA_KEY`, `AuditRequest`, `AuditMetadata`, `Audit`
- `stynx/backend/src/core/audit/audit.interceptor.ts`
  - `AuditInterceptor.intercept`, `headerValueToString`
- `stynx/backend/src/core/audit/audit.service.ts`
  - `AuditEventInput`, `AuditService.write`
- `stynx/backend/src/core/audit/audit.module.ts`
  - `APP_INTERCEPTOR` binding for `AuditInterceptor`
- `stynx/backend/src/shared/database/database.service.ts`
  - `DbContextOptions`, `applyContext`, `query`, `withClient`
- `stynx/backend/src/core/logging/correlation-id.interceptor.ts`
  - `CorrelationIdInterceptor.intercept`
- `stynx/backend/src/core/core.module.ts`
  - `CoreModule.imports` ordering (`LoggingModule`, `AuditModule`, ...)
- `stynx/backend/src/core/users/users.controller.ts`
  - `@Audit(&#123; action: 'sync', entity: 'user', entityIdSelector &#125;)`
- `stynx/backend/src/core/roles/roles.controller.ts`
  - `@Audit(... detailsSelector ...)`
- `stynx/backend/src/core/storage/storage.controller.ts`
  - `@Audit(&#123; action: 'upload'|'delete', entity: 'storage_file' &#125;)`
- `stynx/backend/src/core/tenancy/tenancy.controller.ts`
  - `@Audit(&#123; action: 'create', entity: 'tenancy' &#125;)`
- `stynx/database/ddl/02-audit.sql`
  - `audit.events`, `audit.write`, `audit.fn_log_dml`, `audit.attach_dml_triggers`
- `stynx/database/ddl/01-auth.sql`
  - `auth.set_tenant`, `auth.set_user_context`

### pec

- `pec/src/@core/security/decorators/audit.decorator.ts`
  - `AUDIT_METADATA_KEY`, `Audit` (overloads)
- `pec/src/@core/interceptors/audit.interceptor.ts`
  - `AuditInterceptor.intercept`
- `pec/src/@core/services/audit.service.ts`
  - `AuditInput`, `AuditService.write`, `asUuidOrNull`
- `pec/src/@core/core.module.ts`
  - global interceptors (`CorrelationIdInterceptor`, `AuditInterceptor`, ...)
- `pec/src/@core/interceptors/correlation-id.interceptor.ts`
  - UUID-normalized `x-correlation-id`
- `pec/src/@core/db/db.service.ts`
  - `connectWithTenant`, `run`, `runWithClient`
- `pec/src/@core/middleware/tenant.middleware.ts`
  - tenant header boundary (`x-tenant-id`) and request shaping
- `pec/src/types/express.d.ts`
  - request extension (`tenantId`, `pgClient`, `correlationId`, `user`)
- `pec/src/auth/auth.controller.ts`
  - `@Audit(&#123; action: 'UPDATE', entity: 'TENANT_CONTEXT' &#125;)`
- `pec/src/pec/exams/exams.controller.ts`
  - `@Audit('CREATE', 'EXAM_MEDICAL'|'EXAM_PSYCH')`
- `pec/src/pec/reports/reports.service.ts`
  - explicit `audit.write(...)` calls in domain service
- `pec/src/pec/audit-events/audit-events.controller.ts`
  - `@Controller('audit/events')`
- `pec/src/pec/audit-events/audit-events.service.ts`
  - `EVENT_COLUMNS`, `list`, `toCsv`
- `pec/database/ddl/04-audit.sql`
  - `audit.events` schema
- `pec/database/ddl/14-audit-functions.sql`
  - `audit.write`, `audit.prevent_mutation`, `audit_events_prevent_mutation`
- `pec/database/ddl/24-audit-policies.sql`
  - `tenant_isolation` policy
- `pec/database/ddl/90-contract.sql`
  - contract evolution for `audit.events` (`id`, `ip_address`, partitions)
- `pec/database/ddl/94-audit-comments.sql`
  - semantic comments for audit table/function

### sgp

- `sgp/source/backend/src/audit/audit.dto.ts`
  - `AUDIT_ACTIONS`, `AuditEventQueryDto`, `AuditReportRequestDto`
- `sgp/source/backend/src/audit/audit.service.ts`
  - `appendMutation`, `appendEvent` facade
- `sgp/source/backend/src/audit/audit-writer.service.ts`
  - `AuditWriterService.appendEvent`, `AuditAppendOptions`
- `sgp/source/backend/src/audit/audit-query.service.ts`
  - `list`, `facet`, `createReportRequest`, `whereClause`, `toDto`
- `sgp/source/backend/src/audit/audit-redaction.util.ts`
  - `redactAuditMetadata`
- `sgp/source/backend/src/audit/audit.module.ts`
  - provider/export boundary
- `sgp/source/backend/src/audit/audit.controller.ts`
  - read APIs and report-request + appendMutation
- `sgp/source/backend/src/rh/employees/employees.controller.ts`
  - explicit `auditService.appendMutation` calls
- `sgp/source/backend/src/documents/documents.controller.ts`
  - appendMutation for upload/register/download flows
- `sgp/source/backend/src/documents/documents.service.ts`
  - direct `INSERT INTO public.document_download_audit`
- `sgp/source/backend/src/common/request-id/request-with-context.ts`
  - `RequestWithContext`
- `sgp/source/backend/src/common/request-id/request-id.middleware.ts`
  - request id normalization
- `sgp/source/backend/src/common/request-context/request-context.store.ts`
  - `RequestContextStore`
- `sgp/source/backend/src/auth/auth.types.ts`
  - `AuthenticatedActor`
- `sgp/source/backend/src/auth/cognito-jwt.guard.ts`
  - actor injection into request/context
- `sgp/source/backend/src/database/database.service.ts`
  - `configured`, `query`, `applySessionContext`
- `sgp/source/backend/src/app.module.ts`
  - middleware registration (`RequestIdMiddleware`)
- `sgp/source/backend/prisma/migrations/20260417120000_initial_sgp/migration.sql`
  - `CREATE TABLE "audit_event"`, related indexes/FK

### porm

- `porm/database/audit/ddl.sql`
  - `audit.logged_actions`, `audit.current_app_user_id`, `audit.current_user_roles`, `audit.fn_log_dml`
- `porm/database/auth/ddl.sql`
  - `auth.context_user_id`, `auth.context_roles`
- `porm/database/auth/audit.sql`
  - auth table trigger attachments to `audit.fn_log_dml`
- `porm/database/porm/audit.sql`
  - porm table trigger attachments to `audit.fn_log_dml`
- `porm/database/flow/audit.sql`
  - flow table trigger attachments to `audit.fn_log_dml`
- `porm/database/cms/audit.sql`
  - cms table trigger attachments to `audit.fn_log_dml`
- `porm/backend/src/core/audit/audit.module.ts`
  - `AuditModule` (service export only)
- `porm/backend/src/core/audit/audit.service.ts`
  - read path over `audit.logged_actions` (`AuditService.list`)
- `porm/backend/src/common/services/context-aware.service.ts`
  - `withUserTransaction`
- `porm/backend/src/database/database.service.ts`
  - session context (`auth.app_user_id`, `auth.roles`, `auth.org_cnpj`)
- `porm/backend/src/common/utils/response.utils.ts`
  - `asActionResponse`, `asIdResponse`
- `porm/backend/src/flow/controllers/signal.controller.ts`
  - envelope usage (`asActionResponse` + `asIdResponse`)
- `porm/backend/src/core/admin/users/users.controller.ts`
  - `GET core/admin/users/audit/logs` using `AuditService.list`

## Shared audit core boundaries

1. Metadata declaration boundary

- `stynx` and `pec` both expose a decorator metadata contract:
  - `stynx`: `AuditMetadata` in `.../audit.decorator.ts`
  - `pec`: `AuditMetadata` in `.../security/decorators/audit.decorator.ts`
- `sgp` and `porm` do not use an `@Audit` decorator pattern in inspected backend code.

2. Capture boundary (interceptor vs explicit call)

- `stynx`: global `AuditInterceptor` (`APP_INTERCEPTOR`) captures annotated routes.
- `pec`: global `AuditInterceptor` (`APP_INTERCEPTOR`) captures annotated routes.
- `sgp`: controllers/services call `AuditService.appendMutation/appendEvent` explicitly.
- `porm`: database triggers (`audit.fn_log_dml`) capture table mutations; backend `AuditService` is read-oriented.

3. Context propagation boundary

- `stynx`: `DatabaseService.applyContext` sets tenant/user/roles/correlation (`auth.set_tenant`, `auth.set_user_context`, `set_config('stynx.correlation_id',...)`).
- `pec`: request carries `tenantId`, `pgClient`, `correlationId` (`express` augmentation + middleware/guards); `AuditService` can use caller transaction client.
- `sgp`: `RequestIdMiddleware` + `CognitoJwtGuard` populate `RequestWithContext`; `DatabaseService.applySessionContext` maps context to `app.*` settings.
- `porm`: `ContextAwareService.withUserTransaction` and `DatabaseService.withTransaction` set `auth.app_user_id` and `auth.roles` used by DB-level audit function.

## Sink adapter boundaries

1. stynx sink adapters

- Application write adapter: `AuditService.write` -&gt; `select audit.write(...)`.
- Database sink(s):
  - `audit.events` via `audit.write(...)`.
  - `audit.fn_log_dml` for trigger-based table logging into `audit.events`.

2. pec sink adapters

- Application write adapter: `AuditService.write` -&gt; `select audit.write($1..$10)`.
- Transaction-aware adapter choice:
  - `runWithClient(...)` when a request transaction client exists.
  - `run(...)` otherwise.
- Database sink: `audit.events` (append-only guarded by `audit_events_prevent_mutation`).

3. sgp sink adapters

- Application write adapter: `AuditWriterService.appendEvent` -&gt; `INSERT INTO public.audit_event`.
- Additional persistence sink in documents flow:
  - `DocumentsService.presignDownload` -&gt; `INSERT INTO public.document_download_audit`.

4. porm sink adapters

- Database-first sink adapter: trigger attachments in `database/*/audit.sql` -&gt; `audit.fn_log_dml` -&gt; `audit.logged_actions`.
- Backend audit service reads from `audit.logged_actions`; no inspected app-side writer to `audit` table.

## Envelope normalization strategy

1. stynx

- Normalization source: `AuditInterceptor` combines request context + `AuditMetadata` selectors.
- Normalized fields (`AuditEventInput`): `tenantId`, `actorId`, `actorRole`, `action`, `entity`, `entityId`, `details`, `ipAddress`, `stationId`, `correlationId`.
- Persistence mapping: `AuditService.write` maps to `audit.write(..., metadata, ip, station, request, old, new)`.

2. pec

- Normalization source: `AuditInterceptor` + metadata selectors.
- Default detail envelope (when no selector): `&#123; method, path, correlationId, ip &#125;`.
- Type normalization: `AuditService.asUuidOrNull` for actor/entity/station/correlation UUID-typed sink columns.

3. sgp

- Normalization source: explicit `appendMutation/appendEvent` call sites + request context.
- Writer envelope: `&#123; action, resourceType, resourceId, tableName, requestId, ip, userAgent, metadata &#125;` + actor fields.
- Metadata normalization: `redactAuditMetadata` (secret-key redaction, size/depth limits, array truncation).

4. porm

- Normalization source: DB trigger context (`TG_OP`, `TG_TABLE_SCHEMA`, `TG_TABLE_NAME`, `OLD/NEW`, `auth.context_*`).
- Envelope persisted to `audit.logged_actions`: `&#123; schema_name, table_name, op, user_id, roles, old_data, new_data &#125;`.

## Exclusions

- Excluded implementation noise outside live source scope:
  - `pec/.claude/worktrees/**` (historical/ephemeral worktree copies).
  - documentation/generated artifacts (`**/docs/**`, `**/openapi/**`) except where used only to locate code entry points.
  - test/spec files except where needed to confirm exposed symbols quickly.
- For `stynx`, business/domain action semantics are treated as caller-owned and remain outside core abstraction boundaries.

## Migration risks (from observed code)

1. Async audit write completion semantics differ

- `stynx` interceptor uses `tap(() =&gt; this.auditService.write(...))`; returned Promise is not chained/awaited in stream flow.
  - Source: `stynx/backend/src/core/audit/audit.interceptor.ts` (`tap` callback).
- `pec` chains write with `mergeMap(from(...))` and explicitly catches/logs failures.
  - Source: `pec/src/@core/interceptors/audit.interceptor.ts`.

2. Sink schema mismatch across repos

- `porm`: `audit.logged_actions` (`op`, `schema_name`, `table_name`, `old_data`, `new_data`).
- `pec`/`stynx`: `audit.events` (`action/operation`, `entity`, `entity_id`, `details/metadata`, etc.).
- `sgp`: `public.audit_event` (`resource_type`, `resource_id`, `table_name`, `metadata`).

3. Correlation/station typing mismatch

- `pec` sink expects UUID/INET for correlation/station/ip (`audit.write` signature).
- `stynx` sink uses text for `request_id`/`station_id`/`ip_address`.
- `sgp` request id is text pattern (`x-request-id`), not UUID-only.

4. Append-only guarantees are inconsistent

- `pec` enforces append-only (`audit.prevent_mutation` trigger).
- No equivalent append-only guard found in inspected `stynx` `02-audit.sql`, `porm` `audit.logged_actions`, or `sgp` migration for `audit_event`.

5. Redaction policy is inconsistent

- `sgp` actively redacts/truncates metadata (`redactAuditMetadata`).
- `pec` and `stynx` do not enforce equivalent runtime metadata redaction in inspected write paths.

6. Trigger coverage model mismatch

- `porm` has broad explicit trigger attachments across schemas (`auth`, `porm`, `flow`, `cms`).
- `stynx` defines `audit.attach_dml_triggers(...)` but no inspected invocation attaching it to concrete tables.

7. Transaction coupling mismatch

- `porm` trigger writes occur inside table mutation transaction by design.
- `pec` supports same-transaction app-level audit writes via `client`.
- `sgp` writes are explicit post-mutation calls.
- `stynx` app-level writes are interceptor-driven and not tied to downstream service transaction boundaries in inspected code.
