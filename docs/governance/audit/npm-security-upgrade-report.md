# NPM Security Upgrade Report

- date: 2026-04-26
- command_scopes: workspace, release-prep dependency-audit, reference-api image

## Audit Summary

`pnpm audit --audit-level=high` now passes.

- critical: 0
- high: 0
- moderate: 3
- low: 3
- outdated_count: 8

## Closed Findings

- `drizzle-orm`: bumped workspace consumers from `^0.44.7` to `^0.45.2` to close the high SQL identifier escaping advisory.
- `handlebars`: pinned transitive resolution to `4.7.9` through `pnpm.overrides` to close the critical/high advisories under `eslint-plugin-boundaries`.
- `serialize-javascript`: pinned transitive resolution to `7.0.5` through `pnpm.overrides` to close the high Docusaurus/Webpack advisory.
- `reference-api` and `reference-web` runtime images: removed bundled `npm` from the final images to avoid shipping non-runtime npm packages flagged by Trivy (`cross-spawn`, `glob`, `minimatch`, `tar`).

## Remaining Non-Blocking Findings

These remain below the `high` gate used by Release Prep.

| package | severity | installed | patched |
|---|---:|---:|---:|
| tmp | low | 0.0.33, 0.1.0 | >=0.2.4 |
| @tootallnate/once | low | 2.0.0 | >=3.0.1 |
| uuid | moderate | 8.3.2, 10.0.0, 11.1.0 | >=14.0.0 |

## Outdated Inventory

Root workspace `pnpm outdated --format json` currently reports 8 outdated direct dev dependencies. The security fix intentionally avoided broad major upgrades while the PR is focused on making the CI/release-prep gates green.

| package | current | wanted | latest |
|---|---:|---:|---:|
| @commitlint/cli | 19.8.1 | 19.8.1 | 20.5.2 |
| @commitlint/config-conventional | 19.8.1 | 19.8.1 | 20.5.0 |
| @eslint/js | 9.39.4 | 9.39.4 | 10.0.1 |
| @types/node | 22.19.17 | 22.19.17 | 25.6.0 |
| eslint | 9.39.4 | 9.39.4 | 10.2.1 |
| eslint-plugin-boundaries | 5.4.0 | 5.4.0 | 6.0.2 |
| globals | 16.5.0 | 16.5.0 | 17.5.0 |
| typescript | 5.9.3 | 5.9.3 | 6.0.3 |

## Recommended Path

1. Keep this PR constrained to patched transitive dependencies and CI plumbing.
2. Handle `uuid >=14`, `tmp >=0.2.4`, and `@tootallnate/once >=3.0.1` in a follow-up dependency-maintenance PR because they require major transitive movement.
3. Track ESLint/TypeScript/Commitlint majors separately after `main` is green.
