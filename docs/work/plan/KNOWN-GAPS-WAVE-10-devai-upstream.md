# Wave 10 — DEVAI Upstream

**Roles:** Architect/Engineer in `../devai`; Auditor updates stynx references.
**Branch suggestion:** work in `../devai`, not stynx.
**Primary gaps:** DV-01, DV-02, DV-03, DV-04.

## Purpose

Close DEVAI framework defects in DEVAI itself. Stynx should not absorb local
workarounds for upstream adoption issues.

## Inputs

- `docs/KNOWN_GAPS.md` section 10
- `docs/pilots/c-4/**` in stynx
- `../devai/CLAUDE.md`
- `../devai/README.md`
- `../devai/CONSTITUTION.md`
- `../devai/docs/schemas/**`
- relevant DEVAI doctor/sensor/skill source

## Tasks

1. In `../devai`, inspect current doctor adopter mode and close remaining
   self-development assumptions.
2. Fix scorecard classification for L0 inventory sensor readings.
3. Improve `SKILL-assess-state` output so UNKNOWN-heavy scorecards suggest
   actionable L1+ sensor wrapping.
4. Exercise or fix `sense-coverage` so authored use cases produce coverage
   links.
5. Back in stynx, update `docs/KNOWN_GAPS.md` only to reference upstream fixes
   and evidence.

## Acceptance

- DEVAI tests cover adopter-mode behavior.
- Stynx no longer lists DV rows as local work.
- No stynx-only workaround replaces an upstream fix.

## Verification

```sh
cd ../devai
pnpm test
pnpm build
pnpm doctor
cd ../stynx
pnpm run doctor
git diff --check
```
