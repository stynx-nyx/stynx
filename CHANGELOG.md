# STYNX Workspace

## Unreleased

- R14 migrates the Docusaurus scaffold from `docs/` to `docs/site/` per
  DEVAI ADR-DOCS-GOVERNANCE + ADR-LOCAL-PUBLISH-WORKFLOW. The workspace
  package is renamed `docs` → `@stynx/docs-site`; `pnpm --filter
@stynx/docs-site …` replaces `pnpm --filter docs …` in build pipelines.
  `.devai/config/project.json` now declares `repo.kind=library` and the
  full `docs.*` block. Docs publish moves from CI (GitHub Actions
  deploy-pages) to a local act via `devai docs publish`; the
  `.github/workflows/docs.yml` workflow runs as a freshness check
  only. Adoption ratified by `docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION.md`.
- R13 closes the SGP R11 PDF/A-2b conformance gaps in `@stynx/pdf` by bundling
  embedded fonts and sRGB ICC assets, adding deterministic PDF/A catalog
  metadata, and moving verification evidence before the final EOF.
- R12 supersedes the R10 PDF/A boundary exclusion by adding `@stynx/pdf-a` and
  `@stynx/pdf-a-vera-docker` as additive validator surfaces for PDF/A-2b.
