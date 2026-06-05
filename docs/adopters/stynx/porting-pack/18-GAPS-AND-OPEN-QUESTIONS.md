# 18 — Gaps and Open Questions

Honesty document. Every `[GAP]` marker, `[NOT YET IMPLEMENTED]` flag,
and unresolved spec/code disagreement found during pack generation
lands here. This protects the consuming agent from being misled by
the rest of the pack.

## Severity scale

- **BLOCKER** — do not begin the affected phase of the port until
  resolved upstream.
- **MAJOR** — port may proceed but the affected surface needs a
  workaround or a follow-up.
- **MINOR** — cosmetic; document and move on.
- **NIT** — noted; no action.

## Things in the spec but not in code (or partially implemented)

### G-001 — Migration linter test failing on repo's own migrations

**Severity:** MAJOR (rederived from audit FIND-004; verify before
treating linter as a hard gate).

The migration linter (`tools/migration-linter`) is the spec's
enforcement mechanism for I5/I6/I8. The audit baseline noted its
self-test failing on 4 parser errors against the repo's own
migrations. **Re-verify** by running
`pnpm --filter @stynx/migration-linter test` before treating the
linter as a hard gate in your port. If it's still failing, hand-
validate migrations against the LINT001–LINT009 rules listed in
[`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md).

### G-002 — `@stynx/privacy` may import `@aws-sdk/client-s3` directly

**Severity:** MAJOR (rederived from audit FIND-010).

Spec invariant I3 says all object operations go through
`@stynx/storage`. Audit baseline found `@stynx/privacy` violating
this. **Re-verify** with `rg '@aws-sdk/client-s3' packages/privacy/src`.
If still live, document as a known exception (or wait for ADR-003).

### G-003 — `pnpm doctor` empty output

**Severity:** MAJOR (audit FIND-011).

The `stynx doctor` command is the canonical I4 (route coverage)
gate. Audit baseline found it emitting no output despite exit 0.
**Re-verify** before relying on it. Manual fallback: grep
controllers for `@Get/@Post/@...` decorators and confirm every one
is paired with `@Permission/@Public/@System`.

### G-004 — Audit hash-chain integrity (`stynx audit verify`)

**Severity:** MINOR (audit FIND-016).

`specs/GAP-001-audit-hash-chain.md` documents an open spec gap.
`packages/cli/src/audit.ts` exposes `verifyAuditChain`. Whether the
hash chain is enforced end-to-end (every audit row carries
`prev_hash`, tampering detected) is **not re-verified during pack
generation**. Verify before relying on it for compliance.

### G-005 — Operations runbooks absent

**Severity:** MAJOR (audit FIND-031).

`docs/meta/ops/` and `docs/runbooks/` were absent at audit time.
The pack does not provide them. Consuming teams need their own
runbooks for: tenant suspension, LGPD erasure execution, manual
session revocation, DB role password rotation, Cognito federation
onboarding. See `docs/work/prompts/AUDIT-REMEDIATION-09-operability-docs.md`.

### G-006 — Tenant-switch session exchange

**Severity:** MINOR.

`specs/GAP-004-session-tenant-exchange.md` describes the tenant-
switch endpoint and session rotation. Status: spec'd; implementation
status [`VERIFY in PORT-07`]. The pack documents the pattern as if
implemented; if you find `SessionService.exchange()` missing,
implement it per the spec or add a tenant-switch flow in the
consuming app.

### G-007 — Permission decorators expected file path

**Severity:** NIT.

The pack's auth pattern doc references `packages/auth/src/decorators.ts`.
The actual file may be split (e.g., per-decorator files). Re-verify
imports by reading `packages/auth/src/index.ts` directly.

### G-008 — `reference/api/.env.example` does not exist

**Severity:** MINOR.

The env-var inventory in
[`10-INFRASTRUCTURE-REQUIREMENTS.md`](10-INFRASTRUCTURE-REQUIREMENTS.md)
was reverse-engineered from `process.env.X` references. A canonical
`.env.example` would be authoritative; verify against
`reference/api/src/app.module.ts` and the CDK
`compute-stack.ts`'s container environment block before deploying.

## Things in code but not in the spec

### G-009 — `@stynx/backend` composition module (44 exports) not in spec §3

**Severity:** MAJOR for porting clarity.

Spec §3 lists 16 backend packages. The repo ships 17 — `@stynx/backend`
is the actual composition module imported by `reference/api/src/app.module.ts:11`
(`StynxPlatformPipelineModule`, `AuditInterceptor`, `STYNX_AUDIT_SINK`,
`@Audit`, `@Idempotent`, `@RateLimit`, etc.). Treat as STABLE;
import its barrel; do not try to wire each underlying module
individually unless you have a strong reason.

### G-010 — Two `0012_*.sql` migrations share the same numeric prefix

**Severity:** MAJOR.

`packages/data/migrations/platform/` contains both
`0012_ratelimit_idempotency.sql` and `0012_tenancy_lifecycle.sql`.
The migration runner orders by filename, so lexicographic sort
applies (the latter runs after the former). **Do not add consumer
migrations with the `0012_` prefix.** Start consumer migrations at
a high number (e.g., `9001_` or your own scheme).

### G-011 — `@stynx/cli` bin not directly invokable via pnpm exec

**Severity:** MINOR.

`pnpm --filter @stynx/cli exec stynx --help` failed with
`Command "stynx" not found` during discovery. The CLI is invoked
via `node packages/cli/dist/main.js` or via the workspace's
top-level scripts (`pnpm doctor`). Consuming repos should expose
their own CLI wrapper.

## Patterns the pack does not cleanly answer

### G-012 — Non-Angular frontend full integration coverage

**Severity:** MINOR.

[`09-FRONTEND-PATTERNS.md`](09-FRONTEND-PATTERNS.md) describes
`@stynx-web/sdk` for non-Angular consumers, but the SDK exports
were inferred from the package barrel. The reference web app is
Angular-only — there is no React/Vue/vanilla TS reference
implementation. If you're porting a non-Angular FE, validate the
SDK error handling and refresh flow yourself.

### G-013 — Background-job patterns

**Severity:** MAJOR.

Spec §1.2 / §24 explicitly says no event bus, no job runner, no
webhooks in v1.0. Foreign codebases often have these. Consumers
must keep their existing job runner (Bull, BullMQ, Agenda, cron)
outside STYNX and wrap each handler in
`withSystemContext('job-name', fn)`. The pack documents
`withSystemContext` but does not provide a job-runner integration
pattern.

### G-014 — Multi-tenant report queries that need cross-tenant aggregation

**Severity:** MAJOR.

If your reporting needs aggregation across all tenants (e.g.
platform-wide usage report), you must use `withSystemContext` +
`role: 'owner'` to bypass RLS. The pack does not give a worked
example beyond a brief mention; design carefully and audit the
output.

### G-015 — Impersonation

**Severity:** MAJOR — `[NOT SUPPORTED IN v1.0]`.

Spec §4.6 explicitly disables impersonation. Use `@System()` + `withSystemContext`
for platform admin operations. Foreign products that have
"login as customer" features must keep them outside STYNX.

## TODOs / FIXMEs in the codebase that affect porting

`[VERIFY in your port — sweep `packages/`and`packages-web/`for`TODO|FIXME|XXX|HACK` and review the top-20 results]`. The pack
generation did not exhaustively enumerate them.

## Open questions for the consuming team

### Q-001 — SAML federation status

Spec §5.2 mentions a "SAML federation stub wired into CI." Status:
[`VERIFY in PORT-07`]. If your enterprise customers need SAML, test
the stub end-to-end before committing.

### Q-002 — Long-running archive growth

Spec §14 explicitly says archive is permanent. For tenants with
high write rates (>1M/year), archive growth may exceed planning
estimates. v1.2 partitioning by `deleted_at` (§24 E9) is the
deferred mitigation. Evaluate growth modeling for your data.

### Q-003 — Cognito federation onboarding runbook

The pack does not include this runbook (G-005). Confirm whether
your operations team has one, or accept the cost of writing one
during the port.

### Q-004 — Quarterly session keypair rotation

Spec §5.3 mandates RS256 keypair rotation quarterly. The runbook
for this rotation is absent (G-005). Confirm operational ownership.

### Q-005 — Engine pinning vs CI runner

`.nvmrc` pins Node 24; `engines.node` requires `>=24 <25`. CI must
run on Node 24. If your CI provider doesn't expose Node 24 at the
needed point release, schedule the runner upgrade before Phase 1.

### Q-006 — Test fixture parity

`@stynx/testing` provides RLS-leak matchers and LGPD fixtures.
Confirm your testing harness can adopt them, or accept the cost of
porting fixtures.

## Audit findings register cross-reference

The following findings from `docs/work/audit/07-FINDINGS-REGISTER.md`
were audited at commit `457da90` (4 days before the porting-pack
baseline). Status as of pack-generation commit `670d165`:

| Finding  | Status                          | Notes                                                                             |
| -------- | ------------------------------- | --------------------------------------------------------------------------------- |
| FIND-001 | **CLOSED**                      | `@stynx/contracts` exists.                                                        |
| FIND-002 | **CLOSED**                      | `@stynx-web/angular-tenancy` exists.                                              |
| FIND-003 | **CLOSED**                      | Legacy `apps/reference-frontend` deleted.                                         |
| FIND-004 | **VERIFY** (G-001)              | Migration linter regression.                                                      |
| FIND-005 | **CLOSED**                      | EdgeStack present.                                                                |
| FIND-006 | **CLOSED**                      | `@stech/*` legacy packages removed.                                               |
| FIND-007 | **CLOSED**                      | Workspace globs spec-compliant.                                                   |
| FIND-010 | **VERIFY** (G-002)              | Privacy I3 deviation.                                                             |
| FIND-011 | **VERIFY** (G-003)              | Doctor empty output.                                                              |
| FIND-013 | **PARTIAL**                     | `.nvmrc` + `package.json` engines pin engines; CI may still run on wrong version. |
| FIND-014 | **PARTIAL**                     | All 27 packages have READMEs; TSDoc density not re-measured.                      |
| FIND-015 | **STILL LIVE** (G-013-adjacent) | `@stynx/privacy` thinly tested.                                                   |
| FIND-016 | **VERIFY** (G-004)              | Audit hash-chain.                                                                 |
| FIND-024 | **CLOSED**                      | CODEOWNERS coverage full.                                                         |
| FIND-025 | **CLOSED**                      | `infra/github/main.tf` declares branch protection.                                |
| FIND-026 | **VERIFY**                      | Conventional Commits compliance — re-check.                                       |
| FIND-031 | **STILL LIVE** (G-005)          | Operations runbooks absent.                                                       |

## How to interpret this document

- A **BLOCKER** means: do not begin the affected phase until
  resolved upstream or worked around explicitly.
- A **MAJOR** means: port may proceed; the affected surface needs
  a workaround or a follow-up — document the workaround in
  `./adoption/ASSESSMENT.md` and revisit at Phase 7.
- A **MINOR** means: cosmetic; address in cleanup if convenient.
- A **NIT** means: not actionable; logged for completeness.

If you encounter a gap not listed here during your port, **add it
to your `./adoption/ASSESSMENT.md`** rather than working around it
silently. The pack is honest about what it does not know; your
adoption assessment should match that honesty.
