# reusable-typecheck

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/reusable-typecheck.yml`
("reusable-typecheck").

Reusable workspace typecheck called by other workflows.

## Triggers

`workflow_call` only.

## Jobs

- `typecheck` for the requested Node version

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Called by `module-demo-bookmark.yml`.
