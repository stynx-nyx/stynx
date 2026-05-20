# Prompt — Worker FE-E: Tenancy Polish + `@stynx-web/angular-audit`

## Runtime

- **Tier:** heaviest for the audit package (new); default for tenancy polish.
- **Claude Code (audit package):** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-05-WORKER-E-tenancy-audit.md)\n\nScope: <workstream-id>"`
- **Claude Code (tenancy polish):** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-05-WORKER-E-tenancy-audit.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort {high|medium} --sandbox workspace-write -- "$(cat docs/work/prompts/FE-05-WORKER-E-tenancy-audit.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-E — Tenancy + Audit** in the stynx frontend completeness programme.

## Scope

- E.1 — `tenantChanged$` Observable on `TenantContextService`.
- E.2 — `StynxTenantPickerComponent`.
- E.3 — Tenant-context decoration in `ErrorBannerService`.
- E.4 — `@stynx-web/angular-audit` package scaffold.
- E.5 — `AuditApiService`.
- E.6 — `StynxAuditLogComponent` + `StynxAuditEventDetailComponent`.
- E.7 — `StynxEntityHistoryComponent`.
- E.8 — `StynxAuditHashIntegrityBadgeComponent`.
- E.9 — `auditRoutes()` + `provideStynxAudit(...)`.
- E.10 — Translation catalog.
- E.11 — Tests.

## Role (Article 6)

- E.1–E.10: **Engineer**.
- E.11: **Inspector**.
- ADR for FE audit-event contract pinning: **Architect**.

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-E-tenancy-and-audit.md`)

1. `TenantContextService.tenantChanged$` is shipped and tested.
2. `StynxTenantPickerComponent` is shipped.
3. `ErrorBannerService` messages include tenant label.
4. `@stynx-web/angular-audit@0.1.0` package builds; all components ship.
5. Cursor pagination works against a mocked SDK in unit tests.
6. Hash-integrity badge calls the SDK and renders the right tone.
7. Translation catalogs `en` + `pt-BR` shipped.
8. `pnpm test:matrix` records the new test surface; mutation ≥ 70 %.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-E-tenancy-and-audit.md`.
2. `./docs/work/diag/FE-02-completeness-gaps.md` § Tenancy / Audit.
3. `./packages-web/angular-tenancy/src/lib/` — current tenancy service.
4. `./packages/audit/src/` — the audit emission and hash-chain semantics on the backend (read-only, for contract).
5. The OpenAPI spec excerpt for `/audit/events`, `/audit/entities/{kind}/{id}/history`.
6. Wave FE-A's closure report.

## Constraints

- `@stynx-web/angular-audit` is **read-only**. No mutation endpoints; no admin actions.
- Cursor-based pagination via `@stynx-web/angular-ui`'s `StynxPaginationComponent`.
- All components standalone + `OnPush` + signal UI state + RxJS service.
- Permission-gate every audit route via `audit:events:read`.
- Hash-integrity badge has three states: `verified` (green), `unknown` (amber, e.g. on network error), `tampered` (red).
- Translation keys namespaced `audit.*` and `tenancy.*`.

## Validation commands

```bash
pnpm -r --filter @stynx-web/angular-tenancy build && pnpm -r --filter @stynx-web/angular-tenancy test
pnpm -r --filter @stynx-web/angular-audit build && pnpm -r --filter @stynx-web/angular-audit test
pnpm test:matrix --no-color --coverage
pnpm lint
```

## Closure

Append to `docs/work/plan/FE-WAVE-E-report.md`.

## Stop conditions

Stop and ask if:

- The backend audit endpoints differ from the assumed shape (`actor`, `action`, `entityKind`, `entityId`, `at`, `payload`, `hashPrev`, `hashSelf`).
- A "tampered" hash-chain occurrence is plausible in dev — ask whether the FE should surface a destructive remediation prompt or only inform.
- The tenant-picker's first-load detection collides with an existing host-app routing pattern.
