# ADR: Migration of STYNX to DEVAI Constitution 0.2.0

**Status:** Accepted.
**Date:** 2026-06-04.
**Author role:** Architect, per DEVAI Constitution Article 6.
**Related:** Upstream amendment record at [`../../../../devai/CONSTITUTION.md`](../../../../devai/CONSTITUTION.md) (Article 40 first invocation, R14 close);
upstream IA law [`../../../../devai/docs/meta/adr/ADR-DOCS-IA.md`](../../../../devai/docs/meta/adr/ADR-DOCS-IA.md);
canonical migration guide `https://aarusso-nyx.github.io/devai/docs/adopters/migrating-to-0.2.0`;
triggering proposal [`../../../../align/proposals/devai-to-stynx.md`](../../../../align/proposals/devai-to-stynx.md);
round plan [`../../../../align/stynx/round-15/Plan.md`](../../../../align/stynx/round-15/Plan.md);
round orchestrator [`../../../../align/stynx/round-15/prompts/00-orchestrator.md`](../../../../align/stynx/round-15/prompts/00-orchestrator.md);
prior adoption ADR [`ADR-DOCS-GOVERNANCE-ADOPTION.md`](ADR-DOCS-GOVERNANCE-ADOPTION.md) (R14 — the law this round layers IA on top of).

## Context

DEVAI Round 14 closed on 2026-06-04. R14 established DEVAI's published documentation information architecture — seven-section IA, framework/meta semantic split, hand-authored sidebar, five generators, an extended `check-docs-governance` sensor with five new `docs-ia.*` rules — and amended `CONSTITUTION.md` Article 6 (substrate authority-by-path) to enumerate the new section-root paths. The constitution version bumped 0.1.1 → 0.2.0. This was Article 40's first invocation against the constitution.

STYNX has been at 0.1.1 by inheritance — its `.devai/constitution.md` pointer resolves to the sibling DEVAI checkout, with no explicit `constitution.version` field in `.devai/config/project.json`. Until R15, the 0.1.1 path enumeration was the authority surface; DEVAI honoured the pin via Docusaurus versioned-docs at `/docs/0.1.1/framework/constitution`.

The migration is **not** time-critical — DEVAI continues to serve 0.1.1 indefinitely — but it is the precondition for STYNX receiving any future DEVAI substrate that assumes 0.2.0 path semantics. The triggering proposal (`align/proposals/devai-to-stynx.md`), authored on the DEVAI side immediately post-R14-close, recommends an eight-wave round; this ADR ratifies the migration and locks the four non-mechanical decisions that round needs to execute against.

Per Constitution Article 36, DEVAI applies to itself transitively — STYNX, as a DEVAI adopter, migrates when DEVAI's law moves under it.

## Decision

Four decisions, lettered to match the triggering proposal's "Open decisions stynx must answer before opening R15" section so cross-referencing the proposal is painless. Each decision is also recorded verbatim in `align/stynx/round-15/Plan.md` "Locked decisions" — this ADR is the authoritative ledger; the Plan is the operational mirror.

### A — §3 Framework strategy: hybrid

STYNX is a **library** repo (per `.devai/config/project.json` `repo.kind=library`, set at R14 closeout). Its consumers (PEC, SGP, TEAT, etc.) need STYNX's API + contracts as Framework material. DEVAI's §3 Framework describes the meta-framework, not STYNX's own contract surface.

The proposal offered three options: (a) STYNX's §3 holds its own API surface entirely; (b) §3 contains only a pointer to DEVAI's framework reference, with STYNX's API surface relegated to §6 Reference; (c) hybrid — STYNX-specific contract in §3 with §3.0 cross-link to DEVAI's framework.

**(c) is locked.** Rationale: STYNX is a library that _depends on_ DEVAI's framework rather than _is_ a framework. Option (a) misrepresents the relationship; option (b) understates STYNX's own framework story (its contracts under `docs/framework/contracts/`, its schemas under `docs/framework/schemas/`, its glossary). The hybrid is the semantically correct shape for a `library`-classified DEVAI adopter and minimises authoring volume — STYNX writes only its own contract content, and a single §3.0 cross-link inherits DEVAI's framework reference by URL.

