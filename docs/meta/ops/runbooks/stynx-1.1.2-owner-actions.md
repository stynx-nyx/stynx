# STYNX 1.1.2 Owner actions

**Prepared:** 2026-08-31

**Authority:** Architect preparation; execution remains Owner-controlled

**Campaign:** `law/adr/2026-08-31-stynx-1.1.2-assessment-closure.md`

This checklist records external actions that repository changes cannot perform.
None of the commands or settings below is standing authority. Re-observe the
named state immediately before execution and stop on any mismatch.

## 1. Apply branch protection and create the release-tag ruleset

Apply `.github/branch-protection.yml` to `main` with:

- administrators enforced;
- linear history and conversation resolution required;
- strict status checks using all 13 declared contexts;
- one approving review, stale-review dismissal, and code-owner review;
- force pushes and deletion disabled.

Create the active `stynx-release-tags` ruleset for both
`refs/tags/v*` and `refs/tags/@stynx-nyx/*@*`. Block deletion and
non-fast-forward updates. Restrict tag creation to the STYNX Release workflow's
GitHub Actions identity and configure no administrator bypass.

After application, run `pnpm verify:branch-protection`. A nonzero result is drift,
not an advisory warning.

## 2. Preserve exact token boundaries

- `DEVAI_REPO_TOKEN`: package installation plus read-only repository protection
  observation. It must be able to read the repository and branch/ruleset
  metadata, but it is not the publication credential.
- `PACKAGES_READ_TOKEN`: protected DEVAI materialization only, with package-read
  access.
- `NPM_TOKEN`: a classic personal access token owned by an authorized
  `stynx-nyx` publisher with `write:packages`; include `repo` only if a linked
  private repository makes it necessary. Do not grant `delete:packages` for the
  release lane.

Release run `33386150523` proved that the replacement `NPM_TOKEN` could publish.
Re-verify its owner, expiry, organization authorization, and `write:packages`
scope before dispatching v1.1.2. Never paste token values into issues, logs,
commits, or workflow inputs.

## 3. Approve the deprecation plan, if desired

Review
`docs/meta/ops/runbooks/stynx-registry-deprecations-1.1.2.md`. Approval must name
the exact plan digest, the two messages, and the executing Owner. Execution is
separate from the v1.1.2 publish dispatch and must stop on registry drift.

## 4. Decide package visibility

All 44 packages were observed private on 2026-08-31. Choose one:

1. retain private visibility and keep authenticated-adopter documentation as the
   supported contract; or
2. authorize a separately reviewed visibility migration for all 44 packages.

Partial visibility is not an accepted fixed-group state. The v1.1.2 campaign
assumes private visibility unless the Owner records a superseding decision.
