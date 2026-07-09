# Pre-cutover baselines — Vitest migration

Captured 2026-05-18, before V6 cutover. Used to validate that the swap from
`@stryker-mutator/jest-runner` to `@stryker-mutator/vitest-runner` and the
removal of Jest doesn't regress mutation scores or test counts.

## Mutation baselines

Source: pre-existing `packages/<name>/reports/mutation/mutation.json` files
(Stryker's last run on `jest-runner`). Summary in
[`mutation/summary.json`](mutation/summary.json). Full reports per package in
[`mutation/`](mutation/).

| Package                      | Total mutants | Killed | Survived | Timeout | CompileError | NoCoverage | Mutation score |
| ---------------------------- | ------------- | ------ | -------- | ------- | ------------ | ---------- | -------------- |
| `@stynx-nyx/contracts`           | 9             | 5      | 1        | 0       | 3            | 0          | **83.33%**     |
| `@stynx-nyx/core`                | 297           | 113    | 59       | 5       | 115          | 5          | **66.67%**     |
| `@stynx-nyx/audit`               | 539           | 244    | 112      | 0       | 145          | 38         | **68.54%**     |
| `@stynx-web/angular-tenancy` | 132           | 55     | 22       | 0       | 55           | 0          | **71.43%**     |

> Only four packages had reports on disk pre-cutover. The remaining 17
> Stryker-configured packages will be measured post-cutover; their first
> Vitest-runner run becomes the baseline for any future comparison.

## Test count baselines

- [`parity-unit-pre-cutover.json`](parity-unit-pre-cutover.json) — 34/34 unit packages, full PARITY.
- [`parity-int-pre-cutover.json`](parity-int-pre-cutover.json) — 14/14 integration packages, full PARITY.

The parity script itself disappears at cutover; these files are the historical
snapshot. Aggregate counts (from a 2026-05-18 sweep):

| Lane        | Packages | Test cases                                                     |
| ----------- | -------- | -------------------------------------------------------------- |
| Unit        | 34       | 1,034 (sum across `packages/*` + `packages-web/*` + auxiliary) |
| Integration | 14       | 57                                                             |

## Acceptance protocol (post-cutover)

1. Re-run Stryker against the four baseline packages on `vitest-runner`. Mutation
   score should remain within **±5 percentage points** of the values above.
2. Run `pnpm test` and `pnpm test:int` (now Vitest under the hood). Test counts
   must match the snapshot — any drop is a regression unless attributable to a
   knowingly-removed spec.
3. If any baseline drifts beyond ±5 pp, raise it to Inspector before merging
   the cutover PR.