W07 of R15 lands §3.0 as a single page cross-linking to `https://aarusso-nyx.github.io/devai/docs/framework/` and a stub for STYNX-specific contract content. Filling §3 with detailed STYNX prose is deferred — see Consequences.

### B — STYNX-specific directory mapping

The triggering proposal enumerated seven STYNX-specific directories that need destinations under the seven-section IA: `docs/{api, dev, eng, gov, legacy, pilots, rfcs}`. The actual `docs/` tree carries **five additional** directories the proposal audit missed: `adopters/`, `sys/`, `stynx/`, `templates/`, `work/`. W04 of R15 augments the proposal's table to cover all twelve.

Locked baseline (W04 may refine specific destinations after surveying contents; the _shape_ is locked here):

| Current                 | Destination                                          | Rationale                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/framework/api/`   | `docs/framework/api/`                                | API reference fits Framework under Decision A's hybrid §3.                                                                                                                         |
| `docs/meta/dev/`        | `docs/meta/dev/`                                     | Dev-process content matches §7 Meta (DEVAI-applies-to-itself substrate).                                                                                                           |
| `docs/meta/eng/`        | `docs/meta/eng/`                                     | Engineer-internal notes match §7 Meta.                                                                                                                                             |
| `docs/meta/gov/`        | `docs/meta/gov/`                                     | Governance notes match §7 Meta.                                                                                                                                                    |
| `docs/meta/legacy/`     | `docs/meta/legacy/`                                  | Historical content; Meta-resident. Deletion considered and rejected — too noisy a step for a migration round.                                                                      |
| `docs/adopters/pilots/` | `docs/adopters/pilots/`                              | Pilot reports match §5 Adopters; the existing `docs/adopters/` already carries closeouts which are a similar genre.                                                                |
| `docs/meta/rfcs/`       | `docs/meta/rfcs/`                                    | Internal proposals match §7 Meta.                                                                                                                                                  |
| `docs/adopters/`        | (no move — `adopters/` is a 0.2.0 top-level section) | Pre-existing `docs/adopters/` directory aligns with §5; contents may need reshuffle inside the section but the directory stays.                                                    |
| `docs/meta/sys/`        | `docs/meta/sys/`                                     | System-internal notes match §7 Meta.                                                                                                                                               |
| `docs/stynx/`           | (deferred to W04 decision)                           | Could be `framework/stynx/`, `meta/stynx/`, or merged into `start/`. Single-wave decision in W04.                                                                                  |
| `docs/meta/templates/`  | `docs/meta/templates/`                               | Templates are tooling substrate; Meta-resident.                                                                                                                                    |
| `docs/work/`            | (no move; not under 0.2.0 enumeration)               | `docs/work/` is operational artifacts (the `2026-05-24-*.md` notes). Stays put as out-of-IA operational scratch — confirmed against 0.2.0 enumeration which does not name `work/`. |

W04 authors `docs/_ia/categories.json` as the authoritative manifest. The table above is the lock for _what migrates where_; the _order_ within each section is W04's call.

### C — Loose `docs/` root files: kebab-case on move

Four loose `.md` files live at `docs/` root today:

- `docs/start/index.md` → `docs/start/index.md`
- `docs/framework/architecture-guide.md` → `docs/framework/architecture-guide.md`
- `docs/framework/rbac-matrix.md` → `docs/framework/rbac-matrix.md`
- `docs/meta/known-gaps.md` → `docs/meta/known-gaps.md`

Spaces in filenames are URL-unfriendly under Docusaurus. The kebab-case rename happens at move time in W03. Inbound markdown links are rewritten by the `r14-*.mjs` script chain; STYNX-specific link patterns the scripts miss (e.g. `[Overview](docs/Overview.md)` with the literal capitalisation) are swept by hand in W03.

Single-page treatment for `Overview.md → start/index.md` (rather than `start/what-is-stynx.md` + separate `start/index.md`) is deliberate: STYNX has no other Start content authored, and a separate landing page over a single subordinate page reads as bureaucratic. W07 may split if Start content grows during content authoring.

### D — Severity graduation: four of five `docs-ia.*` rules to `fail` at R15 close

ADR-DOCS-IA Decision 9 ships adopter rules `warn` by default. STYNX may graduate per-rule to `fail` immediately for rules it confidently passes. Locked graduation:

| Rule                             | Severity at R15 close | Rationale                                                                                                                                                                                        |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs-ia.landing-exists`         | `fail`                | W07 lands `start/index.md`; checking for its presence is mechanical.                                                                                                                             |
| `docs-ia.constitution-published` | `fail`                | W06 lands versioned-docs with both 0.1.1 and 0.2.0 snapshots; checking constitution-published is mechanical.                                                                                     |
| `docs-ia.sidebar-curated`        | `fail`                | W06 lands the seven-section hand-authored `sidebars.ts`; checking for the seven sections is mechanical.                                                                                          |
| `docs-ia.framework-meta-split`   | `fail`                | W04's `categories.json` ensures the split; structurally cheap to maintain.                                                                                                                       |
| `docs-ia.dashboard-current`      | `warn`                | Freshness rule; minor stale-by-publish-cadence noise expected. Graduating to `fail` would couple every PR's mergeability to dashboard recency, which is not a tradeoff STYNX wants at R15 close. |

