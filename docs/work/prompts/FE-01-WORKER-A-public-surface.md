# Prompt — Worker FE-A: Public Surface, Standards, Packaging

## Runtime

- **Tier:** default (most of this is mechanical, some judgement).
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-01-WORKER-A-public-surface.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-01-WORKER-A-public-surface.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-A — Public Surface, Standards, Packaging** in the stynx frontend completeness programme.

## Scope

You will execute **one** of the FE-A workstreams listed below. The orchestrator names it in the `Scope:` line of your invocation.

- A.1 — Enforce `OnPush` workspace-wide (ESLint rule + one-pass fix).
- A.2 — Converge signals + RxJS to signal-as-source-of-truth in `TenantContextService`, `StynxSessionService`, `ErrorBannerService`, `StynxToastService`.
- A.3 — Adopt `inject()` as the default DI form (mechanical pass over `*.component.ts` / `*.service.ts`).
- A.4 — `provideStynxDefaults()` in `@stynx-web/angular`.
- A.5 — `package.json#exports` map + `sideEffects: false` per package; `src/testing/index.ts` per package.
- A.6 — Adopt Angular Package Format via `ng-packagr`; ADR `ADR-FE-PACKAGING-0001-ng-packagr-adoption.md`.
- A.7 — Adopt `@angular-eslint:recommended` preset and the spot rules listed in the plan.
- A.8 — Ship `StynxPermissionDeniedComponent` and re-login modal trigger in `@stynx-web/angular-auth`.
- A.9 — Icon strategy: `<stynx-icon name="...">` + sprite + replace ad-hoc icons.

## Role (Article 6)

- A.1, A.3, A.5, A.7, A.8, A.9: **Engineer**. You may author code under `packages-web/*` and `eslint.config.mjs`.
- A.2, A.4: **Engineer**. Same authority.
- A.6: **Architect** (for the ADR under `docs/adr/`) + **Engineer** (for the per-package config).

You may not author files outside these substrates.

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-A-public-surface.md`)

1. `pnpm lint` passes with `@angular-eslint/prefer-on-push-component-change-detection` at `error`.
2. Every shipped component declares `changeDetection: OnPush`.
3. Every dual-exposed state in the four services is reduced to a signal + `toObservable()` adapter; `*$` accessors are `@deprecated`.
4. `provideStynxDefaults()` exists and compiles; documented in `packages-web/README.md`.
5. Every `packages-web/*/package.json` has `exports`, `sideEffects: false`.
6. Every `packages-web/*` builds via `ng-packagr`; output validates against APF.
7. ADR `ADR-FE-PACKAGING-0001-ng-packagr-adoption.md` exists.
8. `<stynx-permission-denied>` is shipped and rendered when `PermissionGuard` rejects.
9. `<stynx-icon name="...">` is shipped; legacy emoji / inline SVG replaced in `angular-flow` + `angular-ui`.
10. `pnpm test:matrix --no-color --coverage` shows no regression in branches/lines/functions.

You are responsible **only for the workstream named in your Scope**, not the whole wave. Other workers cover the rest.

## Pre-flight

Read:

1. `./docs/work/plan/FE-WAVE-A-public-surface.md` — the wave document.
2. `./docs/work/diag/FE-03-standards-compliance.md` — context for every workstream.
3. `./packages-web/README.md` — current top-level doc.
4. The files relevant to your workstream (e.g., for A.2 read the four services).

## Validation commands

After your work, before reporting done, run **all** of:

```bash
pnpm lint
pnpm -r build
pnpm -r test
pnpm test:matrix --no-color --coverage
```

If any fails, fix or revert your change. Do not declare done with a red signal.

For workstream-specific extras:

- A.6: `pnpm -r --filter './packages-web/*' build` — verify `ng-packagr` produces `dist/fesm2022/...`.
- A.5: `node -e "console.log(require('@stynx-web/angular-flow/package.json').exports)"` — verify the `exports` map.

## Closure

Append a row to `docs/work/plan/FE-WAVE-A-report.md`:

```markdown
| Workstream | Commit | Validation excerpt        | Notes      |
| ---------- | ------ | ------------------------- | ---------- |
| A.<n>      | <sha>  | `pnpm test:matrix` … pass | <one-line> |
```

If you opened questions, write them under `docs/work/plan/FE-QUESTIONS.md` instead of guessing.

## Stop conditions

Stop and ask the orchestrator if:

- The standards change breaks more than five components in non-obvious ways.
- `ng-packagr` adoption fails on any package due to peer-dep conflicts.
- The signal-convergence pass surfaces a behaviour difference (subscriber receives `undefined` where it used to receive an emission).
- Any test fails after your change and the cause isn't isolable to the change.
