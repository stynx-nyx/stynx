# Main branch protection reconciliation proposal

- **Status:** Proposed; no repository setting change is authorized by this document
- **Authority:** Architect
- **Observed:** 2026-08-24 against `stynx-nyx/stynx:main`
- **Policy record:** `.github/branch-protection.yml`
- **Decision context:** `ADR-CI-ECONOMY`, especially Decisions 5.1, 5.4, 7, and 8

## Purpose

The repository-owned branch-protection record and the protection currently in
force on `main` have drifted. This proposal reconciles the intent without
changing GitHub settings. Any settings mutation requires a separate, exact
Owner authorization and a rollback plan.

Run the read-only detector with:

```sh
pnpm verify:branch-protection -- --json
```

The command fails closed when the policy is malformed, GitHub cannot be queried,
or any declared value differs from live protection. CI wiring is deferred until
a credential with read access to repository administration metadata is
available; the verifier must not be made advisory by swallowing those errors.

## Revalidated drift

| Surface                   | Repository record                                       | Live on `main`     | Recommendation                                                                                                   |
| ------------------------- | ------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Pull-request reviews      | One approval, stale-review dismissal, code-owner review | No required review | Enforce the recorded policy.                                                                                     |
| Administrator enforcement | Enabled                                                 | Disabled           | Enforce for routine operation; define a separately authorized, audited break-glass procedure if one is required. |
| Linear history            | Required                                                | Not required       | Enforce the recorded policy.                                                                                     |
| Strict status checks      | Required                                                | Not required       | Enforce so candidates are refreshed against current `main`.                                                      |
| Force pushes              | Disabled                                                | Disabled           | Retain.                                                                                                          |
| Branch deletion           | Disabled                                                | Disabled           | Retain.                                                                                                          |

### Required contexts

Keep the contexts already common to both states: `lint`, `typecheck`,
`unit-tests`, and `integration-tests`.

Add these live contexts to the repository record because they are intentional
parts of the active gate: `install`, `stynx-tier-gate`, `build (ubuntu-latest)`,
and `verified-local-rc`. Replace the ambiguous declared `build` context with its
exact live name, `build (ubuntu-latest)`.

Remove `doctor`, `lint:cycles`, and `reference-api` from the branch-protection
record as standalone contexts. Their work is represented inside the governed
DEVAI local-RC graph; retaining obsolete standalone names creates a control that
can never report.

Add these declared contexts to live enforcement because they remain independent
blocking controls: `semantic-pr-title`, `migration-lint`,
`reference-web-e2e`, `package-policy`, and `dependency-audit`. Before applying
the settings, the Owner must confirm each exact check name from a successful run
on the candidate workflow revision; GitHub context names are byte-sensitive.

## Branch and tag controls are separate

The `enforce_admins` value above governs the protected `main` branch. It does
not protect `refs/tags/*` and therefore does not, by itself, explain or permit a
manual release-tag push. The repository currently exposes no GitHub ruleset for
release tags. If tags are to be restricted, the Owner should separately
authorize a release-tag ruleset that identifies the permitted actor or workflow,
prevents deletion and update, and preserves a documented recovery path.

The release workflow must continue to perform the deterministic forbidden-action
scan defined by `ADR-CI-ECONOMY` before publication. Branch protection, tag
protection, and publication authorization are complementary controls; none is a
substitute for another.

## Proposed application sequence

1. Land and observe the read-only verifier without granting write access.
2. Confirm the exact successful check-run names on the candidate commit.
3. Obtain an exact Owner decision for the final branch policy and, separately,
   any release-tag ruleset.
4. Capture the current GitHub protection responses as recovery evidence.
5. Apply one bounded settings change, re-query it, and run the verifier.
6. Exercise the documented break-glass path without bypassing publication
   authorization, or record that no break-glass bypass exists.

Until those steps are authorized and completed, `.github/branch-protection.yml`
remains the intended policy record and the verifier is expected to report drift.
