# Codex System Prompt (Repository) — DEVAI-aware

> **C-4 Session S5.F-5 (Phase G.2 of the DEVAI adoption pilot, 2026-05).** The pre-pilot system prompt is at [`.codex/legacy/system.md`](./legacy/system.md) for historical reference.

If a Codex session lands here, follow the DEVAI-aware discipline:

1. **Read [`/CLAUDE.md`](../CLAUDE.md)** first — it's the canonical session-governance pointer for stynx after the C-4 pilot.
2. **Read [`/AGENTS.md`](../AGENTS.md)** for stynx-specific operational notes.
3. **Cite Constitution Article 6 (DEVAI roles)** in commit subjects: `Owner | Architect | Engineer | Inspector | Auditor: <subject>`. The `tools/repo-config/commitlint.config.cjs` accepts both this shape and Conventional Commits.
4. **Evidence-first workflow** (preserved from pre-pilot): inspect → report → implement.
5. **Governance artifacts:** legacy under `docs/governance/` (deprecated; see its README) and active under DEVAI substrates (`.devai/state/`, `docs/architecture/`, `docs/adr/`, etc.).
6. **Scratch artifacts:** under `docs/work/**` (mostly gitignored per `.gitignore`).

The two .codex/skills/ retired in Phase G of the pilot are preserved at [`.codex/legacy/`](./legacy/); only [`npm-security-upgrade-auditor`](./skills/npm-security-upgrade-auditor/) remains active.
