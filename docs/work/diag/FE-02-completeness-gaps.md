# FE-02 — Completeness Gap Analysis

**Compiled:** 2026-05-19
**Reads:** [../inv/FE-01](../inv/FE-01-expectations-matrix.md), [../inv/FE-02](../inv/FE-02-package-inventory.md).
**Format:** one section per gap; each section names the gap, its remediation shape, and the wave that delivers it.

## Auth + Login

**Status from inventory.** ✅ Solid.

**Open items.**
- **No "current device" surface.** When a user lists active sessions, there's no indicator for "this device". The session ID is in the in-memory JWT; a default adapter that compares to that is trivial.
- **No expired-session UX.** When a 401 fires post-refresh, the `AuthInterceptor` swallows it; nothing prompts the user toward re-login with a clear banner.
- **No "permission denied" component.** When `PermissionGuard` rejects, the user lands on a 403 route; no styled denial page exists.

**Remediation.** Ship `StynxPermissionDeniedComponent` in `angular-auth`. Add `lastSeenAt` field to the session bundle when feasible. Surface a re-login modal via `ErrorBannerService` on 401-after-refresh.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md), [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## Profile

**Status from inventory.** 🟠 STUB.

**Concrete missing pieces.**

1. **No service.** No `ProfileService` against `/me` or `/profile` endpoints. No GET, no PATCH, no preferences GET/PUT.
2. **No typed form.** Template-driven `ngModel`; no `FormGroup<{ firstName: FormControl<string>, ... }>`; no validators.
3. **No avatar.** No file-picker, no preview, no upload integration via `angular-storage`.
4. **No password change.** Either an in-app form (requires SDK endpoint) or a button that hands off to the OIDC provider's hosted change-password flow. Neither is shipped.
5. **No MFA enrolment.** Same options as password change.
6. **No preferences persistence.** `StynxPreferencesFormComponent` renders inputs but doesn't save.
7. **No submit / save UX.** No spinner, no toast on success, no error banner on failure.
8. **No "unsaved changes" guard.** Navigating away mid-edit silently loses work.

**Remediation shape.**

```ts
// @stynx-web/angular-profile (proposed surface)
export class ProfileService {
  readonly profile = signal<StynxProfile | null>(null);
  reload(): Observable<StynxProfile>;
  patch(diff: Partial<StynxProfile>): Observable<StynxProfile>;
  setPreferences(prefs: StynxPreferences): Observable<void>;
  uploadAvatar(file: File): Observable<{ url: string }>;
}
@Component({ standalone: true, changeDetection: OnPush, selector: 'stynx-profile-form', ... })
export class StynxProfileFormComponent {
  readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.maxLength(80)]],
    email: [{ value: '', disabled: true }],  // read-only; managed via OIDC
    locale: ['en'],
    timezone: ['UTC'],
  });
  readonly status = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  save(): Observable<StynxProfile>;
}
```

Plus `StynxAvatarComponent`, `StynxChangePasswordHandoffComponent`, `StynxMfaEnrolmentHandoffComponent`. Translation keys throughout. Real unit tests with `TestBed`.

**Wave.** [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## Sessions

**Status from inventory.** 🟡 PARTIAL.

**Concrete missing pieces.**

1. No default `SdkSessionsAdapter`.
2. No "this device" badge.
3. No "revoke all other sessions" button.
4. No last-IP / last-user-agent / last-seen-at display (data exists on the backend).
5. No confirmation dialog before revoking.
6. No toast / undo affordance after revoke.

**Remediation.** Ship `SdkSessionsAdapter` as the default; keep the adapter interface as an extension point. Enrich the component with the above affordances. Use `@stynx-web/angular-ui`'s `StynxConfirmDialogComponent` + `StynxToastService`. Translate every string.

**Wave.** [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## Users / Roles / Groups admin (IAM)

**Status from inventory.** 🔴 MISSING.

**Required deliverable.** A new `@stynx-web/angular-iam` package. See [../inv/FE-03](../inv/FE-03-admin-and-rbac-surfaces.md) for the full surface table.

**Acceptance.** A consuming app does

```ts
provideStynxIam({ clientFactory: () => inject(StynxSdkClient) })
```

and gets working list / create / edit / disable / role-assign / group-assign / permission-matrix screens with translated strings, OnPush components, signal-driven UI state, RxJS HTTP service, route guards, permission gating. Default route layout under `iamRoutes()`. Test surface: ≥ 80 % branches, ≥ 70 % mutation, at least one Playwright scenario per CRUD vertical (users / roles / groups / permission-matrix).

**Wave.** [../plan/FE-WAVE-B](../plan/FE-WAVE-B-admin-iam-ui.md).

---

## Permission management (admin UI)

**Status from inventory.** 🔴 MISSING (the runtime check is fine; the management UI does not exist).

**Required deliverable.** Components inside `@stynx-web/angular-iam`:
- `StynxPermissionMatrixComponent` — role × permission grid. Bulk toggle, search.
- `StynxEffectivePermissionsComponent` — read-only "what can this user do?".
- `StynxRolePermissionsEditorComponent` — per-role grant / revoke.
- `StynxGroupRolesEditorComponent` — per-group role membership.

**Wave.** [../plan/FE-WAVE-B](../plan/FE-WAVE-B-admin-iam-ui.md).

---

## i18n catalogs + ICU + locale-aware pipes

**Status from inventory.** 🟡 PARTIAL.

**Concrete missing pieces.**

1. No translation catalogs anywhere in `packages-web/*/src/i18n/`.
2. No extraction tooling (the standard Angular `extract-i18n` works only on `@angular/localize`'s `$localize` API or on `<ng-container i18n>` templates; the suite uses neither — it uses raw text).
3. Every `*.component.ts` template has literal English. None call `| translate`.
4. ICU MessageFormat plurals are not used (`"You have {count, plural, one {1 task} other {# tasks}}"`).
5. No `Intl`-backed date / number / currency pipes — relying on Angular's built-in `DatePipe` / `DecimalPipe` is fine but they currently default to `en-US`.

**Remediation.**

1. Pick the canonical translation marker. Recommend `$localize` (`@angular/localize`) or the existing `TranslatePipe`. Trade-off: `$localize` enables compile-time extraction with `extract-i18n`, but requires the build pipeline to translate the strings; `TranslatePipe` is runtime, simpler to operate, harder to extract. **Recommendation: stay with `TranslatePipe` (runtime catalog).** Reason: matches the signal-driven, hot-reloadable, multi-tenant design the suite already has.
2. Ship a translation-key extraction script (`tools/i18n-extract.mjs`) that scans `*.component.html` + `*.component.ts` for `| translate` calls and `i18n.translate('...')` invocations and emits a key list.
3. Migrate every shipped component to use the key + pipe pattern. Ship `en` + one reference locale (e.g. `pt-BR`) for each package.
4. Add ICU pluralisation support to `TranslatePipe` (small change to call `intl-messageformat` when the catalog value contains ICU syntax).
5. Ship `StynxIntlDatePipe`, `StynxIntlNumberPipe`, `StynxIntlCurrencyPipe` in `angular-i18n` that bind to the active locale signal.

**Wave.** [../plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## Storage — download, drag-and-drop, multipart, scan callback

**Status from inventory.** 🟡 PARTIAL.

**Missing.**

1. **No `<stynx-document-download>` component.** Today the consumer must call `DocumentService.getSignedUrl(id)` and trigger a download manually.
2. **No drag-and-drop input.** Standard `<input type="file">` only.
3. **No multipart / chunked upload.** Large files (> ~100 MB) go up as a single PUT.
4. **No resumable upload.** A network blip kills the transfer.
5. **No virus-scan callback hook.** The backend may quarantine an uploaded blob; the FE has no contract to react.
6. **No batch upload.** Multiple files require multiple component instances.

**Remediation.** Add the components / methods above. Keep `XhrUploadExecutor` as the simple path; add `MultipartUploadExecutor` behind the existing `STYNX_UPLOAD_EXECUTOR` token. Add a `scanStatus$` event stream to `DocumentService` that mirrors the backend's quarantine signal.

**Wave.** [../plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## Trash — default adapter, bulk operations, retention countdown

**Status from inventory.** 🟡 PARTIAL.

**Missing.**

1. No default adapter.
2. No bulk-select / bulk-restore / bulk-hard-delete.
3. No retention-countdown display (when will this be auto-purged?).
4. No per-kind grouping (Records, Work-items, Documents in tabs).
5. No filtering ("show items deleted in the last 7 days", "by-actor").

**Remediation.** Ship `SdkTrashAdapter` per resource family + a multiplexing default that round-robins across known soft-deletable resources; bulk-action toolbar; retention countdown pill; per-kind tabs; filter chips.

**Wave.** [../plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## Tenancy — state-reset bus, tenant chooser at login, deep tenant context

**Status from inventory.** ✅ for the basics; 🟡 for the polish.

**Missing.**

1. **No `tenantChanged$` event.** Today each feature must subscribe to `tenantContext.tenantId` and react. A dedicated `tenantChanged$: Observable<TenantTransition>` would let consumers do `combineLatest([tenantChanged$, listOfMyResource$])` cleanly.
2. **No tenant chooser at login.** If a user belongs to multiple tenants, the suite doesn't prompt on first-load. Today the developer must wire one.
3. **No "tenant context" in error toasts.** Errors don't say *which* tenant they failed under, important for support.

**Remediation.** Add `tenantChanged$` to `TenantContextService`. Ship `StynxTenantPickerComponent` for the multi-tenant first-load flow. Decorate `ErrorBannerService` messages with the tenant label.

**Wave.** [../plan/FE-WAVE-E](../plan/FE-WAVE-E-tenancy-and-audit.md).

---

## Audit reports

**Status from inventory.** 🔴 MISSING.

**Required deliverable.** A new `@stynx-web/angular-audit` package.

| Component                                 | Selector                                  | Responsibility                                                         |
| ----------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `StynxAuditLogComponent`                  | `<stynx-audit-log>`                       | List events with cursor pagination; filter by actor / action / entity. |
| `StynxAuditEventDetailComponent`          | `<stynx-audit-event-detail [eventId]>`    | Side panel / route for a single event.                                 |
| `StynxEntityHistoryComponent`             | `<stynx-entity-history [resource] [id]>`  | Show all audit events for one entity (replayable timeline).            |
| `StynxAuditHashIntegrityBadgeComponent`   | `<stynx-audit-hash-integrity>`            | Per-event hash-chain integrity indicator.                              |
| `AuditApiService`                         | n/a                                       | RxJS wrapper around `/audit` endpoints.                                |

Read-only. Permission-gated. Cursor pagination via `@stynx-web/angular-ui`'s `StynxPaginationComponent`. Translatable. OnPush, signal-driven.

**Wave.** [../plan/FE-WAVE-E](../plan/FE-WAVE-E-tenancy-and-audit.md).

---

## Workflow UI polish to 1.0

**Status from inventory.** ✅ on capability; 🟡 on polish.

**Missing.**

1. No empty / first-run states for designer pages.
2. No publish / draft separation in the UI.
3. No "my open tasks" inbox component.
4. No per-run activity timeline.
5. ICU forms (richer fill question types: text-long, file, signature, conditional reveal).
6. Translated strings.
7. `OnPush` uniformly.
8. Real router tests + designer end-to-end test.

**Wave.** [../plan/FE-WAVE-F](../plan/FE-WAVE-F-flow-installable.md).

---

## UI primitives gap

**Status from inventory.** 🟡 PARTIAL.

**Missing primitives.** `<stynx-form-field>`, `<stynx-input>`, `<stynx-date-input>`, `<stynx-select>`, `<stynx-chip>`, `<stynx-autocomplete>`, `<stynx-card>`, `<stynx-side-nav>`, `<stynx-breadcrumb>`, `<stynx-icon>` (with a chosen icon strategy). Theme tokens (CSS custom properties for `--stynx-color-primary`, etc.) and a dark theme.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md) (sub-stream for primitives).

---

## Library packaging

**Status from inventory.** 🟠 absent.

See [FE-03](FE-03-standards-compliance.md#library-packaging) for the detail; the decision is in [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).
