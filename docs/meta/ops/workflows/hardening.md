# hardening

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/hardening.yml`
("Hardening").

Scheduled k6 load scenarios against the reference stack.

## Triggers

Weekly cron (Monday 04:00 UTC) and manual dispatch.

## Jobs

- `k6`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Not a pull-request gate.
