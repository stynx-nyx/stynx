# release-prep

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/release-prep.yml`
("STYNX Release Prep").

Release readiness checks for package policy, dependency audit, static analysis and release drafts.

## Triggers

Manual dispatch, and pull requests and pushes to `main` that touch release-relevant paths.

## Jobs

- `semgrep`
- `package-policy`
- `dependency-audit`
- `release-drafts`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

`package-policy` and `dependency-audit` are required checks on `main`. Its path filter is mirrored by `release-prep-not-applicable.yml`, and `scripts/lint-workflows.mjs` fails closed when the two lists diverge.
