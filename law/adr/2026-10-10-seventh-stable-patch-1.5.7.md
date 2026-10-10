---
adr_id: ADR-DEVAI-ADOPTION-0018
title: Release the migration-bearing fixed group as stable patch 1.5.7
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [stynx, release, versioning, detran, scorecard]
---

# ADR-DEVAI-ADOPTION-0018 — Seventh stable patch 1.5.7

**Status:** Accepted.

**Authority:** Architect, recording the Owner's 2026-10-10 decision to keep
the 1.5.6 / 1.5.7 split and subsequent direction to proceed until complete
1.5.7 final publication. That direction supersedes the earlier publication
holds; exact candidate receipts and the ordinary release controls remain
required. This ADR records that existing authority and supplies no broader
registry-remediation or repository-settings authority.

**Supersedes:** the candidate target and anomaly-policy binding of
ADR-DEVAI-ADOPTION-0016, whose stable 1.5.6 publication is verified. Its
published candidate, historical evidence and observation obligations remain
intact. ADR-DEVAI-ADOPTION-0017's DEVAI 2.3.2 adoption stays bound.

## Verified entry

The independently verified published 1.5.6 base is main
`6dabf052b2948fe0c2688cdb23c9d390c16af5ed`, tree
`9102e545c8c09b2ea4cf694cef1abea221a686e9`. Publication run `38028077567`
completed successfully. The preceding
15-node local RC, protected checks, exact-main k6 run `38026318436`, and
verified observation chain establish the reported preparation checkpoint,
separately from the registry publication verification below.

