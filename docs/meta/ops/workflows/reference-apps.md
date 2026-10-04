# reference-apps

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/reference-apps.yml`
("STYNX Reference Apps").

Builds the reference API and runs the reference web end-to-end suite and container security scan.

## Triggers

Manual dispatch, and pull requests and pushes to `main` that touch the reference app paths.

## Jobs

- `reference-api`
- `reference-web-e2e` (needs reference-api); Playwright end-to-end tests
- `container-security`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Path-filtered. Reference web E2E execution is part of the signed local RC closure (ADR-DEVAI-ADOPTION-0006).
