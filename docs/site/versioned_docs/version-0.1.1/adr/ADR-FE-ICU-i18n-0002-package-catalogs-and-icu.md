---
adr_id: ADR-FE-ICU-i18n-0002
title: Package Catalogs and ICU MessageFormat for packages-web
status: accepted
date: 2026-05-20
authors: ['@aarusso']
tags: [stynx, frontend, angular, i18n, icu]
---

# ADR-FE-ICU-i18n-0002 - Package Catalogs and ICU MessageFormat for packages-web

**Authority:** Architect.
**Related:** `internal work note (not published)`, `internal work note (not published)`.

Decision summary: `@stynx-nyx/angular-i18n` owns runtime translation,
`Intl` formatting, and ICU MessageFormat evaluation, and each template-bearing
`packages-web/*` package ships its own namespaced English and pt-BR catalogs.

## Status

Accepted on 2026-05-20 for FE-D D.5-D.8 and later FE-E/FE-F catalog
completion.

## Context

The web package suite previously exposed visible English literals and partial or
empty catalog directories. That blocked non-English adoption and made package
documentation overstate i18n readiness. Flow and other task-oriented surfaces
also need plural, count, date, number, and currency formatting that simple key
lookup cannot express.

FE-D introduced an extraction/checking lane and migrated packages to
`src/i18n/&#123;keys,en,pt-BR&#125;.json` catalogs where they ship user-visible templates.
FE-E and FE-F extended the same rule to new audit and flow surfaces.

## Decision

`@stynx-nyx/angular-i18n` is the canonical runtime for web package translation.

- `StynxTranslatePipe` accepts parameters and evaluates ICU MessageFormat when a
  catalog value contains ICU syntax.
- `@stynx-nyx/angular-i18n` depends on `intl-messageformat` at runtime and caches
  compiled formatters by locale and key.
- Date, number, and currency formatting use `Intl`-backed standalone pipes that
  observe the active `StynxI18nService` locale.
- Every template-bearing package owns package-namespaced keys such as
  `auth.*`, `flow.*`, `audit.*`, `storage.*`, `trash.*`, `tenancy.*`,
  `sessions.*`, `profile.*`, `iam.*`, `ui.*`, and `i18n.*`.
- Packages ship `en` and `pt-BR` catalog assets through their Angular package
  output and expose catalog subpaths for consumers that want package-provided
  defaults.
- `pnpm i18n:extract` and `pnpm i18n:check` are the governance path for keeping
  keys, catalogs, and visible template copy aligned.

## Alternatives Considered

- **Keep literal fallback strings only.** Rejected because adopters would need to
  fork or wrap components to localize them.
- **Make the host app own every web package catalog.** Rejected because it hides
  package defaults and makes first-use documentation incomplete.
- **Use Angular compile-time i18n for these packages.** Rejected for this wave
  because the package suite needs runtime locale switching and host-provided
  catalog composition.

## Consequences

Adopters must include `@stynx-nyx/angular-i18n` when they render translated web
components and should merge package catalogs with host-specific copy before
bootstrapping. The suite now treats untranslated visible literals as a check
failure, not as acceptable follow-up debt.

The first pt-BR catalogs are adopter-facing defaults, not legal copy approvals.
Host applications may override any key through their own catalog composition.
