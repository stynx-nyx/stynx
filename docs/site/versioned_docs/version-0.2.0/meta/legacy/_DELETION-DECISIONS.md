# `docs/meta/legacy/` — deletion-decision record

&gt; **C-4 Session T6 (post-S11 housekeeping bloc, 2026-05-16).** Per-tree verdict on whether to keep each legacy archive indefinitely or `git rm` it. Recorded here as forensic; future contributors should consult this file before adding or removing anything under `docs/meta/legacy/`.

## Verdicts

| Tree                                    | Verdict                        | Rationale                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/meta/legacy/governance-archive/`  | **KEEP**                       | 7 files of pre-pilot governance posture (preflight, build-status, scorecards, scoring methodology, structure-conformance, npm-security-upgrade-report). Forensic value: documents _why_ the C-4 pilot's governance retirement made sense. Low cost (~30 KB total).                                 |
| `docs/meta/legacy/completed-gap-tasks/` | **KEEP**                       | 8 files (7 GAP-_ task specs + README). Provides historical context for why packages like `@stynx/audit` (GAP-001), `@stynx/sessions` (GAP-004), `@stynx/storage` (GAP-005) exist in their current shape. Linked from `docs/meta/rfcs/0001..0007_.md`. Removing would break those RFC source links. |
| `/specs/README.md`                      | **DELETE** (in this T6 commit) | Forwarding pointer authored in S5-2; redundant once incoming references migrate. All incoming references updated in this same commit (CODEOWNERS, docs.yml, GOVERNANCE.md, README.md, 7 RFCs at `docs/meta/rfcs/0001..0007*.md`).                                                                  |
| `/specs/` (the directory itself)        | **DELETE** (in this T6 commit) | Empty after README delete.                                                                                                                                                                                                                                                                         |
| `.codex/legacy/*`                       | **DEFER to T7**                | Decision tied to T7's `.codex/` retirement vote. If T7 picks option B (relocate + delete), `.codex/legacy/*` goes with it.                                                                                                                                                                         |

## What remains under `docs/meta/legacy/` after T6

- `docs/meta/legacy/_DELETION-DECISIONS.md` (this file).
- `docs/meta/legacy/governance-archive/` (8 files including README).
- `docs/meta/legacy/completed-gap-tasks/` (8 files including README).

Total: 17 files. Steady-state archive size.

## Re-deletion criteria

Either of `docs/meta/legacy/governance-archive/` or `docs/meta/legacy/completed-gap-tasks/` could be deleted in a future maintenance pass IF:

- No `git log -- docs/meta/legacy/&lt;tree&gt;` activity in 12+ months, AND
- No incoming links from RFCs or active documentation, AND
- An explicit decision is recorded by appending to this file.

Until then: leave them.

## Incoming-reference audit (at T6 commit time)

`/specs/` references updated to new locations or removed:

- `.github/CODEOWNERS:12` — removed (replaced with `/reference/*` + `/domain/*` + `/.devai/`).
- `.github/workflows/docs.yml:10,25` — removed (`specs/**` glob in PR + push triggers).
- `GOVERNANCE.md:11` — updated (notes ADRs migrated; T6 retires `/specs/`).
- `README.md:9-56` — stale ASCII Monorepo Layout tree (referenced `specs/` and `apps/reference-*`) deleted; the post-C-4 table at line 58+ is the authoritative shape.
- `docs/meta/rfcs/0001..0007*.md` — 7 RFCs updated from `../../specs/GAP-*` to `../legacy/completed-gap-tasks/GAP-*`.

`docs/meta/legacy/` references — none modified (the archive is self-contained; outgoing links from archived files to the rest of the repo are deliberately stale-historical).
