# Wave 05 — Audit and Privacy Proof

**Roles:** Inspector designs tests; Engineer closes gaps.
**Branch suggestion:** `known-gaps/05-audit-privacy-proof`.
**Primary gaps:** A-01, A-02, A-03.

## Purpose

Turn audit/privacy claims into runnable evidence. This wave should not
re-implement already-closed Flow audit work; it generalizes the proof to audit
and privacy packages.

## Inputs

- `docs/KNOWN_GAPS.md` section 7
- `packages/audit/**`
- `packages/privacy/**`
- `packages/data/migrations/platform/**`
- `docs/stynx/gap-porting-baseline.md`
- `docs/work/prompts/AUDIT-REMEDIATION-10-privacy-audit-coverage.md`

## Tasks

1. Inspect current audit hash-chain implementation and tests. If already
   covered, close A-01 with file/command evidence.
2. Add reusable privacy fixture:
   - live row;
   - archive mirror;
   - PII map entry;
   - audit trail;
   - erasure request across each supported strategy.
3. Assert end-to-end LGPD behavior, including audit trail preservation.
4. Keep curated-table DML audit invariant explicit for future migrations:
   migration tests should fail when a mutable curated table lacks audit or a
   documented exception.
5. Update status docs with exact test evidence.

## Acceptance

- Audit hash-chain integrity has current passing evidence.
- Privacy package tests cover live/archive/audit erasure behavior.
- New mutable curated tables cannot silently skip audit.

## Verification

```sh
pnpm --filter @stynx/audit test
pnpm --filter @stynx/privacy test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int
pnpm test
git diff --check
```
