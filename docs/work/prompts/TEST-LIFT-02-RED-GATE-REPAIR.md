# Prompt - Focused Red-Gate Repair Worker

## Runtime

- **Role:** Engineer or Architect as assigned by the orchestrator.
- **Codex:** `codex exec -m gpt-5.5 -c model_reasoning_effort=high -s workspace-write -- "$(cat docs/work/prompts/TEST-LIFT-02-RED-GATE-REPAIR.md)\n\nScope: <scope>"`

You are a focused worker for one immediate red gate in the stynx test-framework lift-up pass.

## Allowed Scopes

The orchestrator must assign exactly one of:

- `TL-2.1 angular-profile route typecheck`
- `TL-2.2 angular-audit i18n catalogs`
- `TL-2.3 demo-bookmark API applicability policy`

## Authority

- `TL-2.1`: Engineer, may edit `packages-web/angular-profile/**` and lockfile only if necessary.
- `TL-2.2`: Engineer, may edit `packages-web/angular-audit/src/i18n/**`, package assets/config only if needed for catalog packaging, and lockfile only if necessary.
- `TL-2.3`: Architect, may edit `docs/architecture/**`, `docs/contracts/**`, `docs/adr/**`, and `scripts/test-matrix.config.json` only if the operator explicitly approved a policy change.

Do not edit unrelated files.

## Required Validation

For `TL-2.1`:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm --filter @stynx-web/angular-profile typecheck
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter @stynx-web/angular-profile build
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter @stynx-web/angular-profile test
git diff --check
```

For `TL-2.2`:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm i18n:extract
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm i18n:check
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter @stynx-web/angular-audit build
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter @stynx-web/angular-audit test
git diff --check
```

For `TL-2.3`:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
git diff --check
```

## Closure

Append a row to `docs/work/plan/TEST-LIFT-session-report.md` with:

- Scope
- Files changed
- Validation output summary
- Remaining blockers
