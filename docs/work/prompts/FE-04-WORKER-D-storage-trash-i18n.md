# Prompt — Worker FE-D: Storage Complete, Trash Default Adapter, i18n End-to-End

## Runtime

- **Tier:** default (D.7 catalog migration is mechanical-heavy; D.5 ICU is a small library integration).
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-04-WORKER-D-storage-trash-i18n.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-04-WORKER-D-storage-trash-i18n.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-D — Storage + Trash + i18n** in the stynx frontend completeness programme.

## Scope

- D.1 — `StynxDocumentDownloadComponent` in `@stynx-web/angular-storage`.
- D.2 — `MultipartUploadExecutor`.
- D.3 — Drag-and-drop + scan-status hook in `StynxDocumentUploadComponent` / `DocumentService`.
- D.4 — `SdkTrashAdapter` + bulk operations + per-kind tabs + retention countdown.
- D.5 — `TranslatePipe` ICU upgrade in `@stynx-web/angular-i18n`.
- D.6 — `StynxIntlDatePipe`, `StynxIntlNumberPipe`, `StynxIntlCurrencyPipe`.
- D.7 — Per-package translation catalogs (`packages-web/<pkg>/src/i18n/{en,pt-BR}.json`); migrate every template literal.
- D.8 — `tools/i18n-extract.mjs` extraction tool + `pnpm i18n:check` / `pnpm i18n:extract` scripts.
- D.9 — Tests.

## Role (Article 6)

- D.1–D.7: **Engineer**. Code under `packages-web/*/src/`.
- D.8: **Engineer**, under `tools/i18n-extract/` or a single `tools/i18n-extract.mjs`. Workspace scripts in root `package.json` are Engineer.
- D.9: **Inspector**.
- ADR for ICU adoption + extraction strategy: **Architect** (separate routing).

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-D-storage-trash-i18n.md`)

1. `StynxDocumentDownloadComponent`, `MultipartUploadExecutor`, drag-and-drop, scan-status are shipped.
2. `SdkTrashAdapter` + bulk ops + retention countdown + per-kind tabs are shipped.
3. `TranslatePipe` handles ICU pluralisation.
4. `Intl` date / number / currency pipes shipped in `@stynx-web/angular-i18n`.
5. Every `packages-web/*` template literal in user-visible position is now translatable.
6. `en` + `pt-BR` catalogs shipped per package with templates.
7. `pnpm i18n:check` passes; `pnpm i18n:extract` reproduces the catalog from source.
8. `pnpm test:matrix` records the new tests; mutation ≥ 70 % per package.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-D-storage-trash-i18n.md`.
2. `./docs/work/diag/FE-02-completeness-gaps.md` § Storage / Trash / i18n.
3. `./packages-web/angular-storage/src/lib/` and `./packages-web/angular-trash/src/lib/` — current shape.
4. `./packages-web/angular-i18n/src/lib/` — current i18n runtime.
5. For D.7: every `packages-web/*/src/lib/**/*.component.html` and `*.component.ts` template — the strings to migrate.
6. Wave FE-A's closure report.

## Constraints

- D.5 ICU: prefer the existing `intl-messageformat` library (well-maintained, small). Add to `@stynx-web/angular-i18n`'s `dependencies` (not peer).
- D.7: migrate one package at a time; don't bundle the migration of all 11 packages into a single commit. The orchestrator may spawn this as a sub-worker per package.
- Translation keys are namespaced by package (`auth.*`, `profile.*`, `iam.*`, `flow.*`, `audit.*`, `storage.*`, `trash.*`, `tenancy.*`, `ui.*`, `i18n.*`).
- Keep ICU plural usage minimal at first; the bigger investment is broad coverage of simple keys.

## Validation commands

```bash
pnpm -r --filter @stynx-web/angular-storage build && pnpm -r --filter @stynx-web/angular-storage test
pnpm -r --filter @stynx-web/angular-trash build && pnpm -r --filter @stynx-web/angular-trash test
pnpm -r --filter @stynx-web/angular-i18n build && pnpm -r --filter @stynx-web/angular-i18n test
pnpm i18n:check                                          # for D.7 / D.8 closure
pnpm test:matrix --no-color --coverage
pnpm lint
```

## Closure

Append to `docs/work/plan/FE-WAVE-D-report.md`. For D.7, append one row per package migrated.

## Stop conditions

Stop and ask if:

- A user-visible string in a template is dynamic (`{{ task.title }}`) and not directly translatable — surface as a question for product / locale strategy.
- `pt-BR` translations need fluent author review beyond machine translation — flag the package and request translation help.
- A package surfaces no user-visible strings (only DI / token / model exports) — record that no catalog is needed.
