# FE-WAVE-H — Reference App, Starter Template, Per-Package Docs

**Wave goal.** Convert the polished library suite into a first-five-minutes experience for client developers. Extract a starter template from `reference/web`; ship per-package READMEs; cross-link from `packages-web/README.md`.

## Scope

| Item                                            | Deliverable                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create-stynx-app` template                     | New `packages-web/create-stynx-app/` package OR `tools/create-stynx-app/` script that scaffolds an Angular 20 standalone app pre-wired with `provideStynxDefaults(...)`. |
| `reference/web` reorganisation                  | Promote `reference/web` to "showcase" status; document what it demonstrates; link from each package README.        |
| Per-package READMEs                              | One README per `packages-web/*`: install, peer-deps, `provideX` snippet, public surface, see-also.                |
| Top-level `packages-web/README.md` rewrite       | Index of packages, install matrix, conceptual overview.                                                            |
| Architecture diagram                             | Single SVG / Mermaid: how the packages depend on each other.                                                       |
| Migration notes                                  | `MIGRATING.md` per major version for adopters.                                                                     |
| ADR consolidation                                | `docs/adr/ADR-FE-PACKAGING-0001` (from FE-A), `ADR-FE-ICU-i18n-0002` (from FE-D), `ADR-FE-FLOW-PUBLISH-0003` (from FE-F), `ADR-FE-AUDIT-CONTRACT-0004` (from FE-E). |

## Workstreams

### H.1 — `create-stynx-app`

Decision (Architect): schematic vs Yeoman-style template vs git-clone script. Recommend **a thin shell script + a template directory**:

```
tools/create-stynx-app/
  bin.mjs            # cli entry point
  template/
    src/main.ts
    src/app/app.config.ts
    src/app/app.component.ts
    package.json
    tsconfig.json
    angular.json
    playwright.config.mjs
    .gitignore
    README.md
```

`bin.mjs` accepts `<app-name>`, scaffolds the template, runs `pnpm install`. Documented in `tools/create-stynx-app/README.md`.

`src/app/app.config.ts` provides `provideStynxDefaults(...)` with sensible defaults — references the OIDC config, tenancy adapter, and an empty flow placeholder.

### H.2 — Reference app reorganisation

`reference/web/README.md` describes what each page demonstrates and links to the per-package README. The dev-auth bypass is documented as test-only.

### H.3 — Per-package READMEs

For each `packages-web/*`:

```markdown
# @stynx-web/<pkg>

What it is. One paragraph.

## Install

```
pnpm add @stynx-web/<pkg>
```

## Peer dependencies

- `@angular/common`, `@angular/core`, …
- `@stynx-web/<dep>`, …

## Use

```ts
bootstrapApplication(App, { providers: [provideStynx<Pkg>({...})] });
```

## Public surface

- Components: …
- Services: …
- Tokens: …
- Routes: …

## See also

- [@stynx-web/<related>](../<related>/README.md)
- [Reference app demo](../../reference/web/README.md#<anchor>)
```

### H.4 — `packages-web/README.md` rewrite

- Conceptual overview: what the suite provides.
- Install matrix: which packages a typical app needs.
- Architecture diagram (Mermaid):
  ```
  graph LR
    sdk --> angular
    angular --> angular-auth
    angular --> angular-tenancy
    angular --> angular-i18n
    angular --> angular-ui
    angular-auth --> angular-profile
    angular-auth --> angular-sessions
    angular-auth --> angular-iam
    angular-auth --> angular-audit
    angular --> angular-storage
    angular-storage --> angular-trash
    angular --> angular-flow
  ```
- "Five-minute quickstart" using `create-stynx-app`.

### H.5 — ADR consolidation

Confirm each ADR named above is present, dated, and linked from `docs/adr/INDEX.md` (or equivalent). Update the introductory paragraph of each to summarise the decision succinctly.

### H.6 — Migration notes

`packages-web/MIGRATING.md` capturing the breaking changes introduced across FE-A through FE-G (signal-convergence deprecations, ICU upgrade, dropped per-package `*.e2e-spec.ts`, `ng-packagr` adoption). One short section per breaking change.

## Success criteria

1. `tools/create-stynx-app/bin.mjs` scaffolds a working Angular 20 app with `provideStynxDefaults(...)` in `< 30 seconds`.
2. `reference/web/README.md` exists and describes the demoed surface.
3. Per-package READMEs exist for all 11 packages + the new `angular-iam` + `angular-audit`.
4. `packages-web/README.md` is rewritten with the diagram and install matrix.
5. ADRs are consolidated under `docs/adr/INDEX.md`.
6. `packages-web/MIGRATING.md` exists.

## Closure artifact

`docs/work/plan/FE-WAVE-H-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| H.1 starter template | Engineer (under `tools/`) |
| H.2 reference reorg | Engineer |
| H.3 per-package READMEs | Engineer |
| H.4 top-level README | Engineer |
| H.5 ADR consolidation | Architect |
| H.6 migration notes | Architect |
