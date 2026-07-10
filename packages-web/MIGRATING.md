# Migrating packages-web

**Date:** 2026-05-20
**File:** `packages-web/MIGRATING.md`

This guide summarizes adopter-visible changes introduced by FE-A through FE-G.
It is scoped to the `@stynx-nyx/*` Angular package family.

## FE-A: Angular Package Format and public package surface

All `packages-web/*` packages now build and publish Angular Package Format
artifacts with `ng-packagr`. Consumers should import only documented package
entry points and subpaths.

Before:

```ts
import { StynxIconComponent } from '../../packages-web/angular-ui/src';
```

After:

```ts
import { StynxIconComponent } from '@stynx-nyx/angular-ui';
import { createStynxUiTestingHarness } from '@stynx-nyx/angular-ui/testing';
```

Adopter notes:

- Use package exports, not workspace source paths or `dist` internals.
- `./testing` is the supported testing subpath for package-provided helpers.
- Packages declare `sideEffects: false`; avoid relying on import-time side
  effects.
- Signal-based state is canonical. Deprecated observable compatibility adapters
  remain transitional and should not be used for new host integrations.
- Prefer `provideStynxDefaults(...)` when wiring the common Angular provider
  bundle in new apps.

## FE-D: ICU i18n and package catalogs

Template-bearing packages now ship namespaced `en` and `pt-BR` catalogs, and
`@stynx-nyx/angular-i18n` evaluates ICU MessageFormat through
`intl-messageformat`.

Before:

```html
<p>You have {{ count }} tasks</p>
```

After:

```html
<p>{{ 'flow.tasks.count' | translate: { count } }}</p>
```

Adopter notes:

- Merge package catalogs with host application copy during bootstrap.
- ICU plural/select/date/number/time expressions are supported through the
  translate pipe when the active catalog value uses ICU syntax.
- Use the package namespaces (`auth.*`, `iam.*`, `profile.*`, `sessions.*`,
  `flow.*`, `audit.*`, `storage.*`, `trash.*`, `tenancy.*`, `ui.*`, `i18n.*`)
  for overrides.
- Run `pnpm i18n:check` in this repository when changing package-visible copy.

## FE-E: Audit read contract

`@stynx-nyx/angular-audit` is a read-only package over the accepted audit events
contract. New audit UI integrations should target `/audit/*`, not
`/_audit/log`.

Before:

```ts
client.get('/_audit/log');
```

After:

```ts
providers: [
  provideStynxAudit({
    clientFactory: () => inject(StynxSdkClient),
  }),
];
```

Adopter notes:

- Required routes are `GET /audit/events`, `GET /audit/events/:eventId`,
  `GET /audit/entities/:entityKind/:entityId/history`, and
  `GET /audit/events/:eventId/integrity`.
- The frontend package uses `platform:audit:read:*`; do not invent package-local
  audit permissions.
- Cross-tenant misses should surface as not-found states. Do not use frontend
  code to infer hidden tenant data.

## FE-F: Installable Flow API

`@stynx-nyx/angular-flow` now treats design drafts and published runtime graph
versions as separate contracts and exposes an installable provider surface.

Before:

```ts
providers: [provideStynxFlow(new FlowApiService(http))];
```

After:

```ts
providers: [
  provideStynxFlow({
    clientFactory: () => inject(StynxSdkClient),
  }),
];
```

Adopter notes:

- `FlowGraph.status` is `'draft'` or `'published'`.
- Publish through `POST /flow/graphs/:id/publish`; runtime starts must use a
  published graph version.
- Draft-only runtime creation should return `409`.
- Custom and mock transports are supported through `provideStynxFlow(...)`; host
  apps do not need to depend directly on STYNX SDK internals.

## FE-G: TestBed, accessibility, and E2E cleanup

Package tests moved from import-only class checks toward TestBed-rendered
component behavior, route tests, SDK/network failure coverage, and reference app
Playwright coverage with axe reporting.

Before:

```ts
expect(StynxProfileComponent).toBeDefined();
```

After:

```ts
const fixture = await renderComponent(StynxProfileComponent, {
  providers: [provideStynxProfile({ adapter })],
});

expect(fixture.nativeElement.textContent).toContain('Profile');
```

Adopter notes:

- Package-local `packages-web/*/test/e2e/*.e2e-spec.ts` smoke specs were
  dropped. Use package unit/TestBed tests for component behavior and
  `reference/web` Playwright tests for real user journeys.
- `@axe-core/playwright` scans run from the reference app suite and report to
  `reference/web/.test-results/a11y.json`.
- Route and provider behavior is covered at package level for installable
  packages that expose routes.
- Browser-oriented TestBed helpers may require package-local browser testing
  dependencies when a host copies the pattern outside this workspace.
