# Prompt Pack — Testing Remediation

**Compiled:** 2026-05-19
**Reads:** [../inv/](../inv/), [../diag/](../diag/), [../plan/](../plan/).
**Writes:** an orchestrator + a set of worker prompts that, when fed into a fresh agent (Anthropic Claude Code session, OpenAI Codex CLI, DEVAI orchestrator, or any compatible runtime), will execute the plan one wave at a time.

## Supported runtimes

Every prompt in this pack carries a `## Runtime` block naming the recommended model and effort for both runtimes. Operators copy the relevant line.

| Runtime                        | Invocation pattern                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Claude Code                    | `claude --model <model-id> --permission-mode acceptEdits -p "$(cat docs/work/prompts/<file>.md)"`  |
| Claude Code (interactive)      | `claude --model <model-id>` then paste the prompt body.                                            |
| OpenAI Codex CLI               | `codex exec --model <model-id> --reasoning-effort <level> -- "$(cat docs/work/prompts/<file>.md)"` |
| OpenAI Codex CLI (interactive) | `codex --model <model-id> --reasoning-effort <level>` then paste the prompt body.                  |

The pack assumes the latest generally-available models at the time of authoring (2026-05). Operators may substitute newer revisions of the same family without rewriting the prompt.

| Tier               | Claude Code (Anthropic)     | OpenAI Codex                              | Effort knob |
| ------------------ | --------------------------- | ----------------------------------------- | ----------- |
| Heaviest reasoning | `claude-opus-4-7`           | `gpt-5-codex` `--reasoning-effort high`   | high        |
| Default            | `claude-sonnet-4-6`         | `gpt-5-codex` `--reasoning-effort medium` | medium      |
| Light / mechanical | `claude-haiku-4-5-20251001` | `gpt-5-codex` `--reasoning-effort low`    | low         |

The orchestrator picks the heaviest tier (it is the planner-of-record). Workers pick the tier appropriate to their wave (see each worker file's `## Runtime` block).

## How to use

1. Start with **`00-ORCHESTRATOR.md`**. This is the prompt the _operator_ feeds to the lead agent. The orchestrator reads the plan, picks the next unblocked wave, and decomposes it into per-package or per-flow worker units.
2. The orchestrator then spawns workers using the matching worker prompt. Worker prompts are self-contained; each cites the wave's success criterion verbatim and lists the validation commands.
3. After each worker finishes, it appends a row to `docs/work/plan/WAVE-NN-report.md`. The orchestrator audits the row and proceeds to the next.

## Tool requirements

| Runtime     | Required tools                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `Read`, `Edit`, `Write`, `Bash`, `TaskCreate`/`TaskList`/`TaskUpdate`. Permission mode `acceptEdits` recommended; sandbox mode if available.                                                                   |
| Codex CLI   | Default tools (filesystem + shell). Run in `--sandbox workspace-write` (or your project's policy). For long sessions, `--full-auto` cuts confirmation overhead. Codex auto-uses `apply_patch`; no extra setup. |

## Files in this directory

| File                                                                 | Role                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [00-ORCHESTRATOR.md](00-ORCHESTRATOR.md)                             | The lead agent. Reads the plan, sequences waves, supervises workers.   |
| [01-WORKER-W0-baseline.md](01-WORKER-W0-baseline.md)                 | Wave 00 worker: gate honesty, perf, evidence aggregation, CI tiers.    |
| [02-WORKER-W1-coverage.md](02-WORKER-W1-coverage.md)                 | Wave 01 worker: drive branches to 100 % in one package per invocation. |
| [03-WORKER-W2-api-matrix.md](03-WORKER-W2-api-matrix.md)             | Wave 02 worker: build the per-route error matrix for one controller.   |
| [04-WORKER-W3-db-runtime.md](04-WORKER-W3-db-runtime.md)             | Wave 03 worker: runtime DDL tests for one schema or one DDL object.    |
| [05-WORKER-W4-real-e2e-backend.md](05-WORKER-W4-real-e2e-backend.md) | Wave 04 worker: real backend E2E for one vertical flow.                |
| [06-WORKER-W4-real-e2e-web.md](06-WORKER-W4-real-e2e-web.md)         | Wave 04 worker: Playwright fan-out for one user-facing category.       |
| [07-WORKER-W5-mutation.md](07-WORKER-W5-mutation.md)                 | Wave 05 worker: hunt survivors and raise threshold for one package.    |
| [08-WORKER-W6-pipeline.md](08-WORKER-W6-pipeline.md)                 | Wave 06 worker: one pipeline-hardening workstream.                     |
| [09-WORKER-W7-cleanup.md](09-WORKER-W7-cleanup.md)                   | Wave 07 worker: one cleanup category.                                  |

## Conventions used across the prompts

- Every worker is given the **role** it operates under (Inspector / Engineer / Architect / Auditor) per Constitution Article 6, and must refuse to author files outside its authority.
- Every worker is given the **success criterion verbatim** from the matching wave doc.
- Every worker is given the **validation commands** to run before reporting done.
- Every worker is told to **append a closure row** to `docs/work/plan/WAVE-NN-report.md` with the exact commit hash, the proof-of-work command, and an excerpt of the output. No row, no done.
- Every worker is told to **stop on the first ambiguity** and ask the orchestrator (or operator) rather than guess.
