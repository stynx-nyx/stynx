# Prompt — Worker FE-B: `@stynx-web/angular-iam`

## Runtime

- **Tier:** heaviest reasoning. This is a new package from scratch.
- **Claude Code:** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-02-WORKER-B-iam-admin.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/FE-02-WORKER-B-iam-admin.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-B — `@stynx-web/angular-iam`** in the stynx frontend completeness programme.

## Scope

You will execute **one** of the FE-B workstreams. The orchestrator names it in the `Scope:` line.

- B.1 — Package scaffolding (`packages-web/angular-iam/{package.json, ng-package.json, tsconfig.json, vitest.config.ts, src/index.ts}`; workspace registration).
- B.2 — `IamApiService` and SDK integration.
- B.3 — Users admin surface (`StynxUsersAdminComponent`, `StynxUserDetailComponent`, `StynxUserCreateDialogComponent`, `StynxUserDisableConfirmDialogComponent`).
- B.4 — Roles admin surface (`StynxRolesAdminComponent`, `StynxRoleDetailComponent`, `StynxRoleCreateDialogComponent`, `StynxPermissionMatrixComponent`).
- B.5 — Groups admin surface (`StynxGroupsAdminComponent`, `StynxGroupDetailComponent`, `StynxGroupCreateDialogComponent`, `StynxGroupRolesEditorComponent`, `StynxGroupMembersEditorComponent`).
- B.6 — Effective-permissions viewer (`StynxEffectivePermissionsComponent`).
- B.7 — Routes + provider (`iamRoutes()`, `provideStynxIam(...)`, `STYNX_IAM_CLIENT`).
- B.8 — Translation catalogs (`src/i18n/{en,pt-BR}.json`; migrate every template literal to `| translate`).
- B.9 — Tests (component TestBed specs, service spec, router spec, mutation ≥ 70 %).

## Role (Article 6)

- B.1–B.8: **Engineer**. You may author code under `packages-web/angular-iam/src/`, `packages-web/angular-iam/package.json`, and update workspace registration.
- B.9: **Inspector**. You may author code only under `packages-web/angular-iam/test/`.
- The ADR for the permission-key convention (`iam:users:read`, `iam:roles:write`, …) is **Architect**-authored under `docs/adr/`. If the orchestrator routed an ADR to you, you must hand it back; you are not Architect.

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-B-admin-iam-ui.md`)

1. `@stynx-web/angular-iam@0.1.0` package builds cleanly via `ng-packagr`.
2. Every component listed in B.3 / B.4 / B.5 / B.6 is shipped, standalone, `OnPush`, signal-driven UI state, typed reactive forms.
3. `IamApiService` covers every endpoint in B.2.
4. `iamRoutes()` and `provideStynxIam()` exported from `index.ts`.
5. Per-component TestBed specs pass; unit branch coverage ≥ 80 %.
6. Mutation score ≥ 70 % (Stryker recorded).
7. Translation catalogs `en` + `pt-BR` shipped; no untranslated literal strings in templates.
8. Wired into `test-matrix.config.json` and `coverage/test-evidence.json` is updated by a fresh `pnpm test:matrix` run.
9. Reference app (`reference/web`) mounts `iamRoutes()` under `/admin` and demonstrates the surface.

You are responsible **only for the workstream named in your Scope**.

## Pre-flight

Read:

1. `./docs/work/plan/FE-WAVE-B-admin-iam-ui.md`.
2. `./docs/work/inv/FE-03-admin-and-rbac-surfaces.md`.
3. `./docs/work/diag/FE-02-completeness-gaps.md` § Users / Roles / Groups admin.
4. `./packages-web/angular-auth/src/index.ts` — to see the permission-guard surface you must consume.
5. `./packages-web/sdk/src/index.ts` and the generated OpenAPI surface — to see the available admin endpoints.
6. Wave FE-A's closure report (`docs/work/plan/FE-WAVE-A-report.md`) — to confirm the standards baseline.

## Constraints

- Use **typed reactive forms** (`NonNullableFormBuilder.group(...)`). No `ngModel`.
- **All components `standalone: true` + `changeDetection: OnPush`**.
- UI state via **signals**; HTTP via **RxJS**.
- Use **`@stynx-web/angular-ui` primitives** for empty states, tables, dialogs, pagination, spinners, toasts. Don't reinvent.
- Every visible string consumed via **`| translate`** (the pipe from `@stynx-web/angular-i18n`). Use the key namespace `iam.*`.
- Permission-guard every route via `@stynx-web/angular-auth`'s `PermissionGuard` with `data.permission = 'iam:<resource>:<action>'`.
- The package must build via `ng-packagr`. Match the `ng-package.json` shape used by sibling packages after FE-A.

## Validation commands

```bash
pnpm -r --filter @stynx-web/angular-iam build
pnpm -r --filter @stynx-web/angular-iam test
pnpm -r --filter @stynx-web/angular-iam test:mutation     # if Stryker is configured
pnpm test:matrix --no-color --coverage
pnpm lint
```

For B.8 specifically, also:

```bash
pnpm i18n:check                                          # added in FE-D; skip if not yet present
node -e "const c = require('./packages-web/angular-iam/src/i18n/en.json'); console.log(Object.keys(c).length, 'keys');"
```

For B.9 specifically, confirm:

- Coverage ≥ 80 % branches.
- Mutation score ≥ 70 % (or document the survivors).

## Closure

Append a row to `docs/work/plan/FE-WAVE-B-report.md` with the workstream id, commit hash, validation excerpt, and one-line note.

If you opened questions (permission-key namespace conventions, role-clone semantics, etc.), write them under `docs/work/plan/FE-QUESTIONS.md`.

## Stop conditions

Stop and ask the orchestrator if:

- An expected backend endpoint isn't in the OpenAPI surface (it implies a backend gap not in scope).
- The permission-matrix design exceeds 1000 rows in real tenant data (UX strategy decision needed).
- A standards regression appears after your change.
