---
adr_id: ADR-HARDENING-0001
title: k6 baseline comparison on p95 and p99 with reference floors
status: accepted
date: 2026-09-12
authors: ['Architect']
tags: [stynx, hardening, k6, release, evidence]
---

# ADR-HARDENING-0001 — k6 baseline comparison on p95 and p99 with reference floors

**Status:** Accepted.
**Authority:** Architect, on the Owner's 2026-09-12 direction to revise the k6
gate after it blocked the 1.3.0 publication twice without a code regression.

## Context

`test/perf/k6/check-summary.mjs` is a publication precondition: the release
workflow's `verify-missing-evidence.mjs` requires a successful `k6` check-run on
the exact candidate SHA, and the hardening workflow produces that check-run only
if the comparison against the previous successful `main` run passes.

Until this decision the comparison used a single statistic per tracked metric:
p99 more than 10% above the previous run and more than 1 ms above it failed the
run. Two properties of that rule surfaced on 2026-09-12:

- **p99 on a few hundred samples is a tail estimate, not a level.** The
  `storage_presign_duration_ms` metric (a Postgres insert transaction plus an
  AWS SDK presign, steady p99 ≈ 10.5 ms since 2026-08-31) produced p99 values of
  117.8 ms and 35.6 ms on two consecutive runs of the same candidate while the
  median stayed at 5–6 ms and p95 at 8 ms. A CI bisect over five intermediate
  `main` commits (runs 34686870277, 34686872653, 34687241433, 34687242798, 34687244308) showed the spike on a commit that changes only Angular library
  sources and clean 10.1–10.9 ms results on later commits that change the
  request path, so the tail movement was environmental. The third run of the
  candidate (34687645676) passed at 8.2 ms.
- **The baseline is a downward ratchet.** The comparison baseline is whatever
  the last successful run produced. That passing run's unusually fast p99
  (8.2 ms, p95 4.9 ms) would have become the bar for the next release, which
  the documented steady state of 10–11 ms could not meet.

## Decision

1. **Two statistics, both required.** A tracked metric is degraded only when
   _both_ its p95 and its p99 exceed the effective baseline by more than the
   relative tolerance (default 10%, `STYNX_K6_BASELINE_MAX_RELATIVE_INCREASE_PERCENT`)
   _and_ by more than the absolute floor (default 1 ms,
   `STYNX_K6_BASELINE_MIN_ABSOLUTE_INCREASE_MS`). A shift of the whole
   distribution still fails (the 117.8 ms run, whose p95 was 22.8 ms, fails
   under this rule); a tail-only excursion with an unchanged p95 does not.
2. **Reference floors against the ratchet.** `test/perf/k6/baseline-reference.json`
   carries Architect-owned p95/p99 floors per tracked metric, taken as the
   maxima of the stable runs of 2026-08-31, 2026-09-07 and 2026-09-11. The
   effective baseline for each statistic is `max(previous successful run,
reference floor)`. The file is advanced deliberately, with the run ids that
   justify the new values, when the steady state changes; it is never lowered
   by a passing run.
3. **The scenarios' own thresholds remain the hard line.** `p(99)<50` on the
   presign metric and the other per-scenario k6 thresholds are enforced by the
   k6 exit code before the comparison runs and are unchanged by this decision.
4. **Workflow unchanged.** The hardening workflow keeps downloading the previous
   successful `main` artifact and calling the same command; the rule lives in
   the Inspector-owned comparison script and its tests
   (`test/scripts/k6-check-summary.test.mjs`).

## Consequences

- A publication candidate is no longer blocked by a single-sample tail
  excursion, and a lucky run cannot make the next healthy run fail.
- Genuine regressions that move the distribution (p95 and p99 together) still
  fail closed with the same tolerance as before.
- Re-dispatching the hardening workflow after a failure is legitimate only with
  evidence that the excursion is environmental (medians unchanged, or a bisect
  as above); the bisect procedure is recorded in the hardening README.
- The reference floors document the steady state explicitly; a change to them
  is an Architect decision recorded in the file's `observed_runs`.

## Known limits

- The comparison still relies on a single previous run for the "observed"
  side; a rolling window over several successful runs would be more robust and
  needs a workflow change (multiple artifact downloads) with its own receipt.
- The sub-millisecond overhead metrics are effectively governed by the 1 ms
  absolute floor, as before; their relative tolerance only matters above it.