W08 authors STYNX's pack override for `check-docs-governance` reflecting this graduation.

## Consequences

- **Sensor-enforced compliance at 14 rules.** Post-R15 close, `devai check docs-governance` runs at 14 rules (9 from R13 + 5 from R14). STYNX's pack overrides graduate the four structural rules to `fail`; drift in the IA reshape cannot land silently.
- **Future DEVAI substrate becomes adoptable.** Any DEVAI substrate post-R14 that assumes 0.2.0 path semantics now flows into STYNX without further migration friction.
- **0.1.1 path enumeration retires from STYNX.** The pre-W03 directory structure is no longer authority-bearing; STYNX's `.devai/constitution.md` pointer resolves to the 0.2.0 view of the sibling DEVAI checkout (the explicit pin lands in W02).
- **§3 Framework deferred fill.** Decision A's hybrid commits only to a §3.0 cross-link + a contract stub. Filling §3 with detailed STYNX prose is a future round. The trade-off is honest: STYNX's framework story stays sparse on the published site until that round runs.
- **Pin-bump baseline-shape risk.** STYNX's `.devai/config/project.json` carries no `constitution` stanza today. W02 populates `constitution.version: "0.2.0"` — the first time the field exists. Tools that assume the field is absent may regress; W02 grep-sweeps `packages/`, `packages-web/`, `tools/`, `scripts/` for `project.json` reads before the bump.
- **Round-artifact path divergence persists.** STYNX stores round artifacts at `align/stynx/round-N/`; DEVAI stores them at `docs/work/round-N/`. The `.gitignore` exception added in W01 is `!align/stynx/round-*/prompts/*.log`, not the canon's `!docs/work/round-*/prompts/*.log`. Harmonisation is out of scope; flag for a future round if desired.
- **Pilot-retro under `docs/adopters/pilots/c-4/`.** R15's close lands `docs/adopters/pilots/c-4/r15-migration-retro.md` capturing migration surprises. Stynx's value as the C-4 pilot accrues through this retro; W01 stubs the file so observations can be appended as the round progresses rather than reconstructed at W08.
- **Generator portability assumption.** Decision A's hybrid leans on adopting DEVAI's five `gen-*.mjs` generators as-is. The schema-browser generator assumes a `docs/framework/schemas/*.schema.json` layout; STYNX's schemas live at `docs/framework/schemas/` pre-reorg and `docs/framework/schemas/` post-reorg. W07 verifies the generator reads STYNX's tree correctly. If it doesn't, W07 either patches the generator or files a DEVAI gap.

