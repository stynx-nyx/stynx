# ci

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/ci.yml`
("STYNX CI").

Slim pull-request and branch CI.

## Triggers

Pull requests, and pushes to `main` and `release/**`.

## Jobs

- `install`
- `lint` (needs install)
- `typecheck` (needs lint)
- `lint:cycles` (needs lint)
- `migration-lint` (needs lint)
- `doctor` (needs typecheck); runs DEVAI doctor, which must exit 0

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

`install`, `lint`, `typecheck` and `migration-lint` are required checks on `main`. Unit, integration, tier-gate and build moved into the signed local RC closure (ADR-DEVAI-ADOPTION-0006).
