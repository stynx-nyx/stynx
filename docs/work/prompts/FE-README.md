# Prompt Pack — Frontend Completeness Programme

**Compiled:** 2026-05-19
**Reads:** [../inv/FE-\*](../inv/), [../diag/FE-\*](../diag/), [../plan/FE-\*](../plan/).
**Writes:** an orchestrator prompt + one worker prompt per wave (FE-A through FE-H), to be executed against a fresh agent runtime (Claude Code, OpenAI Codex CLI, DEVAI orchestrator).

## Pre-existing pack on disk (NOT touched)

The testing-pipeline pack already exists in this directory and remains canonical for its own programme:

- [00-ORCHESTRATOR.md](00-ORCHESTRATOR.md)
- [01-WORKER-W0-baseline.md](01-WORKER-W0-baseline.md) … [09-WORKER-W7-cleanup.md](09-WORKER-W7-cleanup.md)

This pass adds **only** files prefixed `FE-`.

## Files in this pack

| File                                                                         | Role                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [FE-00-ORCHESTRATOR.md](FE-00-ORCHESTRATOR.md)                               | Lead agent. Reads the FE plan, sequences FE waves, supervises FE workers.   |
| [FE-LIFTUP-00-ORCHESTRATOR.md](FE-LIFTUP-00-ORCHESTRATOR.md)                 | Recovery orchestrator for the interrupted FE lift-up session.               |
| [FE-LIFTUP-01-WORKER-stabilize-evidence.md](FE-LIFTUP-01-WORKER-stabilize-evidence.md) | Recovery worker for checkout cleanup and evidence regeneration. |
| [FE-LIFTUP-02-WORKER-feature-closure.md](FE-LIFTUP-02-WORKER-feature-closure.md) | Recovery worker for remaining FE-C/FE-D/FE-E/FE-F feature slices.      |
| [FE-LIFTUP-03-WORKER-test-fanout.md](FE-LIFTUP-03-WORKER-test-fanout.md)     | Recovery worker for FE-G rolling test fan-out.                              |
| [FE-01-WORKER-A-public-surface.md](FE-01-WORKER-A-public-surface.md)         | Wave FE-A: standards + packaging baseline.                                  |
| [FE-02-WORKER-B-iam-admin.md](FE-02-WORKER-B-iam-admin.md)                   | Wave FE-B: `@stynx-web/angular-iam`.                                        |
| [FE-03-WORKER-C-profile-sessions.md](FE-03-WORKER-C-profile-sessions.md)     | Wave FE-C: profile rewrite + sessions polish.                               |
| [FE-04-WORKER-D-storage-trash-i18n.md](FE-04-WORKER-D-storage-trash-i18n.md) | Wave FE-D: storage + trash + i18n end-to-end.                               |
| [FE-05-WORKER-E-tenancy-audit.md](FE-05-WORKER-E-tenancy-audit.md)           | Wave FE-E: tenancy polish + `@stynx-web/angular-audit`.                     |
| [FE-06-WORKER-F-flow-installable.md](FE-06-WORKER-F-flow-installable.md)     | Wave FE-F: `@stynx-web/angular-flow` 1.0 polish.                            |
| [FE-07-WORKER-G-test-fan-out.md](FE-07-WORKER-G-test-fan-out.md)             | Wave FE-G: TestBed migration + Playwright fan-out + a11y + mutation rebase. |
| [FE-08-WORKER-H-reference-docs.md](FE-08-WORKER-H-reference-docs.md)         | Wave FE-H: `create-stynx-app` starter + per-package READMEs.                |

## Supported runtimes

Every prompt carries a `## Runtime` block. Operators copy the relevant line.

| Tier               | Claude Code (Anthropic)     | OpenAI Codex                              | Effort knob |
| ------------------ | --------------------------- | ----------------------------------------- | ----------- |
| Heaviest reasoning | `claude-opus-4-7`           | `gpt-5-codex` `--reasoning-effort high`   | high        |
| Default            | `claude-sonnet-4-6`         | `gpt-5-codex` `--reasoning-effort medium` | medium      |
| Light / mechanical | `claude-haiku-4-5-20251001` | `gpt-5-codex` `--reasoning-effort low`    | low         |

The orchestrator picks the heaviest tier. Workers pick the tier appropriate to their wave.

## How to use

1. Start with **[FE-00-ORCHESTRATOR.md](FE-00-ORCHESTRATOR.md)**. The operator feeds it to the lead agent.
2. The orchestrator reads `docs/work/plan/FE-*`, picks the next unblocked FE wave, decomposes into per-package or per-feature worker units.
3. The orchestrator spawns workers using the matching worker prompt.
4. After each worker finishes, it appends a row to `docs/work/plan/FE-WAVE-<X>-report.md`. The orchestrator audits the row and proceeds.

## Convention

- Every worker is given the **Article 6 role** it operates under (Engineer / Inspector / Architect / Auditor). Workers must refuse to author files outside that role's substrate.
- Every worker is given the **wave's success criteria verbatim** from the matching `docs/work/plan/FE-WAVE-<X>-*.md`.
- Every worker is given the **validation commands** to run before reporting done.
- Every worker appends a **closure row** with the commit hash, the proof-of-work command, and an excerpt of the output. No row, no done.
- Every worker stops on the first ambiguity and asks the orchestrator (or operator).

## Cross-programme coordination

The testing-pipeline programme (under `WAVE-00`…`WAVE-07`) is in flight. The FE programme is independent of it for FE-A through FE-F; FE-G converges with the testing-pipeline programme's `WAVE-05` mutation policy. The orchestrator must not edit files under `WAVE-*-report.md` from the other programme; rows go only into `FE-WAVE-<X>-report.md`.
