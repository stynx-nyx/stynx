---
adr_id: ADR-FE-PACKAGING-0001
title: Angular Package Format for packages-web
status: accepted
date: 2026-05-19
authors: ['@aarusso']
tags: [stynx, frontend, angular, packaging, apf]
---

# ADR-FE-PACKAGING-0001 — Angular Package Format for packages-web

**Authority:** Architect.
**Related:** [`docs/work/plan/FE-WAVE-A-public-surface.md`](../work/plan/FE-WAVE-A-public-surface.md), [`docs/work/diag/FE-03-standards-compliance.md`](../work/diag/FE-03-standards-compliance.md).

## Status

Accepted on 2026-05-19 for FE-A.6.

## Context

The `@stynx-web/*` packages were previously built with plain `tsc`. That was enough for monorepo-local consumption, but external Angular CLI consumers expect Angular Package Format (APF): flattened ESM bundles, partial Angular compilation metadata, generated package manifests, and explicit package exports.

FE-A also introduced `exports`, `sideEffects: false`, and `./testing` barrels for every `packages-web/*` package. The packaging decision must preserve those public subpaths while changing the build output to APF.

The Angular packaging peer surface is ahead of the previous local dev dependency line. The operator decision for FE-A.6 is to resolve that packaging conflict by adopting the Angular 22 RC-compatible packaging toolchain for `packages-web/*` only, while preserving the root TypeScript 6.0.x policy and avoiding unrelated workspace upgrades.

## Decision

All `packages-web/*` packages publish APF output through `ng-packagr`.

- Each package owns an `ng-package.json` with `dest: "dist"` and primary entry `src/index.ts`.
- Each package keeps the previous TypeScript build command as `build:tsc` for one release as an escape hatch.
- Each package exposes `./testing` as an APF secondary entry point, backed by a package-local `testing/ng-package.json`.
- Source package `exports` point at the generated APF files under `dist/fesm2022/` and `dist/types/`, while generated `dist/package.json` is owned by `ng-packagr`.
- Package-local dev dependencies use `ng-packagr@22.0.0-rc.0` and Angular `22.0.0-rc.0` compiler packages. The repository root TypeScript dependency remains on `^6.0.3`.

## Alternatives Considered

- **Keep `tsc` only.** Rejected because it leaves external Angular consumers with a workspace-shaped package rather than an Angular library package.
- **Adopt root-wide Angular/tooling upgrades.** Rejected as broader than FE-A.6 and contrary to the operator constraint to keep this packaging-only.
- **Drop `./testing`.** Rejected because A.5 established the testing subpath as part of the public package surface.

## Consequences

External consumers receive APF-shaped packages with flattened ESM bundles and partial Angular compilation output. The `packages-web/*` build graph now validates generated `dist/package.json` manifests instead of relying on hand-authored `tsc` output paths.

The source package manifests intentionally retain `exports` for monorepo and local-tarball consumers, but `ng-packagr` rewrites conflicting export entries in `dist/package.json`. That warning is expected during the transition because the source package and generated package have different path roots.
