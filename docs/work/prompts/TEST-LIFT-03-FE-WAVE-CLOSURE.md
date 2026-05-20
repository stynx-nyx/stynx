# Prompt - FE Wave Closure Worker

## Runtime

- **Role:** Engineer, Inspector, or Architect according to assigned scope.
- **Codex:** `codex exec -m gpt-5.5 -c model_reasoning_effort=high -s workspace-write -- "$(cat docs/work/prompts/TEST-LIFT-03-FE-WAVE-CLOSURE.md)\n\nScope: <FE wave/workstream>"`

You are a worker closing one remaining FE wave/workstream.

## Valid Scopes

The orchestrator assigns one of:

- `FE-C C.6-C.9`
- `FE-D D.9`
- `FE-E E.7-E.11`
- `FE-F F.4-F.11`
- `FE-G package:<package-name>`
- `FE-H reference-docs`

## Required Reading

Read the relevant FE wave document and report:

- `docs/work/plan/FE-WAVE-C-profile-sessions-completeness.md`
- `docs/work/plan/FE-WAVE-C-report.md`
- `docs/work/plan/FE-WAVE-D-storage-trash-i18n.md`
- `docs/work/plan/FE-WAVE-D-report.md`
- `docs/work/plan/FE-WAVE-E-tenancy-and-audit.md`
- `docs/work/plan/FE-WAVE-E-report.md`
- `docs/work/plan/FE-WAVE-F-flow-installable.md`
- `docs/work/plan/FE-WAVE-F-report.md`
- `docs/work/plan/FE-WAVE-G-test-fan-out.md`
- `docs/work/plan/FE-WAVE-H-reference-app-docs.md`
- `docs/work/plan/FE-QUESTIONS.md`

## Rules

- Do not weaken tests or thresholds to pass.
- Do not mark mutation not applicable without an Architect decision.
- Keep package scopes disjoint when running in parallel.
- Append closure evidence to the relevant `FE-WAVE-*-report.md`.
- Do not update `FE-CLOSURE-REGISTRY.md`; the orchestrator owns promotion.

## Baseline Validation

Always run the package-specific build/test/lint/typecheck for the touched package(s), then run:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm i18n:check
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --coverage
git diff --check
```

For FE-G mutation scopes, also run the relevant package mutation command and update evidence through the existing recorder.

## Closure

Append a report row with:

- Scope
- Files changed
- Validation commands and outputs
- Matrix impact
- Remaining work, if any
