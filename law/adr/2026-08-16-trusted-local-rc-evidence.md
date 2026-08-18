# ADR — Trusted local RC evidence and mutation execution boundary

- **Status:** Accepted for DEVAI 1.2 cutover
- **Date:** 2026-08-16
- **Authority:** Architect, under the Owner's explicit adoption and publication authorization
- **Amends:** `2026-05-19-test-gate-tiers.md`
- **Supersedes on cutover:** Decisions D2 and D4 of `2026-05-21-mutation-thresholds-tiered.md`

## Context

STYNX requires the complete mutation floor as readiness-bearing evidence, but executing every
Stryker package on GitHub Actions makes the comprehensive gate take several hours. Moving
mutation execution away from GitHub must preserve every configured package, threshold, test, and
dependency while failing closed when proof is absent or invalid.

The exact-main census at `98aa8283b` discovers 32 workspaces that declare both a Stryker command
and one Stryker configuration. This count is an observed snapshot, not a permanent allowlist. The
previous adoption plan's fixed count of 31 became stale when `@stynx-nyx/preferences` acquired its
governed mutation suite.

## Decision

### D1. Mutation is a local-only RC node

`test:mutation` remains part of the DEVAI `rc` dependency closure and retains the existing serial
workspace execution and thresholds. It may execute only on an approved Inspector workstation.
GitHub workflows must not directly or transitively invoke `test:mutation`, Stryker, or an alias
that can resolve to either command.

Remote mutation is not a fallback. Missing, invalid, stale, incomplete, revoked, or mismatched
local evidence blocks readiness.

### D2. The required mutation roster is discovered, not hard-coded

The authoritative requirement is the exact deterministic roster discovered from current
workspace manifests and Stryker configuration files. The local exporter and independent remote
verifier must recompute the same roster and reconcile it with the STYNX test policy and exact N/A
declarations.

At adoption entry the roster contains 32 packages. Any addition, removal, rename, duplicate
configuration, missing command, missing report, unknown report, or policy mismatch changes the
roster digest, invalidates earlier evidence, and requires a new RC receipt. No package may be
silently excluded to preserve a historical count.

### D3. One signed RC receipt per exact candidate

An Inspector runs the DEVAI `rc` profile once for a clean exact candidate. Content-addressed task
results may be reused when their task keys and dependencies are unchanged, but every candidate
receives a new signed envelope bound to its repository, commit, exact Git tree, task policy,
toolchain, environment, outputs, and signer.

Mutation evidence contains one normalized result and one canonical JSON report for every package
in the discovered roster. The verifier independently recomputes roster completeness, artifact
digests, scores, threshold decisions, aggregate totals, task keys, and dependency closure.

### D4. Protected-tag transport and remote verification

Evidence is published under the immutable protected tag
`devai-local-evidence/<git-tree-sha>`. The remote `verified-local-rc` check validates an exact PR
candidate and may validate merged main only when its Git tree is byte-identical to the attested
tree. The verifier executes no STYNX product command and describes the result as trusted local
attestation, not independently reproduced CI.

The Inspector private key remains outside STYNX and GitHub. STYNX law contains only approved
public signer and revocation controls. Signer admission, evidence-tag rules, branch-protection
cutover, and any one-time bootstrap bypass remain explicit Owner-controlled effects.

### D5. Activation is atomic

This decision becomes operational only after all of the following hold together:

1. Published DEVAI 1.2 and the independently pinned verifier support the declared contract.
2. STYNX binds `law/policy/devai-adoption.json` through the supported adopter-policy interface.
3. All GitHub mutation execution paths are removed and the static local-only check passes.
4. A complete 32-package snapshot proof verifies for the bootstrap candidate.
5. Exact-main tree-equivalent verification succeeds after the authorized bootstrap merge.
6. Branch protection requires `verified-local-rc` and no longer requires the retired closure
   context.

Until that atomic cutover completes, this ADR authorizes implementation but does not assert that
trusted-local-RC adoption is operational.

### D6. Mutation evidence is a credential-free portable boundary

The local RC graph may require registry credentials for independently scoped security or release
preparation nodes. Those credentials are not mutation inputs. DEVAI must deliver only each task's
own declared environment, and the STYNX mutation wrapper must construct its child environment from
the mutation node's explicit infrastructure allowlist plus the minimum process bootstrap variables.
Registry credentials, GitHub credentials, signing keys, and unrelated CI secrets are excluded.

Every package report is normalized before it crosses the evidence boundary. The exact repository
root is replaced with `.`, remaining workstation-specific absolute paths and credential-shaped
values are rejected, and only canonical JSON reports plus normalized result records are exported.
Raw Stryker JSON, HTML, and logs are not evidence and are removed after both successful and failed
normalization attempts. The independently pinned verifier repeats the content-safety checks before
signing, publication, and remote acceptance.

This is defense in depth. Pattern matching does not prove that every possible secret can be
recognized, and trusted local attestation still does not prove that the Inspector workstation was
uncompromised.

## Consequences

- Fast remote PR gates continue to run lint, typecheck, unit, integration, build, reference,
  documentation, database, E2E, performance, security, release-preparation, and observation work
  that is safe for GitHub execution.
- A cold local RC can still take several hours; subsequent exact candidates may reuse only
  content-addressed results whose full inputs and dependencies are unchanged.
- A candidate code change invalidates the candidate receipt even when every reusable task key is
  unchanged.
- Trust establishes signer identity, byte integrity, exact inputs, and declared policy
  compliance. It does not independently prove that an uncompromised workstation executed the
  commands.
- If protected transport or verification fails after cutover, merges stop. Restoring remote
  mutation requires a new explicit Owner decision.
