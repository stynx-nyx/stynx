---
adr_id: ADR-PERF-0002
title: Prospective local HTTP baseline bootstrap and mandatory comparison
status: accepted
date: 2026-10-11
authors: ['Architect']
tags: [performance, baseline, evidence, release]
---

# ADR-PERF-0002 — Local HTTP baseline bootstrap

## Authority and scope

The Owner explicitly approved one complete non-promoting bootstrap run for the
newly required local HTTP profile, followed by a separately created complete
comparison run. This narrowly amends the lineage eligibility and first-seed
predicate in [ADR-PERF-0001 decision 6](2026-10-10-http-performance-evidence.md)
for that local profile only. Known successful main history remains a fact.
No historical observation, artifact, receipt or proof-chain prefix is changed.
The existing hardening selector and comparisons remain required and unchanged.

## Prospective local lineage

1. Define independent local predecessors by exact scenario/profile, workload,
   threshold, source and toolchain equivalence. Before any bootstrap effect,
   bind the designated candidate/tree, all four scenario profiles, complete
   population, task, controls, native/toolchain identities and source closure.
   Publish the prospective designation in append-only evidence. A caller's
   baseline array, path or self-authored receipt supplies no designation or
   authenticated custody.
2. Permit exactly one prospectively designated complete local bootstrap capture.
   It executes auth, crud, upload and cascade-delete on genuinely fresh owned
   stacks, at every unchanged local rate, duration and VU setting. Require all
   absolute scenario/component gates, accepted 50 ms presign gate, reference
   floors, complete raw/native/source/effect evidence and successful cleanup.
   Required complete endpoint qualification and every other release gate remain
   independently required. Shortened, partial, cached or stitched runs cannot
   supply the bootstrap.
3. Bootstrap regression-to-predecessor is explicitly `NOT_EVALUABLE`.
   `readiness_promoting=false` remains mandatory. A complete accepted bootstrap
   is never a passing mandatory k6 release check, certification or publication
   permission. Preserve all failed or incomplete attempts; do not replace the
   designated identity or choose a fastest/best run. Failure does not authorize
   another designation. Any recovery needs an explicit reviewed disposition.
4. Only after independent acceptance and immutable public retention may that
   designated bootstrap become the seed predecessor for a later, separately
   created complete local comparison run. Bind the seed identity before creating
   the comparison. Enforce authenticated complete discovery, exact execution
   attempt, fixed original-created cutoff and strictly earlier completion.
   Bootstrap and comparison cannot be two views of the same execution.
5. The second complete local run must pass the unchanged dual-tail comparison:
   both p95 and p99 exceed their effective predecessor by both more than 10%
   and more than 1 ms to count as degraded. Each effective tail baseline remains
   `max(seed tail, committed reference floor)`. Preserve required finite metric
   values and all absolute gates. No missing predecessor, unusable metric or
   bootstrap result supplies a synthetic PASS.
6. For subsequent local comparisons, select the latest prior eligible successful
   complete local comparison by original creation time and run ID, with completed
   custody strictly before the current original-created cutoff. Use the unique
   designated seed only while no earlier eligible complete local comparison
   exists. Select before checking artifact availability. Missing/expired
   artifacts, unresolved reruns, equal-second order or incomplete discovery
   refuse; none permits an older substitute or new bootstrap.

## Hardening and implementation boundary

Hardening continues to use ADR-PERF-0001's existing authenticated previous
successful main selection. A recovered legacy hardening archive retains its
actual profile, thresholds and custody limitations. Its historical 500 ms
presign gate is never relabeled as 50 ms, complete endpoint evidence or local
history. Any limited numeric compatibility acceptance requires independent
review and does not replace current native, absolute or endpoint gates.

Engineer must implement the closed policy/schema, exact selector and source-used
admission contract; Inspector must verify the new eligibility, ordering and
refusal paths independently. Architect reviews and binds those artifacts before
actuation. This decision itself grants no runtime admission, executed bootstrap,
baseline compatibility, qualified evidence or passing scorecard. Preserve all
existing thresholds, history, hardening comparisons and ordinary release gates.
