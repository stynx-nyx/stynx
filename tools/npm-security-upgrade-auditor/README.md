# `tools/npm-security-upgrade-auditor`

Stynx-specific skill for auditing npm dependencies and proposing safest/latest upgrade paths with governance evidence.

## Status: intentionally stynx-idiosyncratic

> **C-4 Session T7 (post-S11 housekeeping bloc, 2026-05-16).** Relocated from `.codex/skills/npm-security-upgrade-auditor/` as part of `.codex/` retirement (T7 option B).

### Why this stays as stynx-tooling (not DEVAI)

DEVAI's `check-*` actions are calibrated for **substrate** concerns (invariants, ADRs, forbidden actions, schemas). Dependency security audits don't fit the substrate model — they operate on the npm dependency tree, which is stack-specific (npm/pnpm vs cargo vs maven vs go.mod) and not currently DEVAI's concern.

Per Phase A retro §6 (Skills consolidation audit) and Phase G's `.codex/` triage, this skill was marked **IDIOSYNCRATIC-KEEP** while the other two `.codex/skills/` (governance-structure-auditor + repo-governance-aligner) were superseded by DEVAI machinery.

### Why relocated from `.codex/` to `tools/`

After T7, `.codex/` is gone entirely (option B of the T7 retirement vote). This skill was the only active `.codex/` content; relocating to `tools/` (the canonical place for repo-tooling) avoids leaving `.codex/` as a one-file ghost dir.

### How to invoke

The skill is content-only (a SKILL.md prompt manifest) — there's no runtime here. Invoke by:

1. Opening a Claude Code (or compatible) session in this directory.
2. The agent reads `SKILL.md` for instructions.
3. Output lands at `docs/security/npm-security-upgrade-report.md` (the DEVAI substrate for security artifacts).

Older outputs at `docs/governance/audit/npm-security-upgrade-report.md` were archived to `docs/legacy/governance-archive/audit/npm-security-upgrade-report.md` in C-4 Session S5-3 — those are historical reference, not active.

### When DEVAI ships a generic dep-security action

If a future DEVAI phase adds e.g. `sense-dep-security` or `check-dep-security` that handles dep audits across stacks, this skill becomes a candidate for migration into the DEVAI substrate (analogous to the pattern noted in `tools/migration-linter/README.md`). Until then, this stays stynx-specific.
