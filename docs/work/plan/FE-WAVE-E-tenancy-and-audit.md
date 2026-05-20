# FE-WAVE-E — Tenancy Polish + `@stynx-web/angular-audit`

**Wave goal.** Add the tenancy-change bus and tenant-picker affordances; author the missing audit-report viewer as a new package.

## Scope

### Tenancy polish (in `@stynx-web/angular-tenancy`)

| Item                                | API                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `tenantChanged$`                    | `Observable<TenantTransition>` exposed from `TenantContextService`.                  |
| `StynxTenantPickerComponent`        | `<stynx-tenant-picker>` — first-load chooser for users with > 1 tenant.              |
| Error-context decoration            | `ErrorBannerService` includes tenant label in messages.                              |
| Doc                                 | "How to reset feature state on tenant change" recipe in the package README.          |

### Audit reports (new package `@stynx-web/angular-audit`)

| Item                                   | Selector / API                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `AuditApiService`                      | RxJS wrapper around `/audit/events` and `/audit/entities/{kind}/{id}/history`.         |
| `StynxAuditLogComponent`               | `<stynx-audit-log>` — list with cursor pagination, filter chips, search.                |
| `StynxAuditEventDetailComponent`       | `<stynx-audit-event-detail [eventId]>` — side panel or route.                          |
| `StynxEntityHistoryComponent`          | `<stynx-entity-history [resource] [id]>` — replayable timeline for one entity.         |
| `StynxAuditHashIntegrityBadgeComponent` | `<stynx-audit-hash-integrity [eventId]>` — per-event hash-chain integrity indicator.  |
| `auditRoutes()`                        | Routes for the audit surface.                                                          |
| `provideStynxAudit(...)`               | Standalone provider.                                                                    |
| `STYNX_AUDIT_CLIENT`                   | Injection token.                                                                        |

## Workstreams

### E.1 — `tenantChanged$`

In `TenantContextService`:

```ts
private readonly _tenantChanged = new Subject<TenantTransition>();
readonly tenantChanged$ = this._tenantChanged.asObservable();

setTenantId(nextId: string): void {
  const prev = this.tenantId();
  if (prev === nextId) return;
  this.tenantId.set(nextId);
  this._tenantChanged.next({ from: prev, to: nextId, at: Date.now() });
}
```

### E.2 — `StynxTenantPickerComponent`

Renders when `tenantContext.availableTenants().length > 1 && !tenantContext.tenantId()`. Standalone, `OnPush`, translatable. Plugs into `App.routerOutlet` as a guard pattern: if no tenant picked, show picker; otherwise outlet renders.

### E.3 — Error-context decoration

`ErrorBannerService.show(payload)` injects the active tenant label from `TenantContextService.tenantLabel()` into the error message.

### E.4 — `@stynx-web/angular-audit` scaffold

`packages-web/angular-audit/package.json` — `0.1.0`, peer deps mirroring `angular-iam`.
`ng-package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`.
Wire into `pnpm-workspace.yaml`, `test-matrix.config.json`.

### E.5 — `AuditApiService`

```ts
listEvents(filter: AuditFilter, cursor?: string): Observable<AuditPage>;
getEvent(eventId: string): Observable<AuditEvent>;
listEntityHistory(resource: string, id: string, cursor?: string): Observable<AuditPage>;
verifyHashIntegrity(eventId: string): Observable<AuditIntegrityReport>;
```

`AuditFilter` covers `actor`, `action`, `entityKind`, `entityId`, `dateFrom`, `dateTo`, `tenantId`. Cursor-based pagination.

### E.6 — Audit log surface

`StynxAuditLogComponent` (`<stynx-audit-log>`) — search box, filter chips, table with cursor pagination via `@stynx-web/angular-ui`'s `StynxPaginationComponent`. Each row shows actor + action + entity + timestamp + integrity badge.

`StynxAuditEventDetailComponent` — full event payload, "diff" view between before / after state, integrity verification button.

### E.7 — Per-entity history

`StynxEntityHistoryComponent` — vertical timeline. Each event renders a card with action + diff. Cursor pagination for entities with long histories.

### E.8 — Hash-integrity badge

`StynxAuditHashIntegrityBadgeComponent` — calls `AuditApiService.verifyHashIntegrity(eventId)` and shows green / amber / red. Tooltip explains "this event's hash chains to event X, which chains to Y…".

### E.9 — Routes + provider

`auditRoutes()` covers `/audit`, `/audit/events/:eventId`, `/audit/entities/:resource/:id/history`.

### E.10 — Translation catalog

`src/i18n/{en,pt-BR}.json` for the audit package.

### E.11 — Tests

- TestBed spec per component.
- `AuditApiService` spec with mocked HTTP.
- `tenantChanged$` spec asserting subscribers fire on `setTenantId`.
- `StynxTenantPickerComponent` spec asserting it only renders on multi-tenant first-load.
- Mutation passes the configured repository threshold for the package under test.

(Playwright in FE-WAVE-G.)

## Success criteria

1. `TenantContextService.tenantChanged$` is shipped and tested.
2. `StynxTenantPickerComponent` is shipped.
3. `ErrorBannerService` messages include tenant label.
4. `@stynx-web/angular-audit@0.1.0` package builds; all components listed above ship.
5. Cursor pagination works against a mocked SDK in unit tests.
6. Hash-integrity badge calls the SDK and renders the right tone.
7. Translation catalogs `en` + `pt-BR` shipped.
8. `pnpm test:matrix` records the new test surface; mutation passes the configured repository threshold.

## Closure artifact

`docs/work/plan/FE-WAVE-E-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| E.1–E.3 tenancy polish | Engineer |
| E.4–E.10 audit package | Engineer |
| E.11 tests | Inspector |
| ADR for FE audit-event contract pinning | Architect |
