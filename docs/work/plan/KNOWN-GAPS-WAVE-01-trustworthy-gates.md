# Wave 01 — Trustworthy Gates

**Roles:** Engineer implements; Inspector verifies.
**Branch suggestion:** `known-gaps/01-trustworthy-gates`.
**Primary gaps:** T-01, T-02, T-03, T-04, T-05, T-06, G-03, D-04.

## Purpose

Fix the enforcement layer before structural package or database work. A repo
with broken migration parsing, silent doctor output, or unenforced import
boundaries cannot safely claim invariant compliance.

## Inputs

- `docs/KNOWN_GAPS.md` sections 1, 5, and 9
- `docs/work/prompts/AUDIT-REMEDIATION-01-restore-migration-linter.md`
- `docs/work/prompts/AUDIT-REMEDIATION-02-fix-doctor-and-engine.md`
- `docs/work/prompts/AUDIT-REMEDIATION-07-lint-invariants-cycles.md`
- `docs/work/prompts/AUDIT-REMEDIATION-08-restore-gates.md`
- `tools/migration-linter/**`
- `scripts/stynx-doctor.mjs`
- `scripts/check-engines.mjs`
- root `package.json`, `.github/workflows/**`, commitlint config

## Tasks

1. Reproduce Wave 00 failures for migration lint, engine checks, cycles,
   doctor, and commit/PR-title enforcement.
2. Fix `tools/migration-linter` or the migrations it rejects. Prefer linter
   fixes only after proving the SQL is valid and spec-compliant.
3. Add or verify ESLint restriction for direct `pg`/`pg-pool` imports outside
   `@stynx/data` and allowed migration/tooling paths.
4. Add a test or fixture proving `eslint-plugin-boundaries` rules are active.
5. Confirm `pnpm lint:cycles` is wired to CI. Add it if missing.
6. Canonicalize `pnpm run doctor` as the repository doctor command and verify
   it emits a structured success report. `pnpm doctor` is pnpm's builtin.
7. Enforce Node 24 locally and in CI using the existing engine check.
8. Tighten commit/PR-title governance without blocking DEVAI role-prefix
   commit subjects.
9. Update `docs/KNOWN_GAPS.md` and relevant status docs only after evidence is
   captured.

## Acceptance

- `pnpm check:engines` gives a clear pass/fail.
- `pnpm lint:migrations` and `pnpm --filter migration-linter test` pass.
- `pnpm lint:cycles` passes and is CI-wired.
- Doctor prints a useful report on success.
- Boundary/import violations fail in tests or lint fixtures.
- Governance docs explain accepted commit subject shapes.

## Verification

```sh
pnpm check:engines
pnpm lint:migrations
pnpm --filter migration-linter test
pnpm lint:cycles
pnpm run doctor
pnpm lint:workflows
git diff --check
```
