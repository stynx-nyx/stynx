# Wave 99 — Final Closure Audit

**Role:** Auditor.
**Branch suggestion:** `known-gaps/99-final-closure`.
**Primary scope:** all open `docs/KNOWN_GAPS.md` rows after Waves 00-10.

## Purpose

Prove the gap sequence is actually closed and leave durable state for the next
release/readiness decision.

## Inputs

- `docs/KNOWN_GAPS.md`
- all wave reports under `docs/work/plan/`
- `docs/stynx/remaining-work.md`
- `docs/stynx/feature-coverage-status.md`
- `docs/stynx/release-readiness.md`
- current CI/local evidence

## Tasks

1. Re-read all open rows in `KNOWN_GAPS.md`.
2. For each row, record one of:
   - closed with file and command evidence;
   - intentionally deferred with ADR or explicit release-risk owner;
   - moved to DEVAI upstream with link/evidence;
   - still open with next concrete prompt.
3. Run broad verification:
   - package builds/tests;
   - DB migration/verify against a fresh database;
   - lint, dependency, cycles, workflow gates;
   - release policy/status;
   - reference app gates;
   - smoke/metrics where implemented.
4. Update durable docs:
   - `docs/KNOWN_GAPS.md`;
   - `docs/stynx/remaining-work.md`;
   - `docs/stynx/feature-coverage-status.md`;
   - `docs/stynx/release-readiness.md`.
5. Produce `docs/work/plan/WAVE-99-final-closure-report.md`.

## Acceptance

- No stale open gap remains in `KNOWN_GAPS.md`.
- Every deferral names risk, owner, and follow-up trigger.
- Verification commands are fresh and reproducible.
- The repo is left with a clean intended diff and no mixed generated state.

## Verification

```sh
pnpm check:engines
pnpm lint
pnpm lint:deadcode
pnpm lint:deps
pnpm lint:migrations
pnpm lint:cycles
pnpm lint:workflows
pnpm typecheck
pnpm test
STYNX_TEST_PG_HOST=localhost pnpm test:int
pnpm build
pnpm ci:reference-apps
pnpm release:policy
pnpm release:status
pnpm run doctor
git diff --check
```