## Alternatives Considered

- **(a) Defer the migration to a future round.** Rejected because the migration is mechanical and well-scripted (DEVAI shipped five reusable `r14-*.mjs` scripts + five `gen-*.mjs` generators), and the proposal explicitly names STYNX as the canonical adopter. Delaying creates drift between STYNX and any future DEVAI substrate. The proposal's option 2 (defer) is rejected here.
- **(b) §3 Framework option (a) — STYNX owns its full framework surface.** Rejected per Decision A. STYNX is a library, not a framework — owning §3 entirely misrepresents the relationship and would require ~8 pages of prose distilled from STYNX's own contracts. The authoring cost is not justified by the semantic gain.
- **(c) §3 Framework option (b) — STYNX points only at DEVAI's framework reference.** Rejected per Decision A. Option (b) understates STYNX's own framework story (the contracts under `docs/framework/contracts/`, the schemas under `docs/framework/schemas/`). Relegating them to §6 Reference loses the framework framing.
- **(d) Graduate `docs-ia.dashboard-current` to `fail`.** Rejected per Decision D. Coupling PR mergeability to dashboard recency is a tradeoff STYNX does not want at R15 close. The rule stays `warn`; a future round may reconsider once the dashboard refresh cadence is settled.
- **(e) Move `docs/work/` into the IA.** Rejected per Decision B. `docs/work/` is operational scratch (per-day `.md` notes from R14), not IA content. Leaving it out-of-IA matches DEVAI's own treatment.
- **(f) Delete `docs/meta/legacy/` instead of moving to `docs/meta/legacy/`.** Rejected per Decision B. Migration round is the wrong place for content deletions; the legacy content is small and a separate cleanup round can address it without coupling.
- **(g) Author a stynx-side ADR-DOCS-IA equivalent.** Rejected. STYNX adopts DEVAI's ADR-DOCS-IA by reference (12 decisions) just as R14's ADR-DOCS-GOVERNANCE-ADOPTION adopts DEVAI's ADR-DOCS-GOVERNANCE by reference. This ADR covers only the migration decision + Decisions A–D; the IA law itself lives upstream and is cited, not duplicated.

## Affected Rules / References

- **Constitution Article 6** (substrate authority-by-path) — the path enumeration that changed in 0.2.0; STYNX's F1 directories now follow the seven-section layout.
- **Constitution Article 36** (DEVAI applies to itself transitively) — the transitivity that makes the migration mandatory, not optional.
- **Constitution Article 38** (JSON canon) — `.devai/config/project.json` carries the `constitution.version` field post-W02.
- **Constitution Article 40** (amendment process) — first-invocation precedent set by DEVAI R14 W02; STYNX inherits the bump rather than invoking Article 40 itself (the amendment lives upstream).
- **Upstream ADR-DOCS-IA** — 12 decisions; binding on adopters. STYNX adopts by reference.
- **Upstream ADR-DOCS-GOVERNANCE** + **ADR-LOCAL-PUBLISH-WORKFLOW** — R13 law that R15 layers IA on top of. STYNX's R14 closeout (`ADR-DOCS-GOVERNANCE-ADOPTION.md`) is the local adoption record.
- **STYNX R15 Plan** — `align/stynx/round-15/Plan.md`.
- **STYNX R15 orchestrator** — `align/stynx/round-15/prompts/00-orchestrator.md`.
- **STYNX R15 workers** — `align/stynx/round-15/prompts/{01..08}-*.md`.
- **Triggering proposal** — `align/proposals/devai-to-stynx.md`.
- **DEVAI R14 round artifacts** — `../../../../devai/docs/work/round-14/` (Plan.md, Closeout.md, 13 worker prompts + 14 logs).
- **DEVAI R14 reusable scripts** — `../../../../devai/scripts/r14-*.mjs` + `../../../../devai/scripts/gen-*.mjs`.
- **DEVAI R14 versioned-docs current-version fix** — commit `b700657`; lesson-learned cited verbatim in R15 W06.
