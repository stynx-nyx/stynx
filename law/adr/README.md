# ADRs

Architecture Decision Records capture durable stynx engineering decisions that
shape package boundaries, generated diagnostics, or adoption policy.

## Proposed Decisions

- [ADR-DEVAI-ADOPTION-0040 — Exact root tooling lifecycle SQL admissions](2026-10-24-s10-root-lifecycle-admission-proposal.md) — proposed; eleven existing fixed-script/database lifecycle sites, no approval yet.

- [ADR-DEVAI-ADOPTION-0039 — Honest audit opaque read results and JSON wire projection](2026-10-24-s10-audit-opaque-result-proposal.md) — proposed; observed scalar/array result compatibility and official wire propagation, no approval yet.

## Accepted Decisions

- [ADR-DEVAI-ADOPTION-0034 — Audit wire results and outbox receipt/metadata corrections](2026-10-23-s10-audit-outbox-result-proposal.md) — accepted on 2026-10-24: “Approve the three bounded result corrections”; implementation and final verification remain required.

- [ADR-DEVAI-ADOPTION-0033 — Exact two-site fake Transaction exception and honest browser API migration](2026-10-23-s10-generic-boundary-disposition-proposal.md) — F2 and B1 accepted on 2026-10-24; F1 and B2 not selected.

- [ADR-DEVAI-ADOPTION-0032 — Honest public PostgreSQL result representations](2026-10-23-s10-public-representation-proposal.md) — accepted on 2026-10-24; release disposition remains separate.

- [ADR-DEVAI-ADOPTION-0031 — Generated partial writes and adoption SQL disposition](2026-10-23-s10-generated-sql-disposition-proposal.md)

- [ADR-DEVAI-ADOPTION-0030 — Honest pool lifecycle and symbol-backed table types](2026-10-23-s10-public-type-soundness-proposal.md)

- [ADR-DEVAI-ADOPTION-0029 — Bounded compatibility operations for existing configurable SQL APIs](2026-10-23-s10-configurable-sql-compatibility-proposal.md)

- [ADR-DEVAI-ADOPTION-0028 — Typed-query adoption, strict workspace lint and bounded legacy archive compatibility (S10 SM-09, SM-11)](2026-10-23-s10-typed-query-adoption.md)

- [ADR-DEVAI-ADOPTION-0027 — app.* GUC dialect and deny-by-default boundaries for STYNX itself (S10 SM-05, SM-12)](2026-10-23-s10-app-guc-dialect-and-workspace-boundaries.md)

- [ADR-RELEASE-0006 — STYNX 3.0.0 SM-21 fixed-group release and exact publication scope](2026-10-22-stynx-3.0.0-sm-21-release.md)

- [ADR-RELEASE-0005 — STYNX 1.6.2 audit tranche and exact publication scope](2026-10-13-patch-1.6.2-audit-tranche.md)

- [Supported task-bound scorecard readings and complete individual collection](2026-10-12-supported-scorecard-task-collection.md)

- [STYNX 1.6.1 offline fixes and practical audit recovery](2026-10-12-patch-1.6.1-and-practical-audit.md)
- [ADR-MOBILE-OFFLINE-0005 — Additive acceptance evidence](ADR-MOBILE-OFFLINE-0005-acceptance-evidence.md)

- [Adopt published DEVAI 2.6.0 and refresh the selected-adapter hook](2026-10-11-devai-2.6.0-adoption.md)

- [Prospective local HTTP baseline bootstrap and mandatory comparison](2026-10-11-local-http-baseline-bootstrap.md)

- [Bind explicit client roots and isolate demo bookmark storage](2026-10-11-client-roots-and-demo-bookmark-storage.md)
- [Adopt published DEVAI 2.5.0 and its supported audit interfaces](2026-10-11-devai-2.5.0-adoption.md)

- [Adopt published DEVAI 2.4.0 and project supported sensor inputs](2026-10-10-devai-2.4.0-adoption.md)

- [ADR-PERF-0001 — Complete endpoint latency evidence alongside existing performance gates](2026-10-10-http-performance-evidence.md)
- [ADR-SECURITY-FORK-0001 — Maintained braces and HTTP cache security forks](2026-10-10-maintained-braces-security-fork.md)

