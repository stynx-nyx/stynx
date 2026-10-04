# module-demo-bookmark

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/module-demo-bookmark.yml`
("module-demo-bookmark").

Build and security checks for the demo bookmark domain module.

## Triggers

Manual dispatch, and pushes and pull requests that touch the module paths.

## Jobs

- `build`
- `security`
- `workspace-typecheck` (calls the reusable typecheck workflow)

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Path-filtered and not a required check.
