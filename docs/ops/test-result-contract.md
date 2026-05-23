# Test-result contract — operator + adopter reference

> **Status:** R0–R5 landed. **Single source of truth** for every test surface
> in stynx. Schema: `tools/repo-config/test-result.schema.json`.

This doc is the orientation guide for anyone consuming test results in
stynx — humans reading the matrix, CI jobs uploading artifacts, DEVAI
sensors gating on signal, or future levels added to the contract.

## TL;DR

Test invocation is split by responsibility:

- Package-owned `test`, `test:int`, `test:e2e`, and `stryker` scripts invoke
  their runner directly.
- Workspace evidence commands invoke DEVAI directly:
  `devai record-run`, `devai render-matrix`, `devai evidence-emit`, and
  `devai coverage-aggregate`.

DEVAI-owned record commands write artifacts under `.devai/state/test-results/`
unless an explicit output path is supplied:

```
.devai/state/test-results/<scope>/<tier>.json
```

All consumers read from there.

## Schema (v1)

Full schema in `tools/repo-config/test-result.schema.json`.
The shape, abbreviated:

```jsonc
{
  "schemaVersion": "1",
  "package": "@stynx/auth",
  "level": "unit | integration | e2e | mutation | perf | coverage | smoke",
  "runner": "vitest | stryker-vitest | perf-smoke | rls-smoke | node-test",
  "runnerVersion": "3.2.4",
  "status": "passed | failed | skipped | no-run | error",
  "startedAt": "...", "endedAt": "...", "durationMs": 1234,
  "exitCode": 0, "signal": null,
  "totals":   { "files": 12, "tests": 156, "passed": 156, "failed": 0, "skipped": 0, "todo": 0 },
  "metric":   {
    "kind": "none | score | coverage | perf",
    "score": 83.33,                                       // mutation
    "coverage": { "lines": 100, "branches": 100, ... },   // coverage
    "perf":     { "p50Ms": 792, "p95Ms": 891, "rps": 1.26 },
    "thresholds": { "high": 60, "low": 60, "break": 60 }
  },
  "slowestTests": [{ "name": "...", "file": "...", "durationMs": 1.96 }],
  "artifacts": { "raw": ".test-results/unit.log", "junit": ".test-results/unit.junit.xml" },
  "env": { "node": "26.0.0", "ci": false, "branch": "...", "commit": "..." },
  "command": { "argv": [...], "cwd": "..." }
}
```

`metric.kind` selects which sibling sub-object is populated. Readers
should defer to `metric.kind` and ignore the others.

## Per-level cheat sheet

| Level         | Runner                     | `metric.kind` | Test count?      | Slow-test list? |
| ------------- | -------------------------- | ------------- | ---------------- | --------------- |
| `unit`        | `vitest` / `node-test`     | `none`        | yes              | yes (vitest)    |
| `integration` | `vitest`                   | `none`        | yes              | yes             |
| `e2e`         | `vitest`                   | `none`        | yes              | yes             |
| `mutation`    | `stryker-vitest`           | `score`       | mutants as tests | —               |
| `coverage`    | `devai coverage-aggregate` | `coverage`    | —                | —               |
| `perf`        | `perf-smoke`               | `perf`        | —                | —               |
| `smoke`       | `rls-smoke`                | `none`        | —                | —               |

## Matrix display semantics

`pnpm test:matrix*` renders package-owned obligations only. Reusable
packages intentionally rely on the reference applications for E2E
coverage, so only `@stynx/reference-api` and `@stynx/reference-web`
are expected to show E2E pass/fail cells.

Cell markers mean:

- Blank: intentionally not applicable for that package and level.
- `-`: no package script/config exists, and the level is not currently
  an obligation for that package.
- `0`: the level is applicable/configured, but no current canonical
  artifact exists.
- `FAIL`: a current artifact exists and did not pass.

The marker legend is hidden by default; pass `--legend` when an
operator-facing run should print it. Mutation status cells append the
assigned threshold tier to the rounded score: `¹` for default,
`²` for strict, and `³` for strictest. Colored output also assigns a
distinct ANSI color to each tier marker.

Perf is not a package column. Current perf evidence is a single
workspace benchmark (`stynx-workspace/.test-results/perf.json`) and is
rendered as a global summary after the status/timing matrix.

## Threshold source of truth

`scripts/test-matrix.config.json` carries every
coverage + mutation threshold the workspace uses. Two local consumers read
it through `tools/repo-config/test-thresholds.mjs`:

- `tools/repo-config/vitest.base.mjs` — `getCoverageThreshold(packageName)`
- `tools/stryker/base.mjs` — `getMutationThreshold(packageName)`