- [Complete STYNX 1.6.0 minor campaign with upstream and consumer evidence](2026-10-10-minor-release-1.6.0.md)
- [ADR-OUTBOX-0004 — Terminal delivery retirement and closed consumer storage bindings](ADR-OUTBOX-0004-retirement-and-closed-storage.md) — supersedes only OUTBOX-0003 D5 and specifies D2/D3 deliverables.
- [ADR-MOBILE-OFFLINE-0004 — Durable parity and verified import](ADR-MOBILE-OFFLINE-0004-minor-parity-and-import.md) — resolves the accepted minor-release scope while preserving E6 and historical evidence.

- [Release the migration-bearing fixed group as stable patch 1.5.7](2026-10-10-seventh-stable-patch-1.5.7.md)

- [Adopt DEVAI 2.3.2 and preserve observation history](2026-10-10-devai-2.3.2-adoption.md)
- [Release the fixed group as stable patch 1.5.6](2026-10-09-sixth-stable-patch-1.5.6.md)
- [Release the fixed group as stable patch 1.5.5](2026-10-08-fifth-stable-patch-1.5.5.md)
- [Enable the DEVAI scorecard sensors for STYNX](2026-10-08-devai-scorecard-enablement.md)
- [Adopt DEVAI 2.3.0 through init upgrade](2026-10-08-devai-2.3.0-adoption.md)
- [Keep reference-stack compose builds off bake entitlements](2026-10-08-compose-bake-entitlements.md)
- [Release the fixed group as stable patch 1.5.4](2026-10-06-fourth-stable-patch-1.5.4.md)
- [Release the fixed group as stable patch 1.5.3](2026-10-04-third-stable-patch-1.5.3.md)
- [DEVAI 1.9.0 adoption with constitution 1.0.2](2026-10-04-devai-1.9.0-adoption.md)
- [Time-boxed workspace audit exception for unpatched dev and docs advisories](2026-10-04-workspace-audit-exception.md)
- [main requires no approving review and no code-owner review](2026-09-27-main-review-policy.md)
- [Local RC signer recovery after workstation key loss](2026-09-27-local-rc-signer-recovery.md)
- [verified-local-rc gates pull requests instead of remote product tiers](2026-09-27-verified-local-rc-cutover.md)
- [DEVAI 1.6.0 adoption for RC task-policy parity](2026-09-26-devai-1.6.0-adoption.md)
- [DEVAI 1.5.6 patch adoption](2026-09-26-devai-1.5.6-adoption.md)
- [DEVAI 1.5.0 adoption and external mutation hardening](2026-09-15-devai-1.5.0-adoption.md)
- [Mobile/offline E6 promotion from TEAT](ADR-MOBILE-OFFLINE-0001-teat-promotion.md)
- [ADR-MOBILE-OFFLINE-0002 — Durable offline batch and numbering parity](ADR-MOBILE-OFFLINE-0002-sync-parity.md) — additive CTG9 decision.
- [ADR-MOBILE-OFFLINE-0003 — Pending queue state, open manual review, typed receipt context and consumer-owned offline storage](ADR-MOBILE-OFFLINE-0003-queue-states-and-consumer-storage.md) — amends ADR-MOBILE-OFFLINE-0002 decisions 2, 4 and 5.
- [Canonical 1.x package line and registry anomaly correction](ADR-VERSION-LINE-0001.md)
- [STYNX 1.1.1 campaign control contract](2026-08-24-stynx-1.1.1-campaign-controls.md)
- [CI economy, release authority, and database isolation](2026-08-24-ci-economy.md)
- [ADR-WORKLIST-0001 — Flow and worklist boundary, distribution, and SLA clocks](ADR-WORKLIST-0001-flow-boundary-distribution-sla.md)
- [ADR-JOBS-0001 — Postgres-backed scheduler and worker runtime for `@stynx-nyx/jobs`](ADR-JOBS-0001-postgres-scheduler-worker.md)
- [ADR-JOBS-0002 — Tenant actor execution and local scheduling for jobs 1.5](ADR-JOBS-0002-actor-tenant-local-clock.md) — supersedes ADR-JOBS-0001 handler context and UTC cron decisions.
- [ADR-OUTBOX-0001 — Transactional outbox promoted from pec (E3)](ADR-OUTBOX-0001-transactional-outbox-promotion.md)
- [ADR-OUTBOX-0002 — Append-only event log and per-event delivery](ADR-OUTBOX-0002-event-log-and-delivery.md) — additive CTG9 decision.
- [ADR-OUTBOX-0003 — Configurable application role, consumer-owned outbox storage and named destinations](ADR-OUTBOX-0003-configurable-role-and-consumer-storage.md) — amends ADR-OUTBOX-0002 role-name and platform-only storage decisions.
- [ADR-SIGNATURE-0001 — Verified trust evidence for regulated signatures](ADR-SIGNATURE-0001-trust-evidence.md) — opt-in CTG9 trust gate.
- [ADR-SIGNATURE-0002 — Minimal PAdES-B-LTA verification and trust-profile sets](ADR-SIGNATURE-0002-minimal-lta-and-profile-sets.md) — amends ADR-SIGNATURE-0001 decisions 2, 3 and 4; independent security review required before release.
- [Trusted local RC evidence and mutation execution boundary](2026-08-16-trusted-local-rc-evidence.md)
- [ADR-SESSIONS-0001 — Provider-neutral session inventory and control](ADR-SESSIONS-0001-provider-neutral-session-control.md)
- [ADR-SESSIONS-0002 — Monthly partition maintenance for auth.sessions](ADR-SESSIONS-0002-monthly-partition-maintenance.md)
- [ADR-SESSIONS-0003 — Retain auth.sessions month partitions for 90 days after the month ends](ADR-SESSIONS-0003-partition-retention.md)
- [ADR-PREFERENCES-0001 — Tenant-subject preferences boundary](ADR-PREFERENCES-0001-tenant-subject-preferences.md)
- [ADR-001 — Soft Delete](ADR-001-soft-delete.md)
- [ADR-002 — Permissions Caching](ADR-002-perms-caching.md)
- [ADR-003 — RBAC Matrix Role in a Framework Repository](ADR-003-rbac-matrix-role.md)
- [ADR-FE-CONTRACTS-0001 — Frontend Completeness Contract Pins](ADR-FE-CONTRACTS-0001-frontend-completeness-contract-pins.md)
- [ADR-FE-PACKAGING-0001 — Angular Package Format for packages-web](ADR-FE-PACKAGING-0001-ng-packagr-adoption.md)
- [ADR-FE-ICU-i18n-0002 — Package Catalogs and ICU MessageFormat for packages-web](ADR-FE-ICU-i18n-0002-package-catalogs-and-icu.md)
- [ADR-FE-FLOW-PUBLISH-0003 — Flow Draft and Publish Contract](ADR-FE-FLOW-PUBLISH-0003-draft-publish-contract.md)
- [ADR-FE-AUDIT-CONTRACT-0004 — Frontend Audit Read Contract](ADR-FE-AUDIT-CONTRACT-0004-audit-read-contract.md)
- [ADR-PDF-A-BOUNDARY — PDF/A Boundary](ADR-PDF-A-BOUNDARY.md)
- [ADR-PDF-A-CONFORMANCE — PDF/A-2b Conformance for STYNX PDF Output](ADR-PDF-A-CONFORMANCE.md)
- [ADR-PDF-A-VALIDATOR-CONTRACT — PDF/A Validator Contract](ADR-PDF-A-VALIDATOR-CONTRACT.md)
- [ADR-XMLDSIG-CONTRACT — XMLDSig Contract for `@stynx-nyx/signature`](ADR-XMLDSIG-CONTRACT.md)
- [ADR-HARDENING-0001 — k6 baseline comparison on p95 and p99 with reference floors](2026-09-12-k6-baseline-comparison.md)

## Related RFCs

Some older decisions still live under [the preserved RFC corpus](../../docs/meta/rfcs/) while the repository
continues consolidating its documentation. Treat ADRs as the preferred
place for new architecture decisions.
