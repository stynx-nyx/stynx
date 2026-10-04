# audit

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/audit.yml`
("STYNX Weekly Audit").

Weekly remote recalibration of the product tiers that `verified-local-rc` otherwise covers locally.

## Triggers

Weekly cron (Monday 05:17 UTC) and manual dispatch.

## Jobs

- `audit-preflight`
- `audit-tier-gate` (needs preflight)
- `audit-integration` (needs preflight); runs `pnpm ci:stynx:remote-full` against a prepared PostgreSQL template
- `audit-build` (needs preflight), matrix over operating systems

## Credentials

Secret `DEVAI_REPO_TOKEN` (GitHub Packages read).

## Notes

Not a pull-request gate. Remains the remote check on the local RC closure under ADR-DEVAI-ADOPTION-0006.
