# v1.0 Release Readiness

Current execution status is recorded in the 2026-10-24 integration update below; earlier release and candidate sections retain their historical scope.

Prompt 37 release readiness is **closed** as of 2026-04-27 under the revised
no-cloud-secret artifact scope. AWS/ECR push and Cosign signing are no longer
Prompt 37 gates; reference app image scans and SBOM generation are owned by the
reference-app workflow instead of the STYNX package release lane.

## Operative A+B / C+D checkpoint — 2026-10-24

Final A+B C is `677b7770413d7123df19fd9dfad3f723285d9b20`, tree `7260437fa73aeb37776da6fe1be3605cd52966be`, after the preserved ten-commit replay and scoped source/test/trace checkpoints. The official baseline writer completed one clean 47-package build successfully: all export maps and 2224 projections were preserved, only the intended import-resolver.mjs/workspace.mjs source hashes changed, and emitted TypeScript declarations were unchanged. Product trace 715/715 and all 15 runner/verifier policy keys match. The RC completed successfully at 2026-10-24T19:25:27.325301Z: all 15 nodes, all 46 coverage commands at status 0, and three signed artifacts. Receipt `dece2c6ea1a264ada77b47fca1f5882eaf29c4ef462ccafd3dd9a2b603f1e4a3` binds this exact C/tree and policy `a07fa66bc825304d89cfada36edc5f6b13a3dfa269127a7706be766c1391fa2c`. The coordinator independently verified exact C, protected trust and both policy builders; cleanup at19:26:23.936056Z confirmed no owned leftovers. Evidence: `/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/s10-ab-677b7770-rc/qualification-summary.json`. Product source and approved auxiliary B1 were normally pushed. [PR #421](https://github.com/stynx-nyx/stynx/pull/421) merged at 2026-10-24T19:42:17Z as `d12877042fc78e4cd1b7bcbfafa0c0e25dd5f088`, retaining tree `7260437fa73aeb37776da6fe1be3605cd52966be`. The coordinator and Engineer independently verified all 14 full patches, intermediate trees, authorships and ordering. Auxiliary commits were excluded and the qualified source remains frozen. Inspector strict `10514fea..d1287704` full-range audit passed with no findings, all 16 detectors and 257 unchanged receipts. Ordinary generated main push run `40126507601`, job `120968995002` and check `120969057986` succeeded on exact landed `d12877042fc78e4cd1b7bcbfafa0c0e25dd5f088`. Evidence: `/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/s10-ab-landed-full-range/{custody,stdout,main-runs,main-checks}.json`. Product A+B is delivered. The coordinator refreshed remote state at 2026-10-24T19:58:36Z: all 22 main checks completed without pending jobs or failures, and origin/main remained exact d1287704. Workflow success is not release authorization or evidence of a new publication. Formal DEVAI acceptance, release classification, publication and DETRAN/PORM acceptance remain separate.

ADR0038 external exact approval is “Approve the exact A+B auxiliary verification.” Reviewed auxiliary B `5ac016b29686a4cbc27111d547e39160bdf1fa49` has receipt-only direct child B1 `2bf5a8919ae27b16bbc777ff271b95a9d53adb8b` (tree `9d692fbc6a85535b148536305a92362fd5aff65d`), appending only exact W0 `887a055de968c586c0149829b82bb9fc547c1445` CI authority. All other B bytes, workflow/test/trace and 257 prior receipts remain unchanged; normal hooks passed. Guard 37/37 and auxiliary trace 716/716 are focused evidence, not product RC. See the exact external packet `/tmp/stynx-ab-descriptor-transition-proposal.md`. After complete RC and independent verification, the approved normal push and single auxiliary dispatch were performed. ADR0038 authority is consumed: run `40125435260` on exact B1 succeeded, and exact-C `verified-local-rc` check `120965779943` succeeded. No further dispatch authority is inferred; protected integration, strict landed-range audit and the ordinary main verifier are complete. Do not copy or merge auxiliary ADR0038, workflow, tests or receipts into product/C+D.

ADR0034 is accepted on 2026-10-24 with “Approve the three bounded result corrections”: audit direct/wire result types and reviewed emitter/SDK propagation, distinct raw direct retirement results retaining nested Date, and nullable append-result metadata retaining write inputs. Implementation has focused validation, with final generation and qualification still pending. Historical supplemental observations passed HTTP 5/5, outbox 24/24 and added audit 15-reader/10-service cases; the earlier full audit two-file run was 63/88 with 25 conversion failures, not pre-existing baseline failures. Those failed logs remain evidence; the later focused audit cohort passes 113 cases. This is mocked-driver/real-Nest serialization evidence, not PostgreSQL or emitted-consumer proof. Static audit-query conversion remains incomplete. Official generation, default/OfflineCtg9 alias/export and runtime-value compatibility, emitted consumers, baseline and final package/RC gates remain pending. Flow current exported Maps remain unsupported: the normal Flow compile failed with six type errors and measured 1.48 GB peak RSS, so no import benchmark ran. Engineer is correcting the errors within approved types. The 8479-definition import/provenance benchmark and bounded proof design remain pending; no general Map exception or silent proof-budget increase is authorized.

C+D dependency preparation completed with the normal frozen offline install and supported pending rebuild under Node24.20.0/pnpm9.15.0. All seven dependency lifecycles and both workspace prepare scripts succeeded; lock and governed source were unchanged by preparation. Inspector separately owns the two announced concurrent test edits. The completion record retains duplicate pending-marker and absent offline-sync dist/bin caveats; it does not claim a product build or new passing tests. Current focused C+D evidence passes: forwarder 25, F2/census 17, audit 113, Jobs 19, Outbox 24, corrected data 57 and emitter 73 cases. Initial failed logs remain preserved. Minimal core/data builds passed. These bounded results do not establish full C+D qualification, emitted public API compatibility or official SDK generation. Evidence: `/tmp/stynx-cd-dependency-preparation-20261024/completion.json`. Accepted ADR0034 scope, release classification, formal DEVAI acceptance, downstream DETRAN/PORM holds and #211 authority remain separate and unchanged.

Earlier dated progress below remains historical where superseded by this checkpoint; no failed attempt, original approval, round disposition, release or consumer boundary is rewritten.

## Implemented release-prep surfaces

- Major `1.0.0` changeset stubs for every publishable workspace package under `.changeset/`.
- Root `MIT` license plus per-package `LICENSE` files for every publishable package.
- Release policy verification script:
  - `pnpm release:policy`
- Security release lane:
  - `pnpm security:release`
  - `pnpm security:sbom`
  - `pnpm security:licenses`
  - `pnpm security:secrets`
- Changeset status + release draft generation:
  - `pnpm release:status`
  - `pnpm release:drafts`
- Release-prep GitHub Actions workflow:
  - Semgrep
  - dependency audit
  - package policy verification
  - release draft artifact generation
- Reference app GitHub Actions workflow:
  - reference API build and test lane
  - reference web E2E lane
  - Trivy image scans
  - Syft SBOM generation
- Reference-app image artifact checks:
  - build reference API and web images locally on the runner
  - run Trivy vulnerability scans
  - generate and upload Syft SBOM artifacts
- ADRs remain published in the docs site under `Architecture Decisions`.
- The v1.1 planning issue template is staged under `.github/ISSUE_TEMPLATE/v1_1_planning.md`.

## Flow Package Addendum (2026-05-17)

The PORM-to-STYNX Flow gap pass added release-visible package evidence for:

- `@stynx-nyx/flow`: backend package build/test coverage, platform migrations `0015_flow_gap_closure.sql` and `0016_platform_curated_audit.sql`, answer/waiver mutation signal freshness, curated-table DML audit coverage, reference API import via `StynxFlowModule`, and release changeset `.changeset/flow-gap-closure.md`.
- `@stynx-nyx/angular-flow`: Angular package tests with `passWithNoTests` removed, API facade coverage for the Flow contract, typed fill execution controls, reference web route mount under `/flow`, route-access E2E seed, and release changeset `.changeset/flow-gap-closure.md`.
- Flow deprecation-readiness evidence: reference API HTTP-pipeline coverage for Flow guards, request context, idempotency replay, audit writes, form answer/waiver execution, signal freshness, task assignment/action, and analytics smoke; reference-web generic route E2E coverage for forms, fills, assignments, waivers, open tasks, and run summary; and the consuming-repo cutover plan in [porm-flow-deprecation-readiness.md](porm-flow-deprecation-readiness.md).

This addendum is factual package-readiness evidence only. It does not change the v1.0 release-scope notes below or assert registry publication.

## Closure Evidence

The CI-authoritative gates that blocked Prompt 37 are green on `main`:

| Gate                                                          | GitHub Actions run | Result                        |
| ------------------------------------------------------------- | -----------------: | ----------------------------- |
| STYNX CI framework lane                                       |      `24976849184` | success                       |
| Reference app lane, including Linux `reference-web-e2e`       |      `24976849184` | success before workflow split |
| Docs, including Chrome-backed Lighthouse                      |      `24972209610` | success                       |
| Hardening first k6 baseline seed                              |      `24973827712` | success                       |
| Hardening second k6 baseline comparison + mutation thresholds |      `24976855814` | success                       |
| Release Prep                                                  |      `24977530998` | success                       |
| Release workflow                                              |      `24976849172` | success                       |

## Scope Notes

The original Prompt 37 text included ECR push and Cosign signatures. That
requirement was intentionally removed from the v1.0 closure bar so release
readiness can be proven without repository AWS/ECR/Cosign secrets. Container
registry publication and keyless image signing can be restored as a later
deployment hardening task when those environments exist.

The release workflow still owns package versioning through Changesets. Registry
publishing is intentionally opt-in because the historical package scopes
(`@stynx`, `@stynx-web`, and `@stech`) could not be published with this
repository's default `GITHUB_TOKEN`. All packages now live under the
`@stynx-nyx/*` scope (owned by the `stynx-nyx` org) and publish with
an explicit manual `STYNX Release` dispatch with `publish: true`, the
Owner-controlled `STYNX_ENABLE_REGISTRY_PUBLISH=true` repository opt-in, and
an appropriate `NPM_TOKEN`. A push to `main` is always forced into
non-publishing Changesets preparation mode, even while the repository opt-in
is enabled.

The spec’s public post-release label is still intentionally not applied by this
readiness closure:

- `README.md` is **not** changed to `STYNX v1.0 - Shipped`.

## Exact-main package and documentation publication

### Fixed-group version rule (from 1.3.1)

The 47 publishable `@stynx-nyx/*` packages form one Changesets `fixed` group and
always release at one shared version. `pnpm version-packages` (backed by
`scripts/version-packages.mjs`) computes that version _before_ Changesets runs:
the current unified version advanced by the highest bump type that a pending
changeset declares for a group member. A major is a major only when a changeset
says so. Changesets' own peer-dependency inference reads the required
`workspace:*` peer form as "exactly the previous version" and would otherwise
promote every minor of the group to a major (1.3.0 was generated as 2.0.0 and
corrected by hand); the script rewrites the generated version in the manifests
and in the new CHANGELOG section, including the `Updated dependencies` sibling
lines. `pnpm release:preview` prints the pending changesets and the resulting
version without writing anything, and the `ci: version packages` commit must be
the direct child of `main` as before.

### Historical 0.5.0 publication contract

The following paragraphs preserve the historical 38-package candidate contract.
They do not describe the current published version or authorize a new release.

The current publication candidate is prepared through two independent manual
lanes. Neither lane publishes from a pull request, a branch tip supplied by a
candidate, or an automatic `main` push.

Package publication for the current candidate uses a one-time unified-version
rebaseline rather than an ordinary Changesets projection. The private root
workspace and all 38 public `@stynx-nyx/*` packages move together to `0.5.0`;
private reference applications and internal tooling retain their independent
operational versions and are neither versioned nor tagged by the public package
lane. Existing registry releases remain immutable, and consumers whose ranges
target a later major version will not select `0.5.0` automatically.

Release preparation accepts this exceptional candidate only when the
`ci: version packages` commit is the direct first-parent child of the verified
base, changes the exact 38-package manifest and changelog roster, and is followed
only by the narrow release-policy support paths. Future public package releases
return to the normal Changesets flow, with the fixed package group preserving
one shared version. After this candidate reaches exact `main`, an
Owner-authorized `STYNX Release` dispatch must supply that full 40-character
commit as `candidate_sha`, set `publish: true`, and have the Owner-controlled
`STYNX_ENABLE_REGISTRY_PUBLISH=true` opt-in. The workflow fails if the authorized
commit, checked-out commit, or current `origin/main` differ. Registry credentials
are scoped to install and publication steps.

Documentation publication remains a local, human-authorized act as required by
DEVAI documentation governance. `node scripts/publish-docs-site.mjs prepare`
builds an exact `main` candidate with no tracked or untracked drift into an
external bundle and records the repository, commit, Git tree, every file
digest, and aggregate site digest.
`node scripts/publish-docs-site.mjs publish --manifest <external-manifest>
--signing-key <external-private-key> --confirm-publish` re-verifies that bundle
and advances the existing `gh-pages` branch with a signed commit only when the
Owner supplies the exact manifest and the local
`STYNX_ENABLE_PAGES_DEPLOY=true` opt-in. The private SSH signing key must remain
outside the repository, have a matching public key, and deny group and other
access. The publisher verifies the commit signature locally and records the
signer fingerprint in the external publication receipt. GitHub's separate
`Verified` badge depends on that public key also being registered as a signing
key and is not substituted for local verification. Signature verification
precedes every push and is repeated for an idempotent publication. CI validates
documentation freshness and the local publication contract but never publishes
the site.

Publication readiness is therefore established only after the unified-version
candidate is merged, exact-main checks pass, and the Owner names the exact
commit in the package dispatch and local Pages authorization. Package and Pages
publication receipts must then be reconciled with that same commit before the
result is described as shipped.

## Historical STYNX 1.6.0 bounded publication

The Owner's 2026-10-11 [bounded publication decision](../../../law/adr/2026-10-11-bounded-1.6.0-publication.md)
preserves the fifteen-node signed local RC, ordinary static/security/product and
coverage checks, strict protected integration and exact-main publication controls.
Published DEVAI 2.6.0 is sufficient for that lane. No k6 or mutation campaign is
executed for this publication. HTTP/k6 evidence is NOT_OBSERVED, mutation is
NOT_RUN, and the actual audit observation remains non-promoting; no complete
performance or fully green scorecard is claimed. Consumer/provider acceptance and
issue closure require their separate actual evidence after publication.

The [portable independent signature security review](../../meta/security/signature-1.6.0-independent-review.json)
is attributed to the separate Auditor session and retained with this candidate.
Its exact public projection SHA-256 is
`c9aa779e469affdfb0b0c1fb8128a06cdc3ec5a1a06ba2d7ce66071eb29edfe9`.
It records the original D1.9 PASS, reviewed source/authority/140 public fixture and
test identities, independent authorship and later byte-custody recheck. That PASS
covers only the reviewed minimal LTA framework bytes; it supplies no overall
release readiness, current audit verdict or production provider/DETRAN approval.
The signed exact-candidate RC preserves these public review bytes durably.

## Dated reconciliation — 2026-10-23

STYNX 3.0.0 and all 47 fixed-group packages are published under
[ADR-RELEASE-0006](../../../law/adr/2026-10-22-stynx-3.0.0-sm-21-release.md).
The 38-package 0.5.0 and 44-package 1.x records above remain historical evidence.
Published framework delivery is separate from STYNX adoption completion,
canonical round retirement and DETRAN/PORM acceptance.

The [consolidated execution reconciliation](../../meta/ops/stynx-execution-reconciliation-2026-10-23.md)
records S8 verification, preserved S7 work, S10 A+B/C+D sequencing and accepted
ADRs0028–0033. Original S8 `72616fe6` failed security after 13 passed nodes.
Historical candidate `5f4f456d` has passing targeted security evidence and all three audits;
the genuine official API clean build preserved all 47 exports and 2,224
projections. The subsequent RC retained five initial gate passes, then failed
its unit node: SQL negative compilation took 76.139s against the unchanged 60s
limit; 183 other data cases passed. Docs were interrupted and remaining gates
were not executed. SIGTERM was requested at 02:07:35.474Z; exit 143 was observed,
with process/port/index release confirmed at 02:09:32Z. No signed receipt or
merge exists for this failed attempt.

The subsequent isolated diagnostic passed the actual unchanged test in 1,573ms;
the full compiler probe took 2.726s. No candidate, test, timeout or diagnostic
enumeration changed; the original timeout cause remains unproved. These focused
results do not replace the full RC. STYNX released the diagnostic window to
DETRAN at 02:33:01Z for its reassessment. DETRAN subsequently explicitly released
the local window; the later retry-02 and sensor-repair record below supersedes this waiting
status and retains the failed-attempt history.
The integration order remains S8, then S7, then S10 A+B, then checkpointed C+D;
independent authorized C+D source work can continue during resource holds.

Accepted ADR0030/0031 law is at `0f376b65` and migration docs at `485f6101`.
On 2026-10-24 the Owner approved ADR0032: “Approve result type corrections;
assess release separately”, ADR0033 F2: “Approve F2: exact two-site legacy
exception”, and ADR0033 B1: “Approve B1: honest browser APIs and caller
migration”. F2 covers only the two existing fakeTransaction assertions;
B2's browser-cast exception and F1's replacement helper were not selected.
Implementation, independent verification and truthful exception disclosure
remain required. ADR0034 is still proposed with supplemental observations
authored but unrun. Archive raw-driver representation findings await the real
cohort: only removal of the invented InvalidDate finiteness restriction where
Date is already allowed and equally strong malformed-object/boolean test
coverage are authorized; numeric infinity, fixed metadata aliases and generic
result typing remain pending. The 4.0.0 fixed-group major recommendation for
accepted pool/marker type breaks is an assessment, not a release decision.
Whole SM-09/SM-11 completion is not claimed. Refresh volatile evidence before
executing the linked plan. S10 authorizes no new publication.

R1's original reference gap is resolved and its managed-worktree trace proof
passed; TASK-0002 completed, while TASK-0001's escalated disposition and canonical
round closure remain pending. R2's 1.5.0 framework delivery is published despite
its active administrative marker. R3's narrative and current CLI state disagree.
Legacy queued backlog entries are preserved evidence, not an instruction to
repeat completed TASK-0003/0004 fixes. No runtime record is manually closed by
this reconciliation. Issues #317–320 retain their separate downstream evidence
requirements.

## S8 retry-02 and sensor repair — 2026-10-24

The unchanged `5f4f456d` exclusive full retry failed the same negative compiler fixture at 13:09:40.801Z: 84,059ms against 60,000ms; data had 183 passes and one failure. Five preceding gate passes were admitted from cache. SIGTERM cancellation was requested at 13:10:16.477Z, exit 143 was observed, and clean process/port/resource release was confirmed at 13:10:31.164Z. This attempt produced no successful signed receipt. The repeat failure contradicts an external-overlap-only explanation; integrated resource amplification remains a hypothesis, not an established cause.

Inspector's fresh-program full/preemit-fixture controls retained exact options, roots, input hashes, source manifest and normalized selected diagnostic span/code/message. Positive no-hole and actual production `never[]`→`unknown[]` overlays killed the unchanged predicate. Two holes still produced one2345; the unrelated-error control explicitly distinguishes fixture enumeration from the separate full-workspace typecheck gate. The bounded repair resolves the exact fixture SourceFile and calls `ts.getPreEmitDiagnostics(program, fixtureSource)`, retaining the actual complete Program, production import/configuration, both original assertions, 60-second timeout and full typecheck requirement. Architect reviewed this as implementation of the same asserted sensor, not a weaker typecheck gate.

The repaired typed-query file passed12/12 (compiler case1,134ms), and the unchanged data unit package population passed184/184 across19files (compiler case731ms). Evidence is under the private consolidation inspector directories `compiler-fixture-diagnostic/preemit-controls-02` and `s8-compiler-fixture-repair`. Inspector test checkpoint `0a8ac04ef09cec0e5db68c448a600a49a482b1ab` and Architect trace checkpoint `f85c9b8c89b4d22cce2626e749c92ce98673a8ab` are committed. Final clean S8 candidate is `f85c9b8c89b4d22cce2626e749c92ce98673a8ab`, tree `86eb7cad23a68162e07e30b0d46e3f8f6fbc6d74`. Normal hooks passed; official trace check passes711/711 with the same41 assertion texts/count and invariant links. Only the exact projection digest, trace version/timestamp and provenance changed in the Architect commit. No subsequent full RC, successful signed receipt, push or merge is claimed; the coordinator must verify and dispatch the next exact-candidate run. Public API declarations are unchanged by this test-only repair and do not require a new baseline merely for the sensor edit.

## Historical S8 scheduling checkpoint — 2026-10-24

The current clean S8 candidate is `e080f032384b57849f810c2e537e970ed3d5f3a4`,
tree `2efdaa3f280b16d759ccbb01cd76d78e90ad2303`. This supersedes the earlier
operative `f85c9b8c` candidate, whose retry-03 failed the SDK codegen case at
56.476s against 30s while data passed 184/184 (compiler 19.502s); cleanup was
confirmed at 13:28:05Z with no signed receipt.

The Owner-approved ADR0035 scheduling amendment is committed through separate
Engineer, Inspector and Architect checkpoints with normal hooks. Trace passes
712/712; the final budget cohort passes 24/24 and isolated unchanged SDK 77/77.
The original 157-pass/one-preparation-failure cohort remains preserved; after
frozen hydration of fifteen missing artifacts, its unchanged Preferences fixture
passed in 81.99s. Actual runner/verifier task keys match for all 15 tasks under
identical admitted controls. Those are focused results, not a full RC.

DETRAN released the shared window; Inspector is dispatched for admitted preflight
and exact-candidate root unit testing, followed by signed RC if units pass. Full
unit/RC success, receipt, push and merge remain unclaimed. The detailed current
checkpoint and preservation obligations are in the consolidated execution
reconciliation linked above. ADR0032/F2/B1/0035 are accepted; ADR0034, archive
supplemental public types, release-line selection and publication remain separate.
Historical round retirement and downstream issues #317–320 remain open obligations.

## Historical S8 lifecycle checkpoint and RC handoff — 2026-10-24

Current clean S8 candidate is **`5df98b81e18292de36800be3e4299bf0f8fc9c2f`**,
product tree **`f10455eeae0df2bd0210c99a2b34885bcaa348e1`**. Inspector checkpoints
`70c1ff0070dc172961c391c6ea55c67bd5eaa9d9` and
`1b3bc5bbabb2cd1c110c77938bbec479071f4bee` implement the ADR0036 applicability
repair and its lifecycle correction. The full release-policy cohort passes
**137/137**, zero skipped/cancelled, in 36.17s. Architect `5df98b81` records the
clarification and exact trace binding: **712/712**, trace version 1.3.44, only the
policy test projection changes from 479 to 566. Normal role hooks passed; other
trace entries, invariant links and thresholds remain unchanged.

The strict campaign helper remains byte-identical. Live development observation
retains all actual 47 manifests, uniform source versions, roster/fixed group,
ranges/template, prerelease absence, policy identities and complete actual
pending-plan bytes. It no longer permanently requires an S8 changeset filename,
a patch-only plan, or source equality with a prospective registry target.
Historical S8 security bytes are bound in
`test/fixtures/release-policy/s8-security-patch.md`, SHA-256
`8dc47832c71444e0e61a443b752bc99649d4fdb3ff1d7678afe8faf66baf6df0`, copied
from the unchanged S8 security changeset and committed by Inspector `1b3bc5bb`.
Actual ordinary verifier execution and the exact production verifier/module
closure in an owned pending fixture prove the purpose distinction; the registry
fixture has an explicit no-network guard. Strict VERSIONED/publication refusal
controls remain. These fixture results are not publication evidence.

The `e6684b48` documentation-route correction is preserved. Actual pending
security changeset, package versions, lock and production release/publication
guards are unchanged by the observer repair. Preserve the failed `e080f032`
documentation prerequisite and `e6684b48` root result (96/97 tasks;
4,860 Vitest passes; Node 2,473/2,475). The unchanged Preferences 86.245s pass
after exact `/private/tmp` child-store preparation is separate recovery evidence,
not a retroactive full-root pass; outer macOS and Turbo child temporary stores
remain separate preflight obligations.

Inspector is starting final parity/preflight and normal fresh exact-candidate
signed RC. Its required `test:unit` node executes the full unchanged root
`pnpm test`; this supplies the required full-root observation inside the normal
workflow, without a redundant standalone run first. No node, assertion,
timeout, cache rule or admitted environment control is skipped or overridden.
A successful full root, signed receipt, push or merge is still **pending**.
All other checks/hooks/builds/indexing remain held during that exclusive window.

S8 → S7 → A+B → checkpointed C+D remains the integration order. Preserve ADR0035
caps/selectors and the original historical unit-budget fixture with only explicit
reviewed integration deltas. ADR0036 is an Architect clarification under existing
verification authorization, not a new Owner approval. Original O1–O10 and all
accepted scopes remain intact; ADR0034, supplemental archive public types,
release-line selection, publication, canonical round/backlog retirement and
DETRAN issues #317–320 remain separate.

## Current integration update — 2026-10-24

Current S10 slice assignment follows the measured §9.6 of the approval-bearing external S10 plan, superseding its earlier §5 grouping: **C2 is offline-sync alone**; **C3 is the other platform/runtime packages** (backend, signature, outbox, auth, flow, worklist, audit, i18n, preferences, privacy, jobs, notifications, ratelimit, pdf, pdf-a, pdf-a-vera-docker, feature-flags, mobile-runtime and integration-adapter); **C4 is tooling, browser and reference/domain** (cli, testing, migration-linter, packages-web/_, reference/api and domain/_/api). C1 retains data/core/contracts/tenancy/logging/health/sessions/idempotency/storage; D retains enforcement/switch deletion. These are execution slices within the approved combined C+D landing, not new scope or separate acceptance claims.

S8 PR417 is integrated at `d47a57a7e9770aa18ca59ec42d5cdedd43105b93`, with exact qualified C tree `dd98256af15c34a37ed8d0efcfdfef1394a8ab77`. Retry06 verified all 15 nodes/3 artifacts, using14 normally admitted PASS results and fresh release preparation; all46 coverage commands passed. The ordinary generated main verifier40112057006 succeeded. Earlier failed attempts, including unexplained retry05 Auth failure, remain failed evidence. This integration does not publish the pending dependency changeset or a new STYNX version.

The exact landed fixture authorization is a separate follow-up: Architect `d1eca9e4f7b2a6338a853a7f1739ab44478d4387`, PR419, with coordinator-verified signed RC (receipt `d87412f3c763c6530fc6dd12bbdd599852c16ec539ce140d9069461569babd73`), policy `061411af4db912825ee0d6bd8a67f796823ed3ff67096793dfe17f988cf137a5`, all 15 nodes and 3 artifacts under protected-main controls. Ordinary evidence publication completed; verifier40114040337/check120931600113 passed the exact candidate/tree. PR419 merged through the normal protected path at `1d247859c2da9054ccf3652831ca1801a729be7d` on 2026-10-24 at 17:03:34Z. The coordinator verified the exact candidate tree `78f5ef0f10a4cccea579b1bd972a444af2b33c4b` and full patch SHA256 `0905f1ef4f3530f708ce035773893abadccf420f6bb7ee59732743acb8b04e4e`. PR419 post-landing strict full-range verification from original `10514fea` through `1d247859` passed (exit 0, no findings, 257 receipts, exact landed `45ba7d6a` authorization applied). Ordinary main workflow `40114391380` and `verified-local-rc` check `120932633441` passed the exact landed tree `78f5ef0f10a4cccea579b1bd972a444af2b33c4b`, bound to qualified source `d1eca9e4`. Evidence: `inspector/s8-landed-full-range/receipt-landed/{custody.json,stdout.json,main-run.json,main-checks.json}` in the preserved consolidation evidence directory. It preserves every prior receipt and grants no actual deletion permission. S7 is now rebased onto PR419 at `6dc58c30b95a50795ce8038f89d718ca1c343a0e`, tree `5ffc5ba41e07ea59a06ef36493901565412f608a`. Focused checks 9/9, ordinary-budget 24/24, full-range forbidden-action check and 15/15 runner/verifier parity passed. Its signed RC completed at 2026-10-24T17:42:01.668Z and was independently verified by the coordinator: receipt `d9b2513dfc073757a12af771dae69181668ee7bcdb2d3de8cfb9041fe34175d0`, policy `d1bbaee3924073496c8c8778303b5c53382102a76a5182b4536bedfcb8fb32fa`, all 15 nodes and 3 artifacts, with 46/46 coverage populations at commandStatus0. Cleanup at17:43:14Z found no owned processes, listeners or new containers; the heavy window is released. PR418 completed normal protected integration at `aa2c11305034918ba253d57ba66e0438f9ff1e78`. The coordinator verified all six source/landed full patches, trees and authorships; Inspector strict original10514fea..aa2c1130 passed with no findings and all 257 receipts retained. Ordinary main workflow `40118373126` and check `120944433570` succeeded. S7 product integration is complete; no new receipt was required. Historical round closure and the local linear-history adapter gap remain separate. A+B and role-checkpointed C+D follow; their original approvals, current source work and pending baselines remain preserved.

The main observation40112057058 completed at exact S8 landing with immutable artifact/provenance custody, `readiness_promoting:false`, and scorecard UNKNOWN (43 UNKNOWN/2N/A). Its successful workflow does not mean a green scorecard. The selected local HMAC post-merge adapter's two-parent requirement remains incompatible with the protected one-parent rebase landing; no adapter switch or false receipt is authorized. Canonical round closure is separate.

Legacy backlog reconciliation is locally committed as `0c431d6f11f6d76753dce8d3914aea1ab95e68f7`: original five rows retained, three completed entries appended for delivered TASK-0002/0003/0004. It has no push/PR at this snapshot; TASK-0001 remains escalated. R1's resolved RGR, R2's historical44-package publication and R3's narrative/authorization remain preserved. The [consolidated closure packet](../../meta/ops/stynx-execution-reconciliation-2026-10-23.md#bounded-historical-closure-packet) identifies exact supported transitions and remaining decision-reference and historical evidence/disposition gaps. Generated-index installation is supported: render into `.devai/state/render/rounds.md`, preserve its digest, copy exact bytes into the committed derived index, and run `evidence render --kind rounds --check`; no additional approval is required. Current Architect DII-1 records R2's delivery/waiver disposition without closing or sealing it.

Accepted ADR0032 result corrections and ADR0033 F2/B1 retain their exact limits; ADR0034 is accepted with “Approve the three bounded result corrections”; implementation remains source-authored with focused checks; final generation and qualification are pending. Supplemental archive public types, release-line classification and package publication remain unresolved. The published baseline is still STYNX3.0.0/all 47 packages; historical38/44 counts are retained. Neither framework integration nor administrative reconciliation closes DETRAN issues317–320 or whole SM-09/SM-11/formal DEVAI acceptance.

The untracked `.changeset/s10-checked-query-execution.md` declares all 47 packages minor provisionally; it is not an approved 3.1 plan. Existing approval reserved release classification, and the 4.0 recommendation remains a proposal. See the consolidated approval/execution ledger for accepted decisions versus authored and still-unverified populations.

Issues #317–320 are DETRAN-only acceptance obligations. Their latest comments document STYNX 1.6.1 delivery (44 historical packages), superseding stale 1.6.0 body headings; #319 closes last. Do not retarget the consumer pin or infer current consumer acceptance. PORM PF06 is a separate unresolved R3 criterion, not part of these four issues.

The retained pre-rebase forecast is `/tmp/stynx-ab-integration-forecast-6dc58c30/forecast.txt`: four conflicting files (ADR index1, trace6, descriptor1 and local contract tests3), without production overlap with S7. Actual role-separated replay onto landed S7 preserved all ten original commits at `38a3c136`; the coordinator audit passed. Engineer `95bd605c` binds the active3.0 descriptor, Inspector `26beddf4` preserves the historical budget fixture and adds exactly the three approved selector omission controls (budget27/27, local-RC12/12; scopebinding65/65). Architect `ac7ae1c54e647e2717b6cb5f040df410c9c7c4a6` binds only budget24→27, retaining all715 trace entries; official trace 715/715 passed. A+B is qualified, merged and delivered after strict landed-range and ordinary main verification passed. The later official baseline checkpoint 677b7770 resolved exactly those two ESLint source hashes with 47 export maps/2224 projections and all emitted declarations preserved; full RC and exact auxiliary verification are complete as recorded in the operative update; protected integration and the required landed checks are complete.
