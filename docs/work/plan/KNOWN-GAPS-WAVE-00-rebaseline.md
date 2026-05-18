# Wave 00 — Rebaseline Known Gaps

**Role:** Auditor.
**Branch suggestion:** `known-gaps/00-rebaseline`.
**Purpose:** classify current `docs/KNOWN_GAPS.md` rows as open, closed, stale,
or deferred before implementation waves mutate the repo.

## Inputs

- `docs/KNOWN_GAPS.md`
- `docs/work/audit/07-FINDINGS-REGISTER.md`
- `docs/work/audit/08-REMEDIATION-PLAN.md`
- `docs/stynx/remaining-work.md`
- `docs/stynx/feature-coverage-status.md`
- Current `package.json` scripts and workspace layout
- Current `git status --short --branch`

## Tasks

1. Inspect the dirty tree. Separate user/generated DEVAI state from code/docs
   that belong to the wave.
2. Build a table with every `KNOWN_GAPS.md` id and one status:
   `open`, `closed-with-evidence`, `stale-needs-doc-update`,
   `deferred-by-ADR`, or `moved-to-devai`.
3. Run non-destructive evidence commands:
   - `node -v`
   - `pnpm -v`
   - `pnpm check:engines`
   - `pnpm lint:migrations`
   - `pnpm --filter migration-linter test`
   - `pnpm lint:cycles`
   - `pnpm run doctor`
   - targeted tests for rows suspected stale, such as audit/privacy/Flow tests.
4. Record command outcomes in `docs/work/plan/WAVE-00-rebaseline-report.md`.
5. Do not implement fixes in this wave unless a command reveals a trivial
   documentation-only stale status.

## Acceptance

- A rebaseline report exists under `docs/work/plan/`.
- The report lists every gap family and the next wave that owns it.
- Any failed command has exact command text, exit status, and short diagnosis.
- The wave leaves source untouched unless explicitly approved.

## Follow-On Routing

- Gate failures go to Wave 01.
- Package-shape blockers go to Wave 02.
- Stale Flow-only residues go to Wave 09 or are closed immediately if already
  implemented and documented.
