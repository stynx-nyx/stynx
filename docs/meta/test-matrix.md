---
title: Test matrix
sidebar_position: 2
last_built_at: 2026-06-05T00:00:00.000Z
---

# Test matrix

> DEVAI's six test suites at last sensor sweep. Each suite probes the plant at a different level; together they cover the framework's regulation surface. See [test policy](../framework/test-policy.md) for the policy framing.

| Suite           | Config                         | Files | Tests | Stage            | Probes                                                        |
| --------------- | ------------------------------ | ----- | ----- | ---------------- | ------------------------------------------------------------- |
| **unit**        | `vitest.config.ts`             | 0     | 0     | Cycle A + B      | Per-package logic. In-process, no DB.                         |
| **integration** | `vitest.integration.config.ts` | 0     | 0     | Cycle B          | DB-gated subprocess tests walking the CLI surface end-to-end. |
| **regression**  | `vitest.regression.config.ts`  | 0     | 0     | Cycle C          | Anchored past-defect scenarios. Never deleted.                |
| **e2e**         | `vitest.e2e.config.ts`         | 0     | 0     | Cycle C          | Full-flow brownfield-loop scenarios.                          |
| **smoke**       | `vitest.smoke.config.ts`       | 0     | 0     | Earliest CI step | Environment + bin resolution baseline.                        |
| **contract**    | `vitest.contract.config.ts`    | 0     | 0     | Cycle B          | JSON Schema instance validation.                              |

**Totals:** 0 test files · 0 test blocks across six suites.

## See also

- [Test policy](../framework/test-policy.md) — canonical reference: suite definitions, weakening, quarantine, coverage policy, per-batch verification.
- [Self-scorecard](self-scorecard.md) — DEVAI's own substrate × transversal verdicts.
