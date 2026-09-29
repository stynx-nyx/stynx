# R-0003 record

**Current role:** Architect. **Status:** active.

## Bootstrap

- Main at `64d7906682d00ea929e1b48cb7b67e477a46766a`; clean checkout.
- Reused a clean attached Codex worktree and created
  `codex/post-1-5-0-debt` from `origin/main`.
- Read `README.md`, Constitution and pin, applicable ADRs and schemas, and
  `docs/meta/development-contract.md` before the first change.
- Open GitHub issues: C-0002 #289–307 and legacy Owner #222–225. No open PR.
- DETRAN is excluded from execution by the current Owner instruction.

## Progress

The dependency-security inventory found five open Dependabot alerts plus a
sixth `undici` advisory in `pnpm audit`. Four root overrides pin vulnerable
transitive versions; patch/minor fixes are available. PF-06 PORM investigation
found an Angular 21/22 peer mismatch and colliding `flow` schema models. No
consumer or registry mutation has occurred.

Engineer `6888f73f` updated four root overrides and the frozen lockfile.
Frozen install passed; full and production audits report zero vulnerabilities.
The generated SBOM has 172 components and `pnpm security:release` passed.
Architect corrected stale prepublication contract/ledger prose. Hardening run
`36501815112` passed all k6 scenarios and baseline comparison on the exact
published 1.5.0 SHA, superseding the June R17-K6 known-gap row.

The complete local `pnpm ci:stynx` passed before the postrelease product
changes. The Owner issue #223 tag-creation restriction was not applied:
GitHub returned HTTP 422 when adding the built-in GitHub Actions app
(`15368`) as a bypass actor because that integration is not part of the
ruleset source or owner organization. The existing active deletion and
non-fast-forward rules remain in effect. A release-specific installed app
or another Owner-governed credential/workflow design is needed to restrict
creation without blocking automated releases.
