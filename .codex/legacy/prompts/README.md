# `.codex/legacy/prompts/` — retired Codex prompt sequence

> **C-4 Session S5-4 (post-21 stynx adoption, 2026-05).** The 4 Codex prompts that used to live at `.codex/prompts/` were retired here; the parent dir is gone.

Per session directive 5.2 (DEVAI governance supersedes legacy stynx), Codex-driven automation prompts that overlap with DEVAI machinery have been deprecated. The replacement surfaces:

| Retired prompt                  | DEVAI replacement                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance-structure-audit.md` | `devai skill run SKILL-compute-scorecard` + `SKILL-assess-state`                                                                                                                                                                                    |
| `repo-governance-align.md`      | `devai init --execute` (substrate scaffolding) + `devai check-adrs` + `devai inv-contracts`                                                                                                                                                         |
| `rationalization-cleanup.md`    | DEVAI's dead-code + inv-adherence-reverse + check-forbidden-actions family                                                                                                                                                                          |
| `npm-security-upgrade.md`       | **Kept active** via `.codex/skills/npm-security-upgrade-auditor/` — see Phase A retro §6 (idiosyncratic-keep). The retired prompt here is the older free-form version; the active skill at `../skills/npm-security-upgrade-auditor/` supersedes it. |

These prompts are kept for archeological reference. They reflect the pre-pilot Codex-as-coordinator model that the DEVAI adoption replaces with the five-role authority + scorecard + autonomous-loop model.

## Related retirements (S5 + S5-4)

- `.codex/system.md` was replaced with a DEVAI-aware shim in Phase G (`4f914a2`); the pre-pilot version is at [`../system.md`](../system.md).
- `.codex/skills/governance-structure-auditor/` and `.codex/skills/repo-governance-aligner/` were archived in Phase G; only [`../../skills/npm-security-upgrade-auditor/`](../../skills/npm-security-upgrade-auditor/) remains active.
- `STYNX-CODEX-PROMPTS.md` was archived to [`.codex/legacy/STYNX-CODEX-PROMPTS.md`](../STYNX-CODEX-PROMPTS.md) in S5-2 (`ef47f85`).
