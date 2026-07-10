# PORT-09 — Frontend Patterns

**Produces:** `docs/stynx/porting-pack/09-FRONTEND-PATTERNS.md`.
**Depends on:** `05-PACKAGE-CATALOG.md`.
**Branch:** `docs/stynx/porting-pack/09-frontend`.

## Mission

Patterns for foreign frontends — both Angular adopters and non-Angular
consumers using `@stynx-nyx/sdk` only.

## Read

- `packages-web/sdk/src/` — exported client surface.
- `packages-web/angular/src/` — `StynxAngularModule.forRoot`,
  interceptors.
- `packages-web/angular-auth/src/` — login flow.
- `packages-web/angular-tenancy/` — note: NOT YET IMPLEMENTED per
  audit FIND-002. Mark accordingly.
- `reference/web/src/` — composition example.

## Sections

```
# 09 — Frontend Patterns

## Decision: Angular vs sdk-only

If the foreign frontend is non-Angular (React, Vue, vanilla TS),
the migration cost to Angular is large. Recommend keeping the
existing frontend and consuming `@stynx-nyx/sdk` (framework-agnostic
TypeScript). Only migrate to `@stynx-nyx/angular` if the team
explicitly chooses Angular.

## sdk-only adoption

- Importing the client.
- Headers to inject: `Authorization`, `X-Tenant-Id`, `X-Request-Id`.
- Error shape (matches `@stynx-nyx/data` errors via API mapping).
- 401 → refresh flow.

## Angular adoption

### Bootstrapping
StynxAngularModule.forRoot({ ... }) — config shape from source.

### HTTP interceptors
Auth, tenant, request-id, error. Cite each.

### Cognito OIDC PKCE login
Flow and the angular-auth surface that drives it.

### Tenant switcher
NOTE: `@stynx-nyx/angular-tenancy` is NOT YET IMPLEMENTED
(audit FIND-002). Until it lands, consumers must implement the
switcher in-app. Document the workaround pattern (`X-Tenant-Id`
+ session re-issue) explicitly.

### Permission guards and *hasPermission
Surface from angular-auth.

### Document upload component
`@stynx-nyx/angular-storage` — surface + minimal example.

### Trash list component
`@stynx-nyx/angular-trash` — generic soft-delete/restore UI.

### i18n catalog overrides
`@stynx-nyx/angular-i18n` — how to add app-specific keys.

## Component decision matrix

| Foreign UI need | STYNX component |
|---|---|
| Login form | `@stynx-nyx/angular-auth` |
| Tenant switcher | [GAP — see FIND-002] |
| File upload | `@stynx-nyx/angular-storage` |
| Trash list | `@stynx-nyx/angular-trash` |
| Profile page | `@stynx-nyx/angular-profile` |
| Session list | `@stynx-nyx/angular-sessions` |
| Generic primitives | `@stynx-nyx/angular-ui` |
| Translations | `@stynx-nyx/angular-i18n` |
```

## Rules

- The "sdk-only" path must be complete enough that a React
  consuming agent could integrate without reading any other doc.
- Wherever `@stynx-nyx/angular-tenancy` would be imported, mark
  the gap explicitly.

## Acceptance

- Decision section present and explicit.
- sdk-only and Angular paths both present.
- Component matrix internally consistent with the package catalog.
