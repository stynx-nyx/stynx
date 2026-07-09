# C-4 Pilot — R16 package-deepening retro

**Closed:** 2026-06-05.
**Round:** R16 — package-documentation deepening.
**Predecessor commit:** `84932a18` (R15 sub-packages surfacing).
**Triggering signal:** R15 pilot retro item "§3 Framework deep fill" + the sub-packages-surfaced-but-thin observation.

## TL;DR

Every one of STYNX's **41 published packages** (24 backend `@stynx-nyx/*`, 13 web `@stynx-web/*`, 4 tools `@stynx-internal/*`) was deepened from a ~50–130-line stub to a template-conformant developer reference: purpose / audience / install / quick-start / public-API-surface / configuration / examples / common-pitfalls / related-packages. Two packages got `docs/` subtrees: `@stynx-nyx/backend` (10 modularity-driven submodule pages) and `@stynx-nyx/flow` (10 size-driven endpoint/domain pages covering 20 controllers / ~113 routes). `check-package-doc-shape` went **0/41 → 41/41 clean**. The Docusaurus build is clean for every new cross-reference. Ten waves, executed largely autonomously per Decision G.

## What worked

- **The README template (Decision B) held across 41 packages.** Locking the 8-mandatory-section shape in W01 meant every wave produced consistent structure. Authors never had to re-decide layout.
- **The `check-package-doc-shape` gate was the right enforcement.** A simple regex over `## ` headings caught every drift. 0→41 is a clean, measurable round outcome.
- **Adaptive depth (Decision B) matched reality.** Light-tier packages (`feature-flags`, `pdf-a`, `angular-trash`) got ~200 lines; deep-tier (`flow`, `data`, `auth`, `angular-iam`) got 250–600+. The tier assignment in `inv/package-inventory.json` made each wave's effort predictable.
- **Distributed backend-submodule authoring (Option B / Decision E)** kept cross-links backward-only. `backend/audit.md` landed in W04 alongside `@stynx-nyx/audit`, so it could cite a package already documented rather than forward-referencing.
- **Family-specific audience pitches (Decision A)** read correctly. Backend READMEs show NestJS module wiring; web READMEs show standalone-providers + component templates; tools READMEs show CLI invocations. The shift was natural per family.
- **The flow `docs/` subtree (size-driven split)** turned an unreadable 600+-line flat README into a navigable 10-page tree. Grouping the 20 controllers by domain (forms, fills, graph, runs-tasks, policies, effects, analytics) rather than 1:1 kept the page count at ~12.

## Findings (R16-specific gaps to file)

### G16-1 (HIGH) — `docs-links` sensor false-positives on Docusaurus site-absolute URLs

Decision F locked the cross-link style as absolute-from-root: `[`@stynx-nyx/auth`](/docs/packages/auth/)`. This is the **correct** form for the published Docusaurus site — verified: the current-version build reports **zero** broken links for these cross-refs and every target page exists in `docs/site/build/`.

