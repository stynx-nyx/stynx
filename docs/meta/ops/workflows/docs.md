# docs

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/docs.yml`
("Docs freshness check").

Builds the documentation site when documentation sources change.

## Triggers

Pull requests and pushes to `main` that touch the documentation paths.

## Jobs

- `build-docs`: `pnpm --filter @stynx-nyx/docs-site build:ci`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Path-filtered and not a required check.
