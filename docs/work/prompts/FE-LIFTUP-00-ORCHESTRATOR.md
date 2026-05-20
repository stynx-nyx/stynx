# Prompt - FE Lift-Up Recovery Orchestrator

## Runtime

- Use `gpt-5.5` unless the operator explicitly overrides.
- Codex CLI:

```sh
codex exec --model gpt-5.5 --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/FE-LIFTUP-00-ORCHESTRATOR.md)"
```

## Role

You are the Auditor orchestrator for the interrupted stynx frontend lift-up recovery. You may author files only under `docs/work/`. You may read the entire workspace. To edit other paths, spawn or instruct the correct role worker under Article 6.

## Required Reading

Read these files in order before taking any action:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/work/inv/FE-LIFTUP-current-inventory.md`
4. `docs/work/diag/FE-LIFTUP-current-diagnostics.md`
5. `docs/work/plan/FE-LIFTUP-completion-plan.md`
6. `docs/work/plan/FE-CLOSURE-REGISTRY.md`
7. Every existing `docs/work/plan/FE-WAVE-*-report.md`
8. `coverage/test-evidence.json` if present; if absent, record that as a blocker.
9. `scripts/test-matrix.config.json`

## Mission

Recover the FE programme from the current checkpoint. Do not restart FE-A/FE-B. Do not promote from stale report output. Drive the work from the current live repository state.

## Procedure

1. Re-check `git status --short`, `node -v`, `pnpm -v`, and the existence of `coverage/test-evidence.json`.
2. Record any mismatch from `docs/work/inv/FE-LIFTUP-current-inventory.md`.
3. Run or delegate Phase 0 from `docs/work/plan/FE-LIFTUP-completion-plan.md`.
4. Prioritize FE-E audit catalogs and remaining FE-E work because audit currently blocks global i18n.
5. Finish FE-C and FE-F remaining feature slices.
6. Re-promote FE-D only after fresh global gates pass.
7. Create and maintain `docs/work/plan/FE-WAVE-G-report.md`.
8. Run FE-G as a rolling test fan-out, starting with IAM mutation and route/component tests already present at HEAD.
9. Run FE-H last.
10. Update `docs/work/plan/FE-CLOSURE-REGISTRY.md` only after current validation output exists.

## Worker Routing

Use these prompt files:

- Stabilization and evidence: `docs/work/prompts/FE-LIFTUP-01-WORKER-stabilize-evidence.md`
- Feature closure: `docs/work/prompts/FE-LIFTUP-02-WORKER-feature-closure.md`
- Test fan-out: `docs/work/prompts/FE-LIFTUP-03-WORKER-test-fanout.md`

For Codex worker execution, append a scope line:

```sh
codex exec --model gpt-5.5 --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/FE-LIFTUP-02-WORKER-feature-closure.md)

Scope: FE-E E.7-E.11"
```

## Reporting

Every completed worker unit must append or update the relevant FE report row with:

- scope,
- commit or workspace range,
- validation commands,
- concise output excerpt,
- remaining blockers.

The orchestrator's final response must list:

- what closed,
- what remains open,
- gates run,
- gates skipped or blocked,
- exact files changed.
