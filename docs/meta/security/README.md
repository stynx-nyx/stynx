# Security

**Authority:** Architect (Constitution Article 6).

This directory is the security-specification substrate for stynx. It links the
framework's threat model, security invariants, package responsibilities, and
operator runbooks.

## Canonical Documents

- [Threat Model](threat-model.md) — current architectural threat model.
- [Security release policy](security-release-policy.md) — SBOM, license,
  secret-scanning, provenance, dependency-review, and vulnerability remediation
  lane.
- [Session signing key rotation runbook](key-rotation-runbook.md) — rotation
  triggers, zero-downtime choreography, verification, and rollback for
  `@stynx/sessions` RSA-2048 signing keys.
- [SBOM](sbom.cdx.json) — generated CycloneDX inventory. Refresh with
  `pnpm security:sbom` and verify with `pnpm security:sbom:check`.
- [License policy](license-policy.json) — allow/deny list for direct external
  dependencies.
- [Secret-scan allowlist](secret-scan-allowlist.json) — explicit approved test
  fixture findings for the local secret scanner.
- [Architecture invariants](../../framework/arch/invariants/) — RBAC, privacy,
  package, Flow, coverage, error, and performance invariants.
- [Operations runbooks](../ops/README.md) — rotation, suspension,
  erasure, federation, and recovery procedures.

## Package Responsibilities

- `@stynx/auth` owns authentication, permission guards, Cognito validation, and
  permission-cache behavior.
- `@stynx/sessions` owns refresh-token rotation, JWKS exposure, and session
  revocation primitives.
- `@stynx/tenancy` owns tenant resolution, lifecycle checks, and platform-admin
  access boundaries.
- `@stynx/audit` owns audit-event writing, retention planning, and audit
  evidence queries.
- `@stynx/privacy` owns data-subject export, erasure, PII maps, and ROPA output.
- `@stynx/storage` owns document metadata and object-store access boundaries.
- `infra/cdk` owns reference cloud controls such as ALB/edge WAF, ACM, Route 53
  aliases, RDS isolation, and logging.

Security behavior should be proven by package tests and reference-app
integration tests, not by hand-editing generated diagnostics.

## Release Security Commands

- `pnpm security:sbom`
- `pnpm security:sbom:check`
- `pnpm security:licenses`
- `pnpm security:secrets`
- `pnpm security:release`
