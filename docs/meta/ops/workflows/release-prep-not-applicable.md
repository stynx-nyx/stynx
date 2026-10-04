# release-prep-not-applicable

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/release-prep-not-applicable.yml`
("STYNX Release Prep (not applicable)").

No-op companion that resolves the path-filtered required checks of `release-prep.yml` on pull requests that change none of its paths.

## Triggers

Pull requests matching the inverse (`paths-ignore`) of the release-prep path filter.

## Jobs

- `package-policy` (no-op success)
- `dependency-audit` (no-op success)

## Credentials

None.

## Notes

Job names must stay identical to `release-prep.yml`; `scripts/lint-workflows.mjs` enforces the mirrored path list.
