# NPM Security Upgrade Report

- date: 2026-04-26
- command_scopes: pnpm workspace, standalone infra/cdk npm package
- action: broad direct dependency and devDependency upgrade to latest stable compatible versions

## Upgrade Summary

All workspace `dependencies` and `devDependencies` were updated to their latest stable compatible versions. The standalone `infra/cdk` package was updated separately with npm and now has its own `package-lock.json` so its audit state is reproducible.

Key compatibility pins remain intentional:

| package                  |    pinned |   latest | reason                                                                                 |
| ------------------------ | --------: | -------: | -------------------------------------------------------------------------------------- |
| `@types/node`            | `24.12.2` | `25.6.0` | repo engines target Node 24 (`>=24 <25`)                                               |
| `typescript`             |   `5.9.3` |  `6.0.3` | Angular 21 build tooling requires `>=5.9 <6.0`                                         |
| `@mermaid-js/layout-elk` |   `0.1.9` |  `0.2.1` | `@docusaurus/theme-mermaid@3.10.0` peers on `^0.1.9`                                   |
| `intl-messageformat`     | `10.7.18` | `11.2.2` | `@stynx/i18n` emits CommonJS; v11 is ESM-only and breaks the current runtime/Jest path |

The Node/TypeScript split is now explicit:

- Node-oriented packages use TypeScript 6 with `ignoreDeprecations: "6.0"`.
- Angular packages use TypeScript 5.9 with the shared Angular-compatible config.
- Jest/ts-jest workspaces declare `@types/node@^24.12.2` directly to avoid peer resolution drifting to Node 25 types.

## Audit Summary

`pnpm audit --audit-level=high` passes.

Workspace `pnpm audit --json` still reports no high or critical findings:

- critical: 0
- high: 0
- moderate: 5
- low: 2

Standalone `infra/cdk` `npm audit --json` reports:

- critical: 0
- high: 0
- moderate: 0
- low: 0

## Remaining Findings

These are below the high gate and are transitive or false-positive findings after all direct dependencies were updated.

| package     | severity | source                                                        | status                                                                       |
| ----------- | -------: | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `bootstrap` | moderate | private workspace importer path `bootstrap`                   | audit false positive; no direct `bootstrap` package dependency is present    |
| `tmp`       |      low | `docs > @lhci/cli@0.15.1`                                     | latest LHCI still pulls affected transitive versions                         |
| `uuid`      | moderate | `testcontainers > dockerode`, Docusaurus/Webpack/SockJS paths | direct `uuid` is `14.0.0`; transitive overrides would be compatibility-risky |

## Verification

- `HUSKY=0 CYPRESS_CACHE_FOLDER=/tmp/stynx-cypress-cache pnpm install --frozen-lockfile`: passed
- `pnpm outdated -r --format json`: only the four compatibility holds above remain
- `pnpm audit --audit-level=high`: passed
- `pnpm build`: passed
- `pnpm typecheck`: passed, 60 successful tasks
- `pnpm lint`: passed, 39 successful tasks
- `pnpm lint:deadcode`: passed
- `pnpm lint:deps`: passed
- `pnpm test:unit`: passed
- `pnpm test:int`: passed
- `npm_config_cache=/tmp/stynx-npm-cache npm audit --prefix infra/cdk --json`: passed with 0 vulnerabilities

Latest local verification ran under Node `v24.15.0` with pnpm `9.15.0`.
