# `docs/meta/legacy/governance-archive/` — pre-pilot stynx governance, archived

&gt; **C-4 Session S5-3 (post-21 stynx adoption, 2026-05).** This tree is what `docs/meta/gov/` used to be before the DEVAI adoption pilot. Per session directives 5.1/5.2 (DEVAI authoritative; supersedes legacy stynx governance), governance content lives in DEVAI substrates now.

## Where stynx governance lives today

| Concern                  | Canonical location                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compliance scorecard     | `devai skill run SKILL-compute-scorecard` → `internal DEVAI state artifact (not published)`                                                              |
| Health / preflight       | `devai doctor --adopter` (Phase 21.B)                                                                                                                    |
| Audit reports            | `internal DEVAI state artifact (not published)` (auto-emitted, hash-chained per Article 32)                                                              |
| Structure conformance    | `devai inv-contracts` + `devai check-adrs` + `devai check-forbidden-actions`                                                                             |
| Security audits          | [`docs/meta/security/`](../../security/) + DEVAI's `SKILL-write-threat-model`                                                                            |
| Per-package npm security | [`.codex/skills/npm-security-upgrade-auditor/`](../../../.codex/skills/npm-security-upgrade-auditor/) — kept as stynx-idiosyncratic per Phase A retro §6 |

## What's archived here

| File                                   | What it was                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `health/preflight.md`                  | Pre-pilot health-check checklist with PASS status                                            |
| `health/build-status.md`               | Pre-pilot build-status snapshot                                                              |
| `audit/structure-conformance.md`       | Pre-pilot structural conformance audit                                                       |
| `audit/npm-security-upgrade-report.md` | npm dep security report (the `.codex/skills/npm-security-upgrade-auditor` skill emits these) |
| `compliance/scorecard-2026-02-15.md`   | Pre-pilot manual scorecard                                                                   |
| `compliance/scoring.md`                | Pre-pilot scoring methodology                                                                |
| `_DEPRECATION-NOTICE.md`               | The "deprecated" pointer that lived at `docs/meta/gov/README.md` post-Phase-G of the pilot   |

These files are kept for archeological reference (why-was-it-built-this-way context). They are NOT authoritative for current stynx state — run the DEVAI commands listed above for live signal.

`GOVERNANCE.md` at the repo root was updated in Phase G (commit `4f914a2`) to point at the DEVAI substrates instead of `docs/meta/gov/`; the dir-level deprecation README in `_DEPRECATION-NOTICE.md` (kept here for forensic completeness) was authored in S5-step-1 (commit `cb734ac`).
