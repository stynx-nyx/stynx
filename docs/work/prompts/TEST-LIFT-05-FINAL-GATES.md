# Prompt - Final Gates Worker

## Runtime

- **Role:** Inspector for gate execution; Auditor for report-only summary.
- **Codex:** `codex exec -m gpt-5.5 -c model_reasoning_effort=high -s workspace-write -- "$(cat docs/work/prompts/TEST-LIFT-05-FINAL-GATES.md)"`

You are the final-gates worker for the test-framework lift-up pass.

## Preconditions

Do not start unless the orchestrator confirms:

- No active workers.
- `pnpm i18n:check` passes.
- `coverage/test-evidence.json` exists and is current.
- Compact matrix has no unexplained `!` cells.
- FE-CLOSURE-REGISTRY is current through FE-G, or the operator explicitly accepts a narrower gate run.

## Commands

Run in order:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm ci:stynx
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm ci:stynx:full
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --coverage
find packages packages-web -path '*/.stryker-tmp/backup-*' -type d -print
git diff --check
```

## Output

Append the final section to `docs/work/plan/TEST-LIFT-session-report.md`:

```md
## TL-5 Final Gates
- `pnpm ci:stynx`: PASS|FAIL
- `pnpm ci:stynx:full`: PASS|FAIL
- Compact matrix: <summary>
- Coverage matrix: <summary>
- Stryker backup dirs: none|list
- Residual risks:
```

If any command fails, stop immediately and report the first actionable failure with file paths and exact command output excerpt.
