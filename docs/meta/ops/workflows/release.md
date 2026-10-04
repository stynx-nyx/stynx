# release

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/release.yml`
("STYNX Release").

Publishes the release after the forbidden-action audit of the release range.

## Triggers

Pushes to `main` and manual dispatch.

## Jobs

- `forbidden-actions`: `devai check --only forbidden-actions --strict` over the range from `scripts/resolve-release-forbidden-range.mjs`
- `release` (needs forbidden-actions)

## Credentials

Secrets `DEVAI_REPO_TOKEN`, `NPM_TOKEN`, `PACKAGES_READ_TOKEN`; variable `STYNX_ENABLE_REGISTRY_PUBLISH`.

## Notes

Every governed commit in the range needs its Owner receipt in `law/policy/forbidden-action-authorizations.json`, or the release lane fails.
