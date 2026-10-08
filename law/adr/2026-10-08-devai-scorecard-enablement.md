---
adr_id: ADR-DEVAI-ADOPTION-0014
title: Enable the DEVAI scorecard sensors for STYNX
status: accepted
date: 2026-10-08
authors: ['Architect']
tags: [stynx, devai, scorecard, governance]
---

# ADR-DEVAI-ADOPTION-0014 — Enable the DEVAI scorecard sensors

**Status:** Accepted.
**Authority:** Architect, under the Owner's 2026-10-08 direction that the
next published version ships with a measured scorecard carrying as many PASS
cells and as few FAIL cells as the repository can earn without product-code
churn (Owner decision D3 of the adoption plan recorded in
`ADR-DEVAI-ADOPTION-0013`).
**Amends:** the `scorecard_na` declaration of `law/policy/devai-adoption.json`
(policy 1.4.0 → 1.5.0).

## Context

Every committed STYNX scorecard observation (`c3a1c70d`, 2026-09-28, and the
three before it) reads 44 UNKNOWN cells and 1 N/A. The cause is structural:
STYNX declares no `.devai/config/sensor-inputs.json`, records no sensor
readings, and the main-observation workflow only re-observes recorded
readings. DEVAI's own self-scorecard campaign went from 43 UNKNOWN to 36 PASS
by declaring inputs, authoring the spec substrate the F1 sensors read, and
recording a sweep before each observation.

At DEVAI 2.3.0 the sensor registry binds no sensor to F1:T1 (Spec x Contract
validation), and the package N/A default only names F4:T5. No `init` command
materializes `sensor-inputs.json`; the adopter authors it against
`law/schemas/sensor-inputs.schema.json`.

## Decision

1. **Sensor inputs.** `.devai/config/sensor-inputs.json` declares, in this
   order: `spec_depth` over `law/adr` and `law/invariants`; the four
   test-corpus sensors over `packages/*/test`, `packages-web/*/test` and
   `test`; `plant_depth` excluding the generated SDK client;
   `harness_idiomaticity` with the five-workflow floor; and the three harness
   populations on the `ci.yml` pull-request gate against `main` (30 days,
   minimum samples 20/10/20), with `harness_green_main` counting each pull
   request once on its final head (`outcomeUnit: pull-request-final-head`,
   DEVAI ADR-SCR-0014). Surfaces are HTTP, database and RBAC present, actions
   absent.
2. **N/A ledger.** The adopter policy declares F1:T1 not applicable, anchored
   to Article 5, beside the package default F4:T5. The declaration is retired
   when DEVAI ships an F1:T1 emitter.
3. **Targets.** `law/targets/performance.json` and `law/targets/robustness.json`
   (DEVAI ADR-SCR-0004 layout) bind the pull-request gate wall time (median
   ≤ 900 s, p95 ≤ 1800 s), the perf smoke policy (p50 ≤ 5000 ms, p95 ≤ 9000
   ms from `tools/repo-config/test-policy.json`), the rerun rate (≤ 5 %), the
   final-head success rate (≥ 95 %) and the error-contract obligation of
   `INV-ERROR-001`.
4. **Deferred.** `unit_test`, `integration_test`, `e2e_test` and
   `test_coverage_depth` need one governed root vitest invocation and a bound
   coverage population; `type_check` and `perf_test` need an argv the
   subprocess broker admits (`npx` or `node`, never a `pnpm` script) over a
   root project that type-checks the whole workspace, which the per-package
   `tsconfig.json` files do not compose into today. They stay undeclared, so
   F2:T7, F2:T8, F3:T1 and F3:T2 read UNKNOWN until a later decision.
   `migration_check` is run only with a database at hand. The
   generator-owned `devai-main-observation.yml` carries no concurrency group
   and the two generated workflows pin different action versions, so
   `harness_coherence` (F5:T3) stays a finding reported upstream rather than
   hand-edited.
5. **Spec substrate alignment.** The invariants use the schema's `type`
   enum (the four CLI invariants become `validation`, `data_contract`,
   `rbac` and `rls`), their `scope.code_areas` are globs, the umbrella
   `INV-CORE-001` claims every `src` tree generically, the domain taxonomy
   admits `CLI`, `OFFLINE` and `TENANCY`, and the five trace tests that run
   through `test/packages/cli-generator/run-integration.mjs` declare
   `target_type: file`. The root `eslint.config.mjs` ignores the
   CLI-generated demo module and relaxes `ban-ts-comment` for test files, in
   step with the package gates.
6. **Recording protocol.** Before each observation an Inspector records, at a
   clean HEAD: `inventory_regeneration`, the `sweep` preset for the active
   round, the second-pass sensors, then `audit observe --at <sha>`. Readings,
   the chain and the observation bundle are committed as evidence of that
   exact commit, as the existing observations under
   `.devai/state/audit-observations/` are.

## Consequences

- The next observation measures every cell a declared sensor feeds; cells
  whose sensors need the deferred inputs stay UNKNOWN and are named in the
  release notes.
- `scorecard-na.json` is rematerialized by the adopter-policy bind; the
  adoption contract test pins both cells.
- Harness cells depend on the live GitHub population; a sample below the
  declared minimum reads UNKNOWN rather than PASS.
