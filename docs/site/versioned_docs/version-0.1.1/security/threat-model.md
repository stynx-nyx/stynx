# stynx threat model

**Authority:** Architect (Constitution Article 6).
**Scope:** stynx framework (`packages/*`, `packages-web/*`) + reference applications (`reference/api`, `reference/web`) + scaffolded domain modules (`domain/*`).
**Out of scope:** Adopter-built applications on top of stynx. Adopters specialize this document for their threat surface.

This document enumerates the threats stynx's defensive surface area must address. Each threat names the mitigating mechanism, the invariant or test that gates it, and the residual risk that adopters must accept or further mitigate.

## Trust boundaries

stynx assumes the following actors with distinct authority:

| Actor                           | Authority                                                                                       | Trust                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Anonymous client**            | Pre-auth HTTP request to public endpoints (`@Public()`) only                                    | None                                                                |
| **Authenticated tenant member** | Bearer token (Cognito JWT in production; dev-login in reference deployments)                    | Scoped to their `tenant_id` + permission set                        |
| **Tenant admin**                | Same as member + admin-permission set                                                           | Scoped to their tenant                                              |
| **Platform admin**              | Cross-tenant role; bypass-capable                                                               | High; gated by `@Permission('platform:*')` decorators               |
| **System context**              | Internal scheduled tasks, migration runner                                                      | High; documented via `RequestContextMutator.runWithSystemContext()` |
| **Database (Postgres)**         | Three roles: `stynx_owner` (DDL), `stynx_app` (RW + RLS-bound), `stynx_reader` (RO + RLS-bound) | Defense in depth via least-privilege                                |

## Threats and mitigations

### T-1 — Cross-tenant data leak

**Threat:** A request from tenant A reads or writes rows belonging to tenant B.

**Mitigations:**

- Every tenant-owned table has `tenant_id uuid NOT NULL` + an RLS policy keyed on `current_setting('app.tenant_id')`.
- `RequestContextInterceptor` extracts `tenantId` from the verified Cognito JWT and binds it via `set_config('app.tenant_id', $1, true)` per-transaction.
- App connects as `stynx_app` (RLS-bound, no BYPASSRLS).

**Invariants:** `INV-RBAC-001`, `INV-FLOW-001`, `INV-PRIVACY-001`.
**Tests:** `reference/api/test/integration/reference-api.runtime.spec.ts` exercises `expectRLSIsolated` across tenant A/B fixtures.
**Residual risk:** Migration runner connects as `stynx_owner` (BYPASSRLS). Migrations that touch tenant data must be hand-reviewed for accidental cross-tenant updates.

### T-2 — Privilege escalation via missing permission guard

**Threat:** An authenticated tenant member calls an endpoint that should require admin privileges but doesn't carry `@Permission()` enforcement.

**Mitigations:**

- `INV-RBAC-001` gates: every HTTP endpoint must be either role-bound (via `@UseGuards(StynxAuthGuard, PermissionGuard) + @Permission('...')`) or explicitly `@Public()` or in the allow-list.
- `sense-api` + `sense-rbac` produce the binding inventory; CI gate runs both on every PR.
- `INV-RBAC-001-allowlist.json` carries the explicit allow-list of bootstrap/dev-only paths.

**Invariants:** `INV-RBAC-001`.
**Tests:** `packages/auth/test/unit/stynx-auth.guard.spec.ts`, `packages/auth/test/unit/permission-query.service.spec.ts`.
**Residual risk:** New endpoints added without guards fail the CI gate; in-flight PRs may have a window of vulnerability if the gate is bypassed.

### T-3 — Authentication bypass (token forgery, replay)

**Threat:** Attacker obtains a session token or forges a JWT.

**Mitigations:**

- Production: Cognito User Pool with rotating JWKS; `@stynx-nyx/auth`'s `CognitoTokenVerifier` validates `iss`, `aud`, `exp`, `jwks_uri` per request.
- Dev: `/_reference/dev-login` endpoint is `@Public()` BUT only exists in non-production reference-app builds (`SampleModule` omits `ReferenceDevAuthController` and `ReferenceDevAuthService` when `NODE_ENV` or `STYNX_ENVIRONMENT` is `production`/`prod`).
- Idempotency keys reduce replay damage for state-mutating endpoints.

**Invariants:** `INV-RBAC-001` (covers `@Public()` discipline).
**Tests:** `packages/auth/test/unit/cognito-token-verifier.spec.ts`.
**Residual risk:** Production deployments must not override both environment markers to non-production values. The reference API test suite asserts the module assembly omits dev-login under production configuration.

### T-4 — PII exposure via insufficient erasure on request

**Threat:** LGPD/GDPR erasure request fails to remove all PII for a subject because a column is not registered in `core.pii_map`.

**Mitigations:**

