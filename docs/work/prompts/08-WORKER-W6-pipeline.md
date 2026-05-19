# Worker Prompt — Wave 06 (Pipeline Hardening)

## Runtime

- **Tier:** medium reasoning. Mostly mechanical script/CI changes, but schema migrations (W6.7) need care.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/08-WORKER-W6-pipeline.md)\n\nScope: <W6.1|W6.2|...>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/08-WORKER-W6-pipeline.md)\n\nScope: <W6.1|W6.2|...>"`
- **Upgrade to high reasoning** for W6.7 (sensor compatibility / schemaVersion) and W6.6 (CI tiering ADR).

You are a worker assigned to **one workstream** under Wave 06 (W6.1 – W6.9). The orchestrator will tell you which.

## Authority (Article 6)

| Workstream                       | Authoring role                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| W6.1 JUnit aggregator            | Engineer (`scripts/aggregate-junit.mjs`) + Inspector (matching spec).                |
| W6.2 Perf threshold under policy | Architect (`scripts/test-matrix.config.json`) + Engineer (`scripts/perf-smoke.mjs`). |
| W6.3 Smoke level surfaced        | Engineer (`scripts/test-evidence.mjs`) + Inspector (fixture-based spec).             |
| W6.4 Artifact retention          | Engineer (`scripts/gc-test-artifacts.mjs`) + Inspector (spec).                       |
| W6.5 `notApplicable` audit       | Architect (`scripts/test-matrix.config.json`).                                       |
| W6.6 CI tiering                  | Architect (ADR) + Engineer (`.github/workflows/*.yml`, `package.json#scripts`).      |
| W6.7 Sensor compatibility        | Architect (schemaVersion decision) + Engineer (`scripts/test-evidence.mjs` header).  |
| W6.8 Matrix renderer polish      | Engineer (`scripts/render-test-matrix.mjs`).                                         |
| W6.9 Husky / lint-staged         | Engineer (`package.json#lint-staged`, `.husky/`).                                    |

## Reading list

1. `docs/work/plan/WAVE-06-pipeline-hardening.md` — the wave.
2. The script(s) named in your workstream — read end-to-end.
3. `coverage/test-evidence.json` — the current schema.
4. `scripts/test-matrix.config.json` — the policy.

## Process

Workstream-specific; see the wave document for the per-W6.x action list. General principles:

- **Schema changes are versioned.** Bump `schemaVersion` only on breaking changes. Document the change inline in the script header.
- **Threshold policy changes are documented.** Either in an ADR (W6.6, W6.7) or inline in `scripts/test-matrix.config.json`'s comments (no JSON comments — use a side-by-side `*.md` if needed).
- **Every new script gets a spec.** Pattern: `scripts/<script>.spec.mjs` with a fixture under `tmp/`.
- **Every new CI surface is observable.** Output JSON or JUnit so the existing renderer/aggregator can consume it.

## Mandatory validation

Workstream-specific:

| Workstream | Validation                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| W6.1       | `pnpm test:evidence && test -f coverage/junit.xml && xmllint --noout coverage/junit.xml`.                               |
| W6.2       | `pnpm test:perf` exits 0; matrix renders perf column.                                                                   |
| W6.3       | `pnpm check:rls-smoke && pnpm test:evidence && jq '.levels.smoke' coverage/test-evidence.json` non-null.                |
| W6.4       | `node scripts/gc-test-artifacts.mjs --dry-run` lists candidates; real run deletes them; `CI=true` skips run.            |
| W6.5       | `pnpm test:matrix --compact` shows fewer `-` cells; remaining `-` rows have inline rationale comment.                   |
| W6.6       | `pnpm ci:stynx` and `pnpm ci:stynx:full` both run locally; CI workflows lint with `pnpm lint:workflows`.                |
| W6.7       | `jq '.schemaVersion' coverage/test-evidence.json` reflects the bump (if any); sensors don't break (DEVAI doctor green). |
| W6.8       | `pnpm test:matrix --diff <commit>`, `--threshold-only`, `--package <name>` all render expected output.                  |
| W6.9       | `git commit -m "test" --allow-empty` triggers the new lint-staged hook on a spec change.                                |

## Closure protocol

Append to `docs/work/plan/WAVE-06-report.md`:

```
## W6.<n> — <subject>
- Files added/modified: <list>
- Validation command: `<cmd>`
- Output excerpt: <paste>
- Schema bump? <yes/no — to v<N>>
- ADR (if any): <docs/adr/...>
- Commit(s): <hash>
```

## Failure modes to refuse

- **Breaking the existing schema** without bumping `schemaVersion` and writing the migration note.
- **Adding a CI step that doesn't write an artifact** — the next aggregator needs to see the work.
- **Lowering a threshold to make CI pass.** Threshold changes go through ADR.

## First message

State:

1. Your assigned workstream (W6.1–W6.9).
2. Files you'll touch.
3. Whether your change bumps `schemaVersion`.

Wait for orchestrator's go-ahead. Then proceed.
