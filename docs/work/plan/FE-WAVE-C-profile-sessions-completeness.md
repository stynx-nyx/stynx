# FE-WAVE-C — Profile (stub → real) + Sessions (polish + default adapter)

**Wave goal.** Replace the `@stynx-web/angular-profile` stub with a real profile experience; complete `@stynx-web/angular-sessions` with a default SDK-backed adapter and polish affordances.

## Scope

### Profile — promote from stub to feature-complete

Existing surface (replaced):
- `StynxProfileFormComponent` (bare `ngModel`) — replaced.
- `StynxPreferencesFormComponent` (bare `ngModel`) — replaced.

New surface:

| Item                                          | Selector / API                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `ProfileService`                              | RxJS HTTP + signal-cached `profile()` and `preferences()`.                  |
| `StynxProfileFormComponent`                   | `<stynx-profile-form>` — typed `FormGroup`, signals for `status`, submit.    |
| `StynxPreferencesFormComponent`               | `<stynx-preferences-form>` — same pattern.                                  |
| `StynxAvatarComponent`                        | `<stynx-avatar [userId]?>` — picker + upload + preview.                     |
| `StynxChangePasswordHandoffComponent`         | `<stynx-change-password-handoff>` — button; opens OIDC hosted-UI URL.       |
| `StynxMfaEnrolmentHandoffComponent`           | `<stynx-mfa-enrolment-handoff>` — button; opens OIDC hosted-UI URL.         |
| `profileRoutes()`                             | Routes for `/profile`, `/profile/preferences`, `/profile/security`.         |
| `provideStynxProfile({ clientFactory })`      | Standalone provider.                                                         |
| `STYNX_PROFILE_CLIENT`                        | Injection token.                                                             |
| `UnsavedChangesGuard`                         | Generic `CanDeactivate` guard for the profile route family.                 |

### Sessions — polish and default adapter

Existing surface (kept):
- `StynxActiveSessionsComponent` — kept, refactored.
- `StynxSessionsAdapter` interface — kept.

New surface:

| Item                          | Selector / API                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `SdkSessionsAdapter`          | Default implementation backed by `@stynx-web/sdk` `/auth/sessions` endpoints.           |
| `provideStynxSessions(...)`   | Standalone provider; uses `SdkSessionsAdapter` by default; accepts override.            |
| Polish to `StynxActiveSessionsComponent` | "this device" badge; revoke-all-others confirm dialog; last-IP / user-agent / last-seen columns. |

## Workstreams

### C.1 — `ProfileService`

```ts
@Injectable({ providedIn: 'root' })
export class ProfileService {
  readonly profile = signal<StynxProfile | null>(null);
  readonly preferences = signal<StynxPreferences | null>(null);

  reload(): Observable<StynxProfile>;
  patch(diff: Partial<StynxProfile>): Observable<StynxProfile>;
  setPreferences(p: StynxPreferences): Observable<StynxPreferences>;
  uploadAvatar(file: File): Observable<{ url: string }>;
}
```

Internally consumes `@stynx-web/angular-storage` for the avatar upload.

### C.2 — `StynxProfileFormComponent` rewrite

Typed reactive form per [FE-02](../diag/FE-02-completeness-gaps.md#profile). Signal-driven `status: 'idle' | 'saving' | 'saved' | 'error'`. Toast on save success via `StynxToastService`. Error banner via `ErrorBannerService`. Translatable.

### C.3 — `StynxPreferencesFormComponent` rewrite

Same pattern. Submit calls `ProfileService.setPreferences(...)`. On success, push the new locale to `I18nService.setLocale(...)` if locale changed.

### C.4 — Avatar + handoff components

`StynxAvatarComponent` — wraps `<stynx-document-upload>` from `@stynx-web/angular-storage`, with the avatar-specific accept list and size cap. Shows the current avatar (signal-driven), opens picker on click, posts upload, calls `ProfileService.uploadAvatar(...)`, refreshes preview.

`StynxChangePasswordHandoffComponent` and `StynxMfaEnrolmentHandoffComponent` — single button that opens the OIDC hosted-UI URL (derived from the `OidcClientAdapter` config) for the relevant flow. Returns to the app on completion.

### C.5 — Routes + provider

`profileRoutes()` + `provideStynxProfile(...)`. `UnsavedChangesGuard` on the form routes.

### C.6 — `SdkSessionsAdapter`

Default implementation backed by:
- `GET /auth/sessions` → `Observable<StynxActiveSession[]>`
- `DELETE /auth/sessions/{id}` → `Observable<void>`
- `POST /auth/sessions/revoke-others` → `Observable<void>`

Compares each session's `sessionId` to the JWT's `sid` claim to derive the "this device" indicator.

`provideStynxSessions()` uses `SdkSessionsAdapter` by default.

### C.7 — Sessions component polish

Render the `last-ip`, `user-agent` (truncated), `last-seen-at` columns. Add a per-row "this device" badge. Add a "Revoke all other sessions" button with `StynxConfirmDialogComponent`. Toast on revoke success.

### C.8 — Translations

`src/i18n/{en,pt-BR}.json` covering every visible label, validation message, dialog title.

### C.9 — Tests

- TestBed spec per component (form state, submit, validation, toast).
- `ProfileService` spec — HTTP mock.
- `SdkSessionsAdapter` spec — HTTP mock.
- `UnsavedChangesGuard` spec.
- Mutation passes the configured repository threshold for the package under test.

(Playwright in FE-WAVE-G.)

## Success criteria

1. `@stynx-web/angular-profile` ships the surface in the table above.
2. Profile and preferences forms are typed reactive forms; `[(ngModel)]` is gone from this package.
3. Avatar upload works against the SDK (proven by the service spec).
4. `change-password` and `mfa-enrolment` handoff components open the OIDC hosted-UI URL.
5. `@stynx-web/angular-sessions` exports `SdkSessionsAdapter` and a default `provideStynxSessions()`.
6. "This device" badge resolves correctly under unit test.
7. Translation catalogs `en` + `pt-BR` shipped for both packages.
8. `pnpm test:matrix` records the new test surface; mutation passes the configured repository threshold.

## Closure artifact

`docs/work/plan/FE-WAVE-C-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| C.1 service | Engineer |
| C.2–C.4 components | Engineer |
| C.5 routes + guard | Engineer |
| C.6–C.7 sessions adapter + polish | Engineer |
| C.8 translation catalog | Engineer |
| C.9 tests | Inspector |
