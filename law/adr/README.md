# ADRs

Architecture Decision Records capture durable stynx engineering decisions that
shape package boundaries, generated diagnostics, or adoption policy.

## Accepted Decisions

- [Mobile/offline E6 promotion from TEAT](ADR-MOBILE-OFFLINE-0001-teat-promotion.md)
- [Canonical 1.x package line and registry anomaly correction](ADR-VERSION-LINE-0001.md)
- [CI economy, release authority, and database isolation](2026-08-24-ci-economy.md)
- [ADR-WORKLIST-0001 — Flow and worklist boundary, distribution, and SLA clocks](ADR-WORKLIST-0001-flow-boundary-distribution-sla.md)
- [ADR-JOBS-0001 — Postgres-backed scheduler and worker runtime for `@stynx-nyx/jobs`](ADR-JOBS-0001-postgres-scheduler-worker.md)
- [ADR-OUTBOX-0001 — Transactional outbox promoted from pec (E3)](ADR-OUTBOX-0001-transactional-outbox-promotion.md)
- [Trusted local RC evidence and mutation execution boundary](2026-08-16-trusted-local-rc-evidence.md)
- [ADR-SESSIONS-0001 — Provider-neutral session inventory and control](ADR-SESSIONS-0001-provider-neutral-session-control.md)
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

## Related RFCs

Some older decisions still live under [the preserved RFC corpus](../../docs/meta/rfcs/) while the repository
continues consolidating its documentation. Treat ADRs as the preferred
place for new architecture decisions.
