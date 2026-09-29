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

The second full `pnpm ci:stynx` passed. Independent Claude Opus 5.5 delivery
review returned REVIEW: its hash-freeze finding was already fixed by Inspector
rebind (`916b711f`), and the substantive grant finding led to a column-scoped
0022 grant and database trigger. PostgreSQL request-path and 0021→0022
upgrade sensors now pass, including completed/legacy attempt rewrite denial.
The reviewer also identified optional request-path and PDF classification
hardening; the request-path failure and foreign-event ACK tests were added.

The first `release:consumer-fixtures` run encountered a transient missing
declaration during packaging. A package-only retry and the complete gate
passed: 44 tarballs installed across three local adopter fixtures. These are
STYNX fixtures, not DETRAN consumer proofs.

Opus delivery-review cycle 2 returned FAIL at the newly versioned 1.5.1
checkpoint: the legacy 1.5.0 registry policy and frozen script sensors had
not advanced with the version commit. Its review is retained in `reviews/`.
The Architect verified authenticated `latest=1.5.0` and
`rc=1.5.0-rc.2` for all 44 packages, then bound the exact 1.5.1 policy.
The Engineer updated the verifier constants, the Inspector updated the
version sensors and added three negative attempt-guard mutations, and the
Architect rebound all three trace projections. The two focused script
suites passed 115/115; PostgreSQL migration tests passed 3/3; trace is
473/473. Full local CI and a third delivery review remain due.

Opus cycle 3 (the bridge first rejected malformed reviewer JSON, then a
compact retry returned REVIEW) confirmed both 1.5.1 policy blockers fixed
and found one release-preparation gap: the 1.5.1 marker is treated as an
ordinary branch, so the consumed changeset is redrafted. The legacy D14
contract rejected a temporary root test-concurrency cap; the Engineer
reverted it. A forced full test graph with the original concurrency passed
97/97. Release context now needs an exact stable-patch classifier before
signed RC preparation.

The Architect recorded the exact stable-patch context; Inspector sensors
proved a red missing classifier, then 49/49 policy tests passed after the
Engineer implementation. `pnpm release:status` now classifies the 1.5.1
candidate, and `pnpm release:drafts` produced the expected empty draft set.
`pnpm check:trace --print` passed 473/473 after the Architect rebind.
Opus cycle 3 returned REVIEW solely on this classifier gap; its JSON is in
`reviews/delivery-review-3.json`. A follow-up delivery review and full CI
remain due on the completed HEAD.

`pnpm ci:stynx` passed on `af8f070c`: policy and trace, RLS negative,
97 unit test tasks, serial PostgreSQL integration, 48 build tasks and
doctor. The source-only Opus cycle 4 returned PASS with one low-priority
request for an additional runner-routing sensor; no required change remains
from the delivery review. `release:policy`, `release:provenance` and the
44-tarball, three-fixture consumer check passed. No DETRAN proof ran.

DEVAI 1.6.0 has no supported R-0001 closeout action. Its `round close` and
`round seal` commands are experimental; the historical round still has
TASK-0001 escalated and no ordered D/DII closing decision or phase ledger.
TASK-0003/0004 code defects were fixed, but the active marker remains until
DEVAI supports a governed closure with an explicit TASK-0001 disposition.

The post-1.5.0 coverage closure is now measured on the integrated 1.5.1
candidate. Inspector tests exercise the formerly uncovered branches in all
44 publishable packages, including real CMS/OCSP/CRL and PDF xref/DSS
boundaries; scoped parser/PKI mocks cover fail-closed defensive guards that
cannot be triggered by a valid pdf-lib parse. No threshold or test was
weakened. After the final assertion-strengthening pass, `pnpm test:coverage`
returned 44 results, zero failures, and exact 100% lines, statements,
functions, and branches for every package. `@stynx-nyx/signature` alone has
975/975 lines, 1131/1131 statements, 186/186 functions, and 1162/1162
branches, with 385 tests in its last focused coverage run. The Architect
rebound `law/trace.json`: 500/500 tracked executable tests. The branch merged
the seven intervening `origin/main` commits without force. The complete
`pnpm ci:stynx` passed after stronger value/argument assertions repaired
27 `lint:tests` findings; `pnpm api:baselines` matched 44 packages and
`pnpm check:rls-negative` checked seven tenant-scoped tables. A signed
local-RC candidate observation and a fresh cross-family delivery review
remain due before the R-0003 PR. No DETRAN proof ran.

