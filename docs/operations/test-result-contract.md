# Test-result contract — operator + adopter reference

> **Status:** R0–R5 landed. **Single source of truth** for every test surface
> in stynx. Schema: `tools/repo-config/test-result.schema.json`.

This doc is the orientation guide for anyone consuming test results in
stynx — humans reading the matrix, CI jobs uploading artifacts, DEVAI
sensors gating on signal, or future levels added to the contract.

## TL;DR

Every test invocation (unit, integration, e2e, mutation, perf, coverage,
smoke) goes through one wrapper:

```
node scripts/run-and-record.mjs \
  --package <name> --level <level> --runner <runner> \
  -- <runner command and args>
```

And writes one artifact:

```
<packageDir>/.test-results/<level>.json
<packageDir>/.test-results/<level>.log
<packageDir>/.test-results/<level>.junit.xml   # vitest only, on by default
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

| Level         | Runner                                | `metric.kind` | Test count?      | Slow-test list? |
| ------------- | ------------------------------------- | ------------- | ---------------- | --------------- |
| `unit`        | `vitest` / `node-test`                | `none`        | yes              | yes (vitest)    |
| `integration` | `vitest`                              | `none`        | yes              | yes             |
| `e2e`         | `vitest`                              | `none`        | yes              | yes             |
| `mutation`    | `stryker-vitest`                      | `score`       | mutants as tests | —               |
| `coverage`    | `vitest` (via aggregate-coverage.mjs) | `coverage`    | —                | —               |
| `perf`        | `perf-smoke`                          | `perf`        | —                | —               |
| `smoke`       | `rls-smoke`                           | `none`        | —                | —               |

## Threshold source of truth

`scripts/test-matrix.config.json` carries every
coverage + mutation threshold the workspace uses. Three consumers read
it through `tools/repo-config/test-thresholds.mjs`:

- `tools/repo-config/vitest.base.mjs` — `getCoverageThreshold(packageName)`
- `tools/stryker/base.mjs` — `getMutationThreshold(packageName)`
- `scripts/render-test-matrix.mjs` — `getMatrixCoverageThreshold()`

Schema:

```jsonc
{
  "policies": {
    "coverage": { "default": {...}, "strict": {...}, "complete": {...}, "off": {...} },
    "mutation": { "default": 60, "strict": 80, "strictest": 85 }
  },
  "defaults":  { "coverage": "complete", "mutation": "default" },
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

| Consumer                                                | Reads                                                                             | Notes                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm test:matrix*` (`scripts/render-test-matrix.mjs`)  | every `.test-results/<level>.json`                                                | canonical-only as of R3                                                              |
| `pnpm test:evidence` (`scripts/test-evidence.mjs`)      | every `.test-results/<level>.json`                                                | aggregates into `coverage/test-evidence.json` for downstream graders / DEVAI sensors |
| `pnpm test:coverage` (`scripts/aggregate-coverage.mjs`) | per-target `coverage-vitest/coverage-final.json`                                  | also writes canonical `<pkg>/.test-results/coverage.json`                            |
| GitHub Actions (`.github/workflows/ci.yml`)             | `.test-results/**` via `actions/upload-artifact` + `mikepenz/action-junit-report` | uploads + JUnit summary in GH UI                                                     |
| GitHub Actions (`.github/workflows/hardening.yml`)      | `.test-results/mutation.{json,log}` + legacy `reports/mutation/<pkg>/`            | per-package mutation artifacts                                                       |

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
2. **Wrapper:** add a `enrichFrom<NewRunner>(artifact, ...)` function in
   `scripts/run-and-record.mjs` and route to it from the runner switch.
3. **Renderer:** if the level should appear in the matrix, extend
   `scripts/render-test-matrix.mjs`'s level list + `readCanonicalResult`.
4. **Thresholds:** if the level has a pass/fail metric, add a `policies.<level>`
   block in `scripts/test-matrix.config.json` and a `get<Level>Threshold`
   helper in `test-thresholds.mjs`.
5. **Tests:** spike on one package end-to-end before fanning out.

## File index

| File                                        | Role                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `tools/repo-config/test-result.schema.json` | canonical artifact schema (v1)                     |
| `scripts/run-and-record.mjs`                | the wrapper                                        |
| `scripts/test-evidence.mjs`                 | workspace-level evidence aggregator                |
| `scripts/aggregate-coverage.mjs`            | coverage rolling + per-package canonical writer    |
| `scripts/render-test-matrix.mjs`            | terminal-table renderer                            |
| `scripts/test-matrix.config.json`           | thresholds + matrix-renderer config                |
| `tools/repo-config/test-thresholds.mjs`     | single-source threshold resolver                   |
| `tools/repo-config/vitest.base.mjs`         | vitest factory; reads `getCoverageThreshold`       |
| `tools/stryker/base.mjs`                    | stryker factory; reads `getMutationThreshold`      |
| `.github/workflows/ci.yml`                  | unit + integration artifact upload + JUnit summary |
| `.github/workflows/hardening.yml`           | mutation artifact upload                           |

## Versioning

- **Schema major bumps** (`schemaVersion: "2"`): readers must reject and
  warn. Plan: keep both versions reachable for one release cycle.
- **Schema minor additions** (new optional fields): readers should ignore
  unknown fields. Producers may emit additively without bumping.
- **Wrapper / aggregator** are not part of the public contract — they may
  refactor freely as long as the on-disk artifacts conform.