But the devai `docs-links` sensor resolves `/docs/...` as a _filesystem-relative_ path (e.g. `/docs/packages/auth/` from `packages/audit/README.md` → `../../../../../docs/packages/auth`, which doesn't exist on disk). Result: the sensor reports **420 broken** vs the **219** round-open baseline — a +201 delta that is **entirely false-positive**. The authoritative renderer (Docusaurus, which the published site actually uses) validates all of them.

This is adjacent to R15's G-6 (docs-links double-counts `.generated/`). The fix is the same family: the docs-links sensor needs to understand Docusaurus site-absolute URL convention (a leading `/docs/` is site-root, not filesystem-relative), OR exclude the synced package READMEs whose absolute links are validated by the Docusaurus build instead.

**Disposition:** R16 closes on the **authoritative measure** (Docusaurus build clean for all new cross-refs). The devai sensor's raw +201 is documented as a known false-positive class, not a real regression. Per Decision 6 the gate target was "non-positive overall"; the _real_ (Docusaurus-validated) broken-link delta from R16's cross-references is **zero**.

### G16-2 (MEDIUM) — `verify-package-doc-coverage` can't traverse barrel re-exports

The W01-authored `verify-package-doc-coverage.mjs` uses a naive parser that doesn't follow `export * from './x'` barrel re-exports. Every `@stynx-nyx/*` package uses barrel `index.ts` files, so the script sees 0 detected exports and flags every README-cited symbol as "stale" (`hard_fail_count: 39`). This is documented noise — the binding gate is `check-package-doc-shape` (which passed 41/41). A more robust version would use the TypeScript compiler API to resolve barrel re-exports.

**Disposition:** non-blocking; the doc-coverage script was always a soft signal (W01 log). A future round could upgrade it to TS-compiler-API resolution.

### G16-3 (LOW) — sync mirror landed once, picks up later waves automatically

The `sync-content.mjs` extension for `packages/backend/docs/` + `packages/flow/docs/` was authored once in W02 and correctly picked up pages dropped by W03/W04 (backend) and W05 (flow) without further changes. This worked as designed — noting it as a _positive_ pattern for future subtree-bearing rounds.

## Decisions A–H — final disposition

| Decision                      | Disposition                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| A — family-specific audience  | Landed. Backend/web/tools pitches distinct + consistent.                              |
| B — template + adaptive depth | Landed. 41/41 template-conformant; tiers matched surface size.                        |
| C — API surface as tables     | Landed. Every package's surface is tabular, linked to TypeDoc.                        |
| D — TypeDoc as symbol source  | Landed. READMEs enumerate + describe; symbol detail deferred to TypeDoc.              |
| E — docs/ subtree split       | Landed. `backend` (modularity-driven, 10 pages) + `flow` (size-driven, 10 pages).     |
| F — cross-link style          | Landed as absolute-from-root. Correct for Docusaurus; trips the devai sensor (G16-1). |
| G — autonomous within bounds  | Worked. 10 waves executed with periodic operator check-ins, no per-wave gates.        |
| H — single publish at W10     | Honoured. No per-wave publishes; one live publish at close.                           |

## Numbers

| Metric                                                   | Before R16   | After R16                                                                    |
| -------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `check-package-doc-shape` clean                          | 0/41         | **41/41**                                                                    |
| Backend `@stynx-nyx/*` documented                            | stubs        | 24/24 + 10 `backend/docs/` submodule pages                                   |
| Web `@stynx-web/*` documented                            | stubs        | 13/13                                                                        |
| Tools `@stynx-internal/*` documented                     | stubs        | 4/4                                                                          |
| `@stynx-nyx/flow` README                                     | 92-line stub | 138-line entrypoint + 10-page `docs/` subtree (20 controllers / ~113 routes) |
| `check-docs-governance`                                  | pass 14/14   | pass 14/14 (unchanged)                                                       |
| Docusaurus build                                         | SUCCESS      | SUCCESS (clean for all new cross-refs)                                       |
| `docs-links` (devai sensor, raw)                         | 219          | 420 (+201 = Decision-F absolute-URL false-positives per G16-1)               |
| `docs-links` (Docusaurus, authoritative, new cross-refs) | n/a          | 0 broken                                                                     |
| New authored lines                                       | —            | ~6,000 across 41 READMEs + 20 subtree pages                                  |

## Recommendation for PEC / SGP / TEAT (next adopters)

If you run a similar package-deepening round:

1. **Lock a README template first (a W01-equivalent).** The consistency payoff across dozens of packages is large.
2. **Author a `check-package-doc-shape`-equivalent gate.** A regex over mandatory `## ` headings is cheap and catches all drift.
3. **Use absolute-from-root cross-links for Docusaurus** — but know the devai `docs-links` sensor will false-positive on them (G16-1). Measure broken links via the Docusaurus build, not the devai sensor, for site-absolute URLs.
4. **Split large packages by readability, not just modularity.** Flow's 20-controller README would have been unusable flat; the domain-grouped subtree is navigable. State explicitly when a split is editorial vs architectural so integrators don't mis-mount.
5. **Distribute submodule-page authoring across the waves where the underlying package is documented** (Option B) — keeps cross-links backward-only.

## Closing

R16 closed `clean` on the authoritative measures: 41/41 doc-shape, `check-docs-governance` pass 14/14, Docusaurus build SUCCESS with zero new real broken links, live publish to `gh-pages`. The single documented wrinkle (G16-1, the devai docs-links sensor false-positive on Docusaurus absolute URLs) is a sensor limitation, not a content regression — the published site renders every cross-reference correctly.

Author: AI agent operating on STYNX during R16 wall-clock execution 2026-06-05.
