# ADR — CI economy, release authority, and database isolation

- **Status:** Accepted
- **Date:** 2026-08-24
- **Authority:** Architect, under the Owner's F7–F10 remediation authorization
- **Reconstructs:** the decisions implemented by `ae17024d6dce97dc8acdb826b320c3cab8092e9a`
- **Amends:** `2026-05-19-test-gate-tiers.md`
- **Related:** `2026-08-16-trusted-local-rc-evidence.md`

## Context

Commit `ae17024d6dce97dc8acdb826b320c3cab8092e9a` adopted a CI-economy design and
left binding `ADR-CI-ECONOMY` citations in workflows, database test support, and
integration tests, but the cited ADR was never committed. The implementation and
its commit record are therefore the reconstruction sources for Decisions 4,
5.1, 5.4, and 6a below. This ADR preserves those numbers so existing citations
remain reviewable; it does not invent missing decisions merely to fill a numeric
sequence.

The 2026-08-21 `0.5.0` publication also exposed a release-control ordering
failure. `changeset publish` irreversibly published packages before a client-side
pre-push hook evaluated forbidden-action authority. The hook then rejected tag
pushes, leaving a red workflow after successful registry mutation. Release
authority must be checked before publication over a deterministic historical
range, and CI must not rely on workstation hooks.

The same incident exposed two distinct server-control questions. Protection of
`main` and protection of tag refs are separate. In particular,
`enforce_admins: false` on `main` cannot explain a manual tag push; release tags
require their own server-side rule or protected-tag policy.

## Decision

### Decision 4 — Weekly full remote audit and quiescence

The complete heavy remote matrix runs on a weekly schedule and on explicit
`workflow_dispatch`. It is a periodic recalibration of evidence-based PR
inference, not a second daily CI lane.

For a scheduled run, a quiescence guard may green-skip the expensive matrix only
when the audited branch HEAD exactly equals the HEAD of the most recent
successful run of the same audit workflow. An explicit dispatch always runs the
complete matrix. A failed audit makes the branch unhealthy until the defect is
fixed and the complete audit workflow is rerun successfully; a later quiescent
skip cannot supersede a failure.

### Decision 5.1 — macOS is outside the pull-request hot path

The pull-request build lane is Linux-only and preserves its stable required-check
identity. The macOS build leg runs only in the weekly or explicitly dispatched
full audit. GitHub's macOS billing multiplier makes it unsuitable for the normal
PR hot path, while the periodic lane retains cross-platform evidence.

### Decision 5.4 — no daily scheduled CI

The primary CI workflow has no schedule trigger. Scheduled comprehensive work is
weekly under Decision 4; ordinary changes are exercised by pull-request and
release-branch triggers. Adding a daily schedule requires an Architect amendment
with an explicit cost and coverage justification.

### Decision 6a — migrated template databases and live-RLS ordering

Integration suites use isolated ephemeral databases cloned from one migrated
template database. The platform migration set is applied once to the template;
each suite receives a clone and must not replay the same migrations concurrently
against a shared database server. When no template is configured, the existing
standalone migration behavior remains the compatibility fallback.

A runtime RLS smoke check must observe the database produced by the platform
migration path. It runs after migration and structural verification and before
any DDL reset or seed reset. A reset may then prepare a separate downstream test
state, followed by migrated-template preparation and integration tests. Moving
the RLS check after reset is a sensor error because it no longer measures the
migration-produced state.

### Decision 7 — forbidden-action authority is a pre-publication server gate

Any CI job that may create or push refs, create a release, or publish a package
sets `HUSKY=0`. Client-side hooks are developer-workstation affordances and are
not CI controls. Other workflows have no current ref-writing or publication
surface; if one gains such a surface, it inherits this requirement.

The release workflow has an explicit forbidden-action job that succeeds before
the Changesets job can run. That job executes the canonical strict DEVAI check
over every commit after the previous successfully released unified commit. The
range is derived as follows:

1. enumerate reachable annotated tags matching `v<semver>`;
2. select the highest SemVer tag whose GitHub Release exists and is neither a
   draft nor a prerelease;
3. require the peeled tag commit to be an ancestor of the exact candidate;
4. run `devai check --only forbidden-actions --strict --since-ref <peeled-commit>`.

The `v0.5.0` release and its annotated tag establish the first lower bound for
this policy. A missing, lightweight, ambiguous, unreachable, draft, prerelease,
or malformed release tag fails closed. Bootstrap or correction of the lower
bound requires a new exact Owner authorization; `--max-commits N` is never a
release substitute because its verdict changes with history depth.

The same job runs on every `main` release-workflow invocation, including a normal
push that would only prepare a Changesets PR. Receipt debt therefore surfaces
when it lands rather than after the next registry mutation.

### Decision 8 — break-glass actions and ref protection are explicit

There is no implicit administrative or manual-push exception to Decisions 4–7.
An emergency bypass requires an exact Owner authorization that identifies the
actor, refs, commit, reason, recovery evidence, and closure condition before the
action. The action and its post-condition are recorded after execution; a generic
standing permission is insufficient.

Branch protection and tag protection are reconciled separately:

- `enforce_admins` governs administrators acting on the protected branch;
- release tags (`v*` and `@stynx-nyx/*@*`) require a server-side tag rule or
  equivalent protected-tag mechanism;
- local hooks provide useful early feedback but never establish server-side
  enforcement;
- changing live repository settings remains a separate Owner-authorized
  operation, preceded by a read-only drift report.

Until tag protection is enabled, a manual release-tag push is an auditable gap,
not an approved break-glass procedure.

## Consequences

- Existing `ADR-CI-ECONOMY` citations now resolve without renumbering call sites.
- Heavy evidence remains periodic and reproducible while PR feedback stays
  Linux-only.
- Integration isolation removes concurrent migration contention without
  weakening suite coverage or timeouts.
- Registry mutation cannot begin while forbidden-action debt exists anywhere in
  the complete release interval.
- A red post-publication hook can no longer masquerade as publication prevention.
- Branch-policy drift and tag-ref exposure are reported as different controls
  and require different Owner decisions.

## Verification

- Every repository citation to `ADR-CI-ECONOMY` resolves to Decision 4, 5.1,
  5.4, or 6a in this file.
- The docs synchronization build publishes this ADR from `law/adr`.
- The release job cannot start unless the deterministic forbidden-action job
  succeeds.
- The audit integration sequence observes migrated RLS before reset.
- Read-only repository-settings verification reports branch and tag-rule drift
  independently.
