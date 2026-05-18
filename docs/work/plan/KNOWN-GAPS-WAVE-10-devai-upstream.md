# Wave 10 — DEVAI Upstream

**Status:** Closed / superseded by DEVAI Phase 33 (`2331ac9`, D-90 closeout) and
the stynx Auditor closeout commit carrying the subject `Auditor: Wave 10
closeout — DEVAI Phase 33 ratifies DV-01..DV-04 stale, closes D-A-35`. The Wave
10 re-evaluation ratified DV-01..DV-04 as stale upstream rows and discovered
D-A-35, which DEVAI closed in Phase 33.B (`dd28dcd`, with regression tests at
`6f71524`). This plan is preserved as the forensic trail; do not reopen it for
new DEVAI findings.

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
