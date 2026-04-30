# 03 — Code Quality

## Verification commands run

| Command                       | Exit  | Headline result                                                                                          |
| ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `pnpm -r ls --depth -1`       | 0     | 41 workspaces enumerated, including 4 unexpected top-level (FIND-007)                                    |
| `pnpm -w typecheck`           | 0     | **60 / 60 successful**, 1m42s, 24 cached                                                                 |
| `pnpm -w lint`                | 0     | **39 / 39 successful**, 23s, 34 cached                                                                   |
| `pnpm doctor`                 | 0     | **Empty output** — script is wired to `scripts/stynx-doctor.mjs` but produced nothing. UNKNOWN. FIND-011 |
| `pnpm -r test` (via subagent) | non-0 | `tools/migration-linter` test fails: 4 parser errors. FIND-004                                           |

All commands ran on Node `v22.22.0`; `package.json#engines.node` is
`>=24 <25`. Every workspace prints the same `WARN Unsupported engine`
banner. **Engine mismatch is environment-only**, not a defect, but it
means the audit ran outside the supported runtime — graded as MAJOR
because CI gating against engine drift is the spec's posture (FIND-013).

## Test Coverage

Coverage thresholds (`/config/jest.coverage.cjs`):

| Group            | Stmts | Branches | Funcs | Lines |
| ---------------- | ----- | -------- | ----- | ----- |
| `@stynx/auth`    | 95    | 95       | 95    | 95    |
| `@stynx/data`    | 95    | 95       | 95    | 95    |
| Other `@stynx/*` | 85    | 80       | 85    | 85    |

Thresholds **match the spec** (Prompt 2). Actual coverage measurement was
deferred — the `pnpm -r test --coverage` matrix needs a per-package run.
The frontend tests-per-package count of 1 (see [01](01-COMPLETENESS-MATRIX.md))
is a strong indicator that frontend coverage is structurally below the
85 % bar even if the unit tests assert deeply. FIND-019.

## Type Strictness — **PASS**

`tools/tsconfig/base.json` enables `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`. All 19 audited packages extend this base.
**100 % strict-mode coverage.**

## `any` leakage — **PASS**

Grep across `packages/**/src/`:

- `as any` → 0 occurrences
- `: any` → 0 occurrences

This is unusually clean and reflects positively on code discipline.

## Logging Hygiene — **PASS**

`console.log`/`console.error` outside `packages/cli/src/` → 0.
Inside `packages/cli/src/` → 11 occurrences (cli.ts:29–64, main.ts:6),
all intentional CLI output. Acceptable.

`packages/logging/src/pino.factory.ts` configures Pino with JSON output
in production, redaction of `password`, `token`, auth headers, cookies,
and JWT fields, plus structured request fields (`request_id`, `tenant_id`,
`actor_id`, `session_id`, `locale`, `route`, `method`, `status`,
`duration_ms`). This is spec-aligned (§11.1).

## Async Correctness / Error Handling — **PASS (sampled)**

- No empty `catch` blocks (`catch \(.*\) \{\s*\}` / `catch \{\s*\}`) found.
- `eslint-plugin-boundaries` is in devDependencies. Whether
  `no-floating-promises` is enabled is not verified in this audit.

## SQL injection surfaces — **PASS**

No raw template-literal SQL found outside `packages/data/`.

## Test Quality — **PASS**

- `it.only` / `describe.only` / `xit` / `xdescribe` / `.skip(` → 0 across
  all test files.
- No `Math.random()` or unfrozen `new Date()` patterns flagged in test
  bodies (sampled).

The migration-linter test failure (FIND-004) is _not_ a quality issue with
the test — it's a real failure surfacing real defects in the migration
files. The test is doing its job.

## Security Scan

`pnpm audit --audit-level=high`:

| Severity        | Count | Notable                                                   |
| --------------- | ----- | --------------------------------------------------------- |
| Critical (≥9.0) | 0     | —                                                         |
| High (≥7.0)     | 0     | —                                                         |
| Moderate        | 1     | `bootstrap` < 3.4.0, CVE-2018-20676/77 (XSS)              |
| Low             | 2     | `tmp` ≤ 0.2.3 (CVE-2025-54798), `uuid` 8.3.2 (transitive) |

No high/critical advisories. Moderate `bootstrap` finding is a UI library
in `apps/reference-web` and is fixable by upgrade. FIND-020 (MINOR).

Trivy / Semgrep were not run in this audit — UNKNOWN-edges.

## Documentation Coverage — **MAJOR**

TSDoc density on a sample of `src/index.ts` files:

| Package       | Exported symbols | TSDoc-prefixed |
| ------------- | ---------------- | -------------- |
| `@stynx/core` | 11               | 0              |
| `@stynx/auth` | 20               | 0              |
| `@stynx/data` | 12               | 0              |

**Zero TSDoc on three of the most-imported packages.** The spec doesn't
explicitly mandate TSDoc, but Prompt 2's quality bar (and any reasonable
v1.0 sign-off) implies it. Backend READMEs are also absent for 14 of 16
packages (only `tenancy` and `sessions` have one). FIND-014.

## Aggregate Quality Score

Letter grade weighted:

| Dimension                          | Weight | Score                                                         |
| ---------------------------------- | ------ | ------------------------------------------------------------- |
| Type strictness                    | 15     | A (100 %)                                                     |
| any leakage                        | 5      | A                                                             |
| Logging hygiene                    | 10     | A                                                             |
| Test quality (no skips, no flakes) | 10     | A                                                             |
| Security advisories                | 10     | A− (1 moderate)                                               |
| Async/error handling               | 5      | A (sampled)                                                   |
| Test coverage (verified)           | 25     | C (thresholds set; actual not measured; frontend likely thin) |
| Documentation coverage             | 15     | F (0 % TSDoc on core packages, 14/16 backend READMEs missing) |
| Build / typecheck / lint pass      | 5      | A (60/60, 39/39)                                              |

Weighted: roughly **B−** overall. The strict-mode and security posture is
exemplary; the documentation gap and unverified coverage drag the grade
down materially.