- `INV-PRIVACY-001` gates: every column with `pii_class` set must have `legal_basis` + `retention` registered in `core.pii_map`.
- `sense-data-handling` (post-Phase 22.B + 23.F) extracts the pii_map join from migrations and verifies coverage.
- `@stynx-nyx/privacy` reads from `core.pii_map` at erasure time and dispatches the correct `strategy` (nullify / hash_with_salt / hard_delete).

**Invariants:** `INV-PRIVACY-001`.
**Tests:** `packages/data/test/integration/migrations.spec.ts` (verifies pii_map schema), `domain/demo-bookmark/api/test/bookmark.service.spec.ts` (verifies the demo column registration).
**Residual risk:** Adopters whose domain migrations forget the `INSERT INTO core.pii_map` block ship un-erasable PII. Mitigation: Phase 22.C + Phase 23.F's sensors catch this; Phase 24.B verified it works against multi-row + ON CONFLICT shapes.

### T-5 — Audit chain tampering

**Threat:** Mutated audit records covering up unauthorized access.

**Mitigations:**

- `@stynx-nyx/audit` uses hash-chained audit records; each row carries the previous row's hash.
- `evidence-verify` re-validates the chain integrity on demand.
- `audit.events` table has no UPDATE/DELETE grants for `stynx_app` (insert-only).

**Invariants:** Future `INV-AUDIT-001` candidate (not yet promoted; behaviour is enforced by code structure + table grants).
**Tests:** `packages/audit/test/hash-chain.spec.ts`.
**Residual risk:** A database superuser can tamper at the storage layer; out of scope (assumes Postgres operator is trusted).

### T-6 — Supply-chain compromise via unpinned CI actions

**Threat:** A malicious upstream of `actions/checkout@v4` (or similar) pushes a new release that exfiltrates secrets from CI runs.

**Mitigations:**

- `sense-harness-security` flags every `uses: ...@vX` reference that isn't a SHA-pinned 40-hex.
- Workflows have least-privilege `permissions:` blocks declared explicitly.
- No `pull_request_target` + `actions/checkout` combination (known CVE pattern).

**Invariants:** Future `INV-SUPPLY-001` candidate.
**Tests:** `sense-harness-security` runs on every PR via `devai-gates.yml`.
**Residual risk:** Currently REVIEW per scorecard — actions/checkout, setup-node, pnpm/action-setup, upload-artifact are pinned to version tags, not SHAs. Hardening tracked separately.

### T-7 — Dependency vulnerability exposure

**Threat:** A transitive dependency ships a CVE that affects stynx's runtime surface.

**Mitigations:**

- `pnpm audit` runs in CI (after Phase 30 ships `sense-security-scan`).
- Critical-severity vulnerabilities block the release-readiness gate.
- npm-security-upgrade-auditor (legacy stynx tooling at `tools/npm-security-upgrade-auditor`) provides advisory upgrade guidance.

**Invariants:** Future `INV-SECURITY-001` candidate (post-Phase-30 sensor enablement).
**Tests:** `pnpm audit --json` parsed by `sense-security-scan`.
**Residual risk:** Zero-day vulnerabilities before public disclosure are not detected.

### T-8 — Denial-of-service via expensive endpoints

**Threat:** Authenticated tenant member triggers a query that consumes disproportionate database or memory resources.

**Mitigations:**

- `@stynx-nyx/ratelimit` enforces per-tenant + per-actor rate limits.
- `@stynx-nyx/sessions` caps concurrent session count.
- Long-running queries are subject to per-task DB statement timeouts (configured in `@stynx-nyx/data`).

**Invariants:** Future `INV-PERF-001` candidate (post-perf-targets work).
**Tests:** `packages/rate-limit/test/rate-limit.guard.spec.ts`, `_probes/ratelimit` endpoint runtime smoke.
**Residual risk:** Distributed attack across many tenants can still saturate shared resources; needs upstream rate limiting (CDN / WAF) for production deployments.

## Out-of-scope threats

- **Side-channel attacks** (timing, cache, power analysis): not in scope; assume trusted compute environment.
- **Physical access to database storage:** out of scope.
- **Browser-side XSS from untrusted user content:** stynx provides escaping defaults but adopters must specialize for their content surface.

## How this document is maintained

This is the **initial threat model** authored to close F1×T6 (`spec_security_coverage`) in the post-trilogy scorecard refresh (stynx U5+, 2026-05-17). Future iterations should:

1. Add a threat per new attack surface introduced by domain modules (e.g. file upload → injection).
2. Promote any threat's "future INV-\*" candidate to an actual invariant under `docs/arch/invariants/` once the verification mechanism exists.
3. Refresh annually or after any incident response postmortem.

Authority for updates: Architect (this file lives under `docs/security/`, an Architect-substrate path per Constitution Article 6).