- **Verified publication:** annotated `v1.5.6` tag object
  `ed3dbc41d0b3a89b18f8f642efc5ddd77597a0df` peels to that exact main SHA;
  [the unified release](https://github.com/stynx-nyx/stynx/releases/tag/v1.5.6)
  is published. The external publication-receipt report verifies 44 receipts,
  44 exact-candidate package tags and 44 published package releases.
- **Verified authenticated registry state:** all 44 discovered fixed-group
  packages have version/latest 1.5.6, with exact publication-plan integrities;
  every `rc` remains 1.5.0-rc.2. Evidence reports are
  `/private/tmp/stynx-156-published-registry-verification.json` and
  `/private/tmp/stynx-156-published-receipt-verification.json`. These paths
  identify this session's external evidence, not durable repository receipts.
  A fresh authenticated census at `2026-10-10T05:58:39.542Z` verifies all
  44 latest tags at 1.5.6, rc unchanged, 1.5.7 absent for every package,
  matching published 1.5.6 integrities and the unchanged angular-profile
  2.0.0 integrity. Its external report
  `/private/tmp/stynx-157-prepolicy-census.json` has SHA-256
  `9d35cc4c4a8719a5773ed72b8c3fff2b9072990567317de00889f39716fb2822`.
- **Verified integration checkpoint:** the prepared feature branch is
  `bae596d1e16bc065f7a11ef63a727da09704ed9a`, tree
  `713c06e9b56e2e69bdf0b3c798218af8bd3f6c78`. Its 11 feature commits are
  patch-identical to the prepared range through
  `a7db96cd64632ac01fe32f3bbe41d402fc927c1b`, replayed onto observation
  commit `c8791d05100191f882b62a631d575a94f275dd8c` and its exact Owner
  receipt commit `9a2d37310605dc6e3d688fdfaf74540912bf692b`. Earlier
  prepared-branch gates supply no final-base RC.

The measured 1.5.6 observation `SC-20261010T050509-001` is RED and
non-promoting (`readiness_promoting=false`), bound to the published
SHA above. The Auditor verified all 45 cells: 24 PASS, 4 FAIL, 9 REVIEW,
6 UNKNOWN and 2 N/A; evidence `EV-1cb333b904ec12a1` is in the 75-record
chain with its 64-record historical prefix preserved. RED is disclosed as
the actual scorecard result, never converted to a passing product gate.
Ordinary hard gates retain their own results.

## Decision

1. Prepare exactly stable patch 1.5.7 from the verified published 1.5.6
   base above. Carry the verb-produced 1.5.6 observation and its authority
   receipts as evidence ancestors before the 1.5.7 marker. Preserve every
   previous observation and the proof-chain prefix. Replay only the
   prepared 1.5.7-specific commits, with their real role authorship, onto
   that base; do not replay the old 1.5.6 ancestry.
2. Consume exactly these two changesets in one Engineer marker commit,
   `chore(repo): version fixed group to 1.5.7`:
   - `.changeset/outbox-configurable-app-role.md`: data/outbox patch,
     UPS-OBX-10 under ADR-OUTBOX-0003 D1.
   - `.changeset/offline-sync-1-5-7-pending-review-context.md`:
     offline-sync/SDK patch, UPS-OFS-06/07/08 under
     ADR-MOBILE-OFFLINE-0003 D1–D3.
     The fixed group advances all 44 publishable packages together. Root
     DEVAI tooling and release governance add no extra changeset.
3. Preserve the accepted contracts: one validated application SQL role;
   fail-closed privilege, session identity and outbox ownership checks;
   tenant isolation and FORCE RLS; pending retry preconditions and replay
   identity; append-only conflict-action history; current `allowedActions`
   evaluated on every resolver call; versioned opaque consumer attributes;
   legacy platform-context absence when no value was produced. Keep the
   two-store and real PostgreSQL regressions, including restricted
   application fixtures. Do not weaken specifications or tests.

   For the helper-owned reference-web E2E stack only, this decision supersedes
   D22 of `2026-08-24-stynx-1.1.1-campaign-controls.md` where it freezes the
   application database URL to the shared privileged PostgreSQL identity and
   excludes the role provisioning required by ADR-OUTBOX-0003 D1.7. After
   owned Compose startup succeeds and before spawning the reference-api
   child, `reference/web/scripts/serve-reference-api-stack.mjs` may execute
   one confined SQL provisioning step through that exact owned Compose file
   and its `postgres` service. It establishes `stynx_app` as a direct test
   login with `NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`, using a fixed
   fixture password, without owner membership or ownership. Only
   `STYNX_APP_DATABASE_URL` receives that restricted login; a privileged
   session assuming the role is not a substitute. Provisioning failure
   refuses child startup and enters the existing confined cleanup path.

   Every other D22 guarantee stays in force: atomic dynamic host-port
   publication, exact owned mapping discovery and validation, endpoint
   propagation to all three URLs, no inherited-port fallback, unchanged
   owner/reader URL identities, PostgreSQL service and healthcheck, Redis
   behavior, startup protocol, output suppression, timeouts, watchdog and
   exactly-once confined cleanup. No broader Docker discovery, protected
   resource mutation, retry or credential output is permitted. The Inspector
   replaces only the obsolete shared-identity oracle with assertions for
   the restricted app login and provisioning failure confinement, retaining
   every endpoint, inherited-port, output and cleanup assertion. Engineer
   scope is the helper; Inspector scope is its existing blocker contract.
   This harness conformance correction changes no published package,
   dependency, workflow or changeset and lands before the version marker.

4. Ship only the forward migrations already reviewed:
   `packages/data/migrations/platform/0025_outbox_attempt_guard_role_independent.sql`
   and
   `packages/offline-sync/migrations/0004_pending_state_and_conflict_actions.sql`.
   Preserve historical migrations. Consumers apply offline migration 0004
   after 0003 before resolver use; missing upgrade yields the documented
   `OFFLINE_SYNC_UPGRADE_REQUIRED` refusal. The additive `pending` state and
   changed retry behavior are declared compatibility notes. This decision
   grants no production database operation. `DROP CONSTRAINT` alone is not
   the canonical `FORBID-DROP-PROD` action; do not fabricate that receipt.
5. Rebind the existing anomaly-policy schema to only candidate 1.5.7 and
   authenticated preflight `latest=1.5.6`, retaining `rc=1.5.0-rc.2`.
   Bind `owner_decision.repository_baseline` and `repository_tree` to the
   verified published 1.5.6 identities, and record this superseding decision.
   Preserve anomaly ID `REGISTRY-VERSION-ANOMALY-0001`, package/version
   `@stynx-nyx/angular-profile@2.0.0`, version ID `1024692931`, original
   integrity/digest/timestamp, one-candidate/one-package limits and the
   sole `registry-monotonicity-exception` effect. Closure requires all
   44 latest tags at 1.5.7, rc unchanged and the anomalous artifact immutable.
   Deletion, deprecation and any other remediation still require the
   separately named new Owner authorization in the existing policy.
6. Bind the policy digest in the Engineer verifier and preserve all
   historical classifiers. The exact seventh classifier consumes only the
   two changesets above from parent version 1.5.6; post-marker changes stay
   within its existing enumerated policy/test/trace follow-up paths. All
   product, migrations, API baselines, contracts and this ADR land before
   the marker. Inspector rebinds executable tests; Architect rebinds trace.
7. Run required gates and trusted signed local RC on one clean candidate.
   After rebase merge, bind any rewritten observation commit to an exact
   Owner `FORBID-MUTATE-INVARIANTS` receipt in an append-only receipt PR,
   preserving its source receipt. Verify authority over the full interval
   since the previous successful unified release. Identical-tree protected
   evidence may be verified automatically on the rewritten main SHA under
   the existing exact-tree policy; dispatch verification remains exact-commit.
8. Before package publication, bind a concrete action-specific receipt to
   the final main SHA/tree, this Owner mandate, the 44-package roster and
   `release.yml` dispatch with `publish:true`. Recheck exact origin/main,
   protected checks, exact-main k6, registry census and protected publication
   prerequisites. Use latest only. Stop at the first failed, partial or
   ambiguous publication; recovery requires fresh Owner authorization.
9. At the exact final published SHA, follow ADR-DEVAI-ADOPTION-0014's
   protocol: Inspector inventory regeneration, sweep first pass and second
   pass, then independent authorized Auditor observation. Keep HEAD fixed
   through observation. Cite the actual scorecard ID/results in release
   notes. After successful publication commit all generated readings,
   produced inventory bodies, appended proof chain and the five-file exact-SHA
   observation bundle, with no hand-edited machine state. Record source and,
   after any rebase merge, landed exact-SHA MUTATE receipts as needed.

## Consequences

This is the migration-bearing follow-on patch, not a folding of the two
release slices. Version generation does not publish. Any extra changeset,
post-marker product change or changed exact-base assumption invalidates
the classifier and requires a new governed decision.

The pinned DEVAI 2.3.2 `type_check` sensor declaration still uses the
unsupported `["pnpm", "typecheck"]` argv, while the broker admits exactly
`["pnpm", "-r", "typecheck"]`. No registered sensor-input producer exists
under the current binding contract. Leave `.devai/config` intact; disclose
that measurement gap and all remaining UNKNOWN/REVIEW/FAIL cells. Do not
claim a repaired measurement or improved scorecard without verb-produced
evidence. Ordinary repository typecheck remains an independent hard gate.

The 1.5.6 measurement also records concrete tooling limits: 38 attempted
reading records were refused because their historical IDs conflicted;
inventory regeneration was refused by the absolute-checkout body guard;
`type_check` and `perf_test` produced no reading because of the host-adapter
requirement. Preserve the actual records and diagnostics. Do not fabricate
replacement IDs, inventory bodies, passing results or absent measurements.

Final delivery includes verified registry artifacts, tags/releases,
publication receipts, honest scorecard disclosure and committed observation
history. No observation promotes readiness or substitutes for a hard gate.