Opus delivery-review cycle 5 returned FAIL on the 1.5.1 candidate after the
`origin/main` merge: its new session-policy changeset was unconsumed and the
source commits exceeded the exact post-marker follow-up contract. The review
also found a missing `INV-ERROR-001` trace mapping and a PDF xref-trailer
error boundary. The Architect restored the trace invariant and adopted
ADR-DEVAI-ADOPTION-0009 / OD-R0003-02 for a second fixed-group patch to
1.5.2. The Inspector added the malformed-trailer negative sensor
(`dc47de3b`), and the Engineer restored the typed guard (`d403c24f`). The
aborted 1.5.1 RC preparation was terminated before any receipt or tag was
exported. All gates and review will be repeated for the clean 1.5.2 SHA.

The fixed-group generator consumed the one session-policy changeset in marker
`8a71d0e6` and advanced all 44 packages to 1.5.2. Inspector sensors cover
both exact patch markers and reject source, workflow, root-manifest and
unrelated law follow-ups. Engineer bound the new classifier and the registry
policy digest. `pnpm release:status` passed on the resulting branch. The first
1.5.2 CI attempt failed only on two script-test expectations still fixed to
1.5.1; the Inspector corrected them and the Architect rebound trace. The
second `pnpm ci:stynx` passed at `ea1f6f1f8b9e625e996c7ea9c4018a53d8fbb24b`.
`pnpm test:coverage` then verified all four metrics at exactly 100% for
44/44 packages, with zero failures. `pnpm release:policy`,
`pnpm release:provenance`, `pnpm api:baselines` and the 44-tarball,
three-fixture `pnpm release:consumer-fixtures` gate passed. The Opus 5.5
delivery-review cycle 6 returned PASS with no findings; cycles 5 and 6 and
their bridge receipts are retained in `reviews/`. Signed RC preparation is
next. No DETRAN proof ran.

The exact forbidden-action receipt for Engineer merge
`1d08b743a7e29430790677e78994dd1ab23b7d59` passed the strict DEVAI
audit. The local RC for commit `43b2b29fc7819a6113b35623ec487a8156666c46`
and tree `df71c08dd4a88c1e622a6b28046849fa3e889c63` was signed by
`stynx-inspector-workstation-03` with receipt
`fe3523bd07a4fd7b599b21b66fb8b1aedbcb11b3fb46e730a2c6e69151f630b0`
and published as evidence tag
`devai-local-evidence/df71c08dd4a88c1e622a6b28046849fa3e889c63`.
Remote verifier run 36538947776 initially failed because `main` still carried
the older workstation-03 toolchain control. PR #315 promoted the reviewed
control and ADR, passed local and remote gates, received an Opus 5.5 PASS,
and merged at `95a240c32a4d801c92df22931743f39906ff2e79`; rerunning the
verifier (attempt 2) passed for that candidate.
PR #314 then exposed four additional public PKI fixture keys through its
Semgrep check. ADR-STYNX-1.5.2-PKI-FIXTURE-SCAN authorizes exactly those four
paths alongside the four already excluded keys. Inspector tests bind the
eight-path list and the second-marker follow-up states; Engineer updated the
allowlist and classifier without deleting tests. Opus cycle 8 returned PASS
with one low sensor finding; the Inspector bound the entire active ignore list
in a follow-up. Opus cycle 9 returned PASS with only a stale record sentence;
its review and bridge receipts are retained in `reviews/`. The final local
`pnpm ci:stynx` passed on `d991647c`, including PostgreSQL integration,
RLS-negative and doctor. `pnpm test:coverage` measured all four metrics at
exactly 100% for 44/44 packages with zero failures. `pnpm check:trace --print`
passed 500/500 after the Architect rebind; `pnpm release:consumer-fixtures`
installed 44 tarballs across three local adopter fixtures. Remote Semgrep and
a new signed local RC remain due on the final clean SHA. Publication remains
bound to a separate Owner receipt naming the eventual merged `main` SHA. No
DETRAN proof ran.
