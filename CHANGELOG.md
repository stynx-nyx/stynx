# STYNX Workspace

This file is not the release log. The workspace root is a private package and
is never published.

- Per-package release history lives in `packages/*/CHANGELOG.md` and
  `packages-web/*/CHANGELOG.md`. Changesets writes those files when the fixed
  `@stynx-nyx/*` group is versioned.
- Release notes per version are the GitHub releases of this repository, tagged
  `v<version>`.

## Historical workspace notes (rounds R12 to R16, before 1.0, mid-2026)

These notes predate the first published release. They are kept as written and
describe the workspace at that time, including a package count that has since
changed.

- R16 deepens every published package README from ~50-130 line stubs to
  template-conformant developer references. All 41 packages (24 backend
  `@stynx-nyx/*`, 13 web `@stynx-nyx/*`, 4 tools `@stynx-internal/*`) now carry
  the locked 8-section shape: purpose / audience / install / quick-start /
  public-API-surface / configuration / examples / common-pitfalls /
  related-packages, pitched at the family-specific persona (NestJS backend
  devs / Angular frontend devs / workspace integrators). `@stynx-nyx/backend`
  (10 mountable submodules) and `@stynx-nyx/flow` (20 controllers / ~113 routes)
  split into `packages/<pkg>/docs/` subtrees; `sync-content.mjs` mirrors them
  into the published site. Two documentation checks land under `scripts/`:
  `check-package-doc-shape.mjs` (asserts the 8 mandatory sections) and
  `verify-package-doc-coverage.mjs` (diffs README symbol cites vs index
  exports). `check-package-doc-shape` goes 0/41 → 41/41 clean;
  `check-docs-governance` holds at pass 14/14; the Docusaurus build is clean
  for every new cross-reference.
- R14 migrates the Docusaurus scaffold from `docs/` to `docs/site/`. The workspace
  package is renamed `docs` → `@stynx-nyx/docs-site`; `pnpm --filter
@stynx-nyx/docs-site …` replaces `pnpm --filter docs …` in build pipelines.
  The `.github/workflows/docs.yml` workflow runs as a freshness check.
- R13 closes the SGP R11 PDF/A-2b conformance gaps in `@stynx-nyx/pdf` by bundling
  embedded fonts and sRGB ICC assets, adding deterministic PDF/A catalog
  metadata, and moving verification evidence before the final EOF.
- R12 supersedes the R10 PDF/A boundary exclusion by adding `@stynx-nyx/pdf-a` and
  `@stynx-nyx/pdf-a-vera-docker` as additive validator surfaces for PDF/A-2b.
