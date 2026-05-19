# Prompt — Worker FE-C: Profile (stub → real) + Sessions (polish)

## Runtime

- **Tier:** default.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-03-WORKER-C-profile-sessions.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-03-WORKER-C-profile-sessions.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-C — Profile + Sessions** in the stynx frontend completeness programme.

## Scope

One of the FE-C workstreams:

- C.1 — `ProfileService` (`@stynx-web/angular-profile`).
- C.2 — `StynxProfileFormComponent` rewrite (typed reactive form).
- C.3 — `StynxPreferencesFormComponent` rewrite.
- C.4 — Avatar + password / MFA handoff components.
- C.5 — `profileRoutes()` + `provideStynxProfile(...)` + `UnsavedChangesGuard`.
- C.6 — `SdkSessionsAdapter` (`@stynx-web/angular-sessions`).
- C.7 — `StynxActiveSessionsComponent` polish (this-device badge, revoke-all-others, last-IP/UA columns).
- C.8 — Translation catalogs.
- C.9 — Tests.

## Role (Article 6)

- C.1–C.8: **Engineer**.
- C.9: **Inspector**.

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-C-profile-sessions-completeness.md`)

1. `@stynx-web/angular-profile` ships the surface in the table.
2. Profile and preferences forms are typed reactive forms; `[(ngModel)]` is gone.
3. Avatar upload works against the SDK.
4. `change-password` and `mfa-enrolment` handoff components open the OIDC hosted-UI URL.
5. `@stynx-web/angular-sessions` exports `SdkSessionsAdapter` and a default `provideStynxSessions()`.
6. "This device" badge resolves correctly under unit test.
7. Translation catalogs `en` + `pt-BR` shipped for both packages.
8. `pnpm test:matrix` records the new test surface; mutation score ≥ 70 %.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-C-profile-sessions-completeness.md`.
2. `./docs/work/diag/FE-02-completeness-gaps.md` § Profile / Sessions.
3. `./packages-web/angular-profile/src/lib/` and `./packages-web/angular-sessions/src/lib/` — current stub shape.
4. `./packages-web/angular-storage/src/index.ts` — for the avatar upload integration.
5. `./packages-web/angular-auth/src/lib/oidc-client.adapter.ts` — to derive the change-password / MFA hosted-UI URL.
6. Wave FE-A's closure report.

## Constraints

- Typed reactive forms; no `ngModel`.
- Standalone + `OnPush` + signals on UI + RxJS on services.
- Use `@stynx-web/angular-ui` primitives.
- Every string via `| translate`. Key namespaces: `profile.*`, `sessions.*`.
- `UnsavedChangesGuard` must work on browser-tab close (`window.beforeunload`).
- Avatar uploads through `@stynx-web/angular-storage`'s component, not bespoke.

## Validation commands

```bash
pnpm -r --filter @stynx-web/angular-profile build
pnpm -r --filter @stynx-web/angular-profile test
pnpm -r --filter @stynx-web/angular-sessions build
pnpm -r --filter @stynx-web/angular-sessions test
pnpm test:matrix --no-color --coverage
pnpm lint
```

## Closure

Append to `docs/work/plan/FE-WAVE-C-report.md`.

## Stop conditions

Stop and ask if:

- The SDK does not expose `/auth/sessions/revoke-others` (backend gap not in scope).
- The OIDC adapter does not surface a change-password or MFA URL (config-needed; ask Architect).
- The "this device" comparison cannot be derived from `sid` (JWT shape mismatch).
