# PORT-05 — Package Catalog

**Produces:** `docs/stynx/porting-pack/05-PACKAGE-CATALOG.md`.
**Depends on:** `_DISCOVERY.md`.
**Branch:** `docs/stynx/porting-pack/05-catalog`.

## Mission

For every `@stynx-nyx/*` and `@stynx-web/*` package found in discovery,
document the public surface and the trigger conditions that should
make a consuming agent reach for it.

## Per-package template

```
### @stynx-nyx/<name> — vX.Y.Z

- **Purpose:** <one sentence>
- **Maturity:** STABLE | EXPERIMENTAL | NOT YET IMPLEMENTED
  (use audit findings + test counts to ground this)
- **Public surface:**
  - `Symbol1` — <one-line description> (cite file:line of export)
  - `Symbol2` — …
- **Peer dependencies the consumer must provide:**
  - <package@version>
- **Import this when the foreign codebase has:**
  - <pattern 1>
  - <pattern 2>
- **Do not import this for:**
  - <anti-pattern>
- **Citation:** `packages/<name>/package.json`, `packages/<name>/src/index.ts`
```

## Reading required

- Every `package.json` under `packages/` and `packages-web/`.
- Every `src/index.ts` — list exported symbols.
- `docs/work/audit/01-COMPLETENESS-MATRIX.md` for maturity flags.
- For NOT YET IMPLEMENTED entries: cite the audit finding ID
  (FIND-001 / FIND-002 / etc.) and mark the package's row clearly.

## Decision matrix (mandatory)

After the per-package list, produce a table:

| Foreign-codebase concern       | STYNX package                                                         |
| ------------------------------ | --------------------------------------------------------------------- |
| HTTP request handling baseline | `@stynx-nyx/core`                                                         |
| DB access                      | `@stynx-nyx/data`                                                         |
| Auth (JWT verify, login)       | `@stynx-nyx/auth` + `@stynx-nyx/sessions`                                     |
| Multi-tenant context           | `@stynx-nyx/tenancy`                                                      |
| File uploads / S3              | `@stynx-nyx/storage`                                                      |
| Audit trail                    | `@stynx-nyx/audit`                                                        |
| Structured logs                | `@stynx-nyx/logging`                                                      |
| Health/probes/metrics          | `@stynx-nyx/health`                                                       |
| Rate limiting                  | `@stynx-nyx/ratelimit`                                                    |
| Idempotency keys               | `@stynx-nyx/idempotency`                                                  |
| LGPD export/erasure            | `@stynx-nyx/privacy`                                                      |
| i18n                           | `@stynx-nyx/i18n`                                                         |
| Test fixtures                  | `@stynx-nyx/testing`                                                      |
| CLI ops (migrate, doctor)      | `@stynx-nyx/cli`                                                          |
| Shared TypeScript types        | `@stynx-nyx/contracts` (status: NOT YET IMPLEMENTED — FIND-001)           |
| Angular HTTP client            | `@stynx-web/sdk`                                                      |
| Angular base                   | `@stynx-web/angular`                                                  |
| Angular auth UI                | `@stynx-web/angular-auth`                                             |
| Angular tenant switcher        | `@stynx-web/angular-tenancy` (status: NOT YET IMPLEMENTED — FIND-002) |
| Angular file upload            | `@stynx-web/angular-storage`                                          |
| Angular session list           | `@stynx-web/angular-sessions`                                         |
| Angular profile                | `@stynx-web/angular-profile`                                          |
| Angular trash UI               | `@stynx-web/angular-trash`                                            |
| Angular i18n                   | `@stynx-web/angular-i18n`                                             |
| Angular UI primitives          | `@stynx-web/angular-ui`                                               |

Adjust rows to match the actual package set discovered. Verify the
matrix is internally consistent with the per-package entries.

## Acceptance

- One subsection per discovered package, populated.
- Decision matrix present, every row maps to a real package or to a
  NOT YET IMPLEMENTED placeholder with a finding-ID citation.
- No package referenced elsewhere in the pack is missing from this
  catalog.
