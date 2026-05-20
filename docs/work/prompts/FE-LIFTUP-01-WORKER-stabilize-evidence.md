# Prompt - FE Lift-Up Worker 01 - Stabilize Evidence

## Runtime

Use `gpt-5.5` with high reasoning.

## Role

You are operating under the role assigned in the `Scope:` line:

- Auditor may author only `docs/work/**`.
- Engineer may author package, tool, script, reference, and lockfile changes.
- Inspector may author test-shaped paths and test evidence.
- Architect may author ADR, architecture, contract, and threshold policy changes.

If the requested change crosses your role boundary, stop and report the required role.

## Required Reading

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/work/inv/FE-LIFTUP-current-inventory.md`
4. `docs/work/diag/FE-LIFTUP-current-diagnostics.md`
5. `docs/work/plan/FE-LIFTUP-completion-plan.md`
6. `scripts/test-matrix.config.json`

## Scope

The orchestrator will append one of:

- `Scope: generated test evidence cleanup`
- `Scope: pnpm-lock.yaml review`
- `Scope: non-generated dirty source review`
- `Scope: regenerate coverage/test-evidence.json`
- `Scope: baseline recovery gates`

## Tasks

1. Verify the live worktree before editing.
2. Handle only the requested scope.
3. Do not revert unrelated user or worker changes.
4. Prefer regeneration over hand-editing generated evidence.
5. Preserve the test-matrix thresholds.
6. If evidence is regenerated, ensure `coverage/test-evidence.json` exists and is internally consistent with `.test-results/**`.

## Validation

Run the smallest relevant subset first, then the recovery gate if the scope affects global state:

```sh
node -v
pnpm -v
pnpm i18n:check
pnpm lint
pnpm test:matrix --no-color --coverage
git diff --check
```

## Closure

Append a short row or note to the orchestrator-selected report or recovery note under `docs/work/plan/`, including:

- scope,
- changed files,
- commands run,
- pass/fail result,
- blockers.