Schema:

```jsonc
{
  "policies": {
    "coverage": { "default": {...}, "strict": {...}, "complete": {...}, "off": {...} },
    "mutation": { "default": 60, "strict": 80, "strictest": 85 },
    "perf": { "default": { "p50_ms": 5000, "p95_ms": 9000, "rps_min": 0.2 } }
  },
  "defaults":  { "coverage": "complete", "mutation": "default", "perf": "default" },
  "perPackage": {
    "@stynx/auth":    { "mutation": "strictest" },
    "@stynx/data":    { "mutation": "strictest" },
    "@stynx/tenancy": { "mutation": "strict" }
  }
}
```

Per-package override values can be a literal number (`{"mutation": 75}`)
or a named policy (`{"mutation": "strict"}`); literal numbers win.

## Consumers (current)

| Consumer                                           | Reads                                           | Notes                                    |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `pnpm test:matrix*` / `devai render-matrix`        | `.devai/state/test-results/**`                  | Canonical DEVAI matrix rendering.        |
| `pnpm test:evidence` / `devai evidence-emit`       | `.devai/state/evidence-chain.json`              | Appends evidence-chain records.          |
| `pnpm test:coverage`                               | per-target `coverage-final.json` under coverage | Uses `devai coverage-aggregate`.         |
| GitHub Actions (`.github/workflows/ci.yml`)        | runner output and uploaded artifacts            | CI remains responsible for UI summaries. |
| GitHub Actions (`.github/workflows/hardening.yml`) | mutation runner output and artifacts            | Per-package mutation evidence.           |

## DEVAI sensor integration

DEVAI's test sensors (`test.unit`, `test.integration`, `test.coverage-depth`,
`test.idiomaticity`, `test.security-coverage`, `test.weakening-review`,
`test.coherence`, `perf-test`) historically re-invoke `pnpm test` and
parse stdout. They should instead read `coverage/test-evidence.json`:

```js
// example sensor adapter
import { readFileSync } from 'node:fs';
const evidence = JSON.parse(readFileSync('coverage/test-evidence.json', 'utf8'));
const unit = evidence.levels.unit;
return {
  status: unit.packagesFailed === 0 ? 'pass' : 'fail',
  metrics: {
    tests_total: unit.tests,
    tests_passed: unit.testsPassed,
    tests_failed: unit.testsFailed,
    wall_ms: unit.wallMs,
  },
};
```

Stynx exposes the evidence file as a stable contract. Whether DEVAI's
upstream actually consumes it is up to DEVAI's maintainers (Article 6:
DEVAI authoring is outside stynx's substrates). When DEVAI migrates,
stynx's per-test-run `devai sense-*` invocations become read-only —
they parse the artifact, never re-run the suite.

## Adding a new level or runner

1. **Schema:** add the level/runner to the `enum`s in
   `test-result.schema.json`. Bump `schemaVersion` if any required field
   changes shape (semver-major for the artifact).
2. **Runner:** add or update the package script that invokes the runner.
3. **Renderer:** if the level should appear in the matrix, extend the DEVAI
   matrix config/reader rather than adding a local STYNX wrapper. Keep
   global-only levels like perf outside the per-package column list.
4. **Thresholds:** if the level has a pass/fail metric, add a `policies.<level>`
   block in `scripts/test-matrix.config.json` and a `get<Level>Threshold`
   helper in `test-thresholds.mjs`.
5. **Tests:** spike on one package end-to-end before fanning out.

## File index

| File                                        | Role                                          |
| ------------------------------------------- | --------------------------------------------- |
| `tools/repo-config/test-result.schema.json` | canonical artifact schema (v1)                |
| `scripts/test-matrix.config.json`           | thresholds + matrix-renderer config           |
| `tools/repo-config/test-thresholds.mjs`     | single-source threshold resolver              |
| `tools/repo-config/vitest.base.mjs`         | vitest factory; reads `getCoverageThreshold`  |
| `tools/stryker/base.mjs`                    | stryker factory; reads `getMutationThreshold` |
| `.github/workflows/ci.yml`                  | unit + integration artifact handling          |
| `.github/workflows/hardening.yml`           | mutation artifact handling                    |

## Versioning

- **Schema major bumps** (`schemaVersion: "2"`): readers must reject and
  warn. Plan: keep both versions reachable for one release cycle.
- **Schema minor additions** (new optional fields): readers should ignore
  unknown fields. Producers may emit additively without bumping.
- DEVAI owns run recording, matrix rendering, evidence emission, and coverage
  aggregation. STYNX package scripts should not reintroduce local compatibility
  wrappers for those commands.
