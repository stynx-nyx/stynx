# `docs/meta/gov/` — deprecated

&gt; **C-4 Session S5 (Phase G.2 of the DEVAI adoption pilot, 2026-05).** Per session directive 5.2 (DEVAI is authoritative; supersedes legacy stynx governance), this directory is **deprecated** as the source of truth for stynx governance.

## Canonical locations

| Concern               | Canonical location                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Compliance scorecard  | DEVAI's `internal DEVAI state artifact (not published)` scorecard machinery (`devai skill run SKILL-compute-scorecard`) |
| Audit reports         | `internal DEVAI state artifact (not published)` (auto-generated; hash-chained per Article 32)                           |
| Health / preflight    | `devai doctor --adopter` (post-Phase-21.B)                                                                              |
| Structure conformance | DEVAI's substrate validators (`devai inv-contracts`, `devai check-adrs`, `devai check-forbidden-actions`)               |
| Security audits       | `docs/meta/security/`                                                                                                   |

## What's still here (historical reference)

The files under `health/`, `audit/`, and `compliance/` predate the C-4 adoption pilot. They reflect stynx's pre-pilot governance posture and are kept for archeological reference. Do NOT treat them as authoritative for current stynx state — run the DEVAI commands above instead.

A future stynx session can choose to:

- Synthesize the historical content into DEVAI substrates (`internal DEVAI state artifact (not published)` AR-\* records pointing at this history).
- Or simply archive `docs/meta/gov/` to `docs/meta/legacy/` and remove the pointer here.

Phase G of the C-4 pilot (commit `4f914a2`) already removed `GOVERNANCE.md`'s pointer at this tree.
