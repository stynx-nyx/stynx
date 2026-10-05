# docs

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/docs.yml`
("Docs freshness check").

Checks package README shape and documentation paths, then builds the
documentation site, when documentation sources change.

## Triggers

Pull requests and pushes to `main` that touch `docs/**`, `packages/**`,
`packages-web/**`, any markdown file outside `work/**`, the two check scripts
and their shared package discovery, the lockfile, the workspace manifest, the
root `package.json`, or this workflow.

## Jobs

- `build-docs`, in order:
  - `node scripts/check-package-doc-shape.mjs --strict --publishable --human`
    fails when a published `@stynx-nyx/*` package README lacks a required
    section. Private `tools/*` packages are outside this gate.
  - `node scripts/check-doc-paths.mjs --self-test` then
    `node scripts/check-doc-paths.mjs` fail when tracked markdown cites a
    repository path, in inline code or a relative link, that does not exist.
    Historical records and intentional citations of removed paths are listed,
    with reasons, in `HISTORICAL_RECORDS` and `HISTORICAL_CITATIONS` inside
    the script; stale entries in either list also fail.
  - `pnpm --filter @stynx-nyx/docs-site build:ci`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Path-filtered and not a required check.
