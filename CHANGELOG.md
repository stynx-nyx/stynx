# STYNX Workspace

## Unreleased

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
