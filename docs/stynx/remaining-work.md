# Remaining Work Backlog

## P0

1. No open P0 items.

## Recently Completed

1. Added `PormIdentityAdminFacade` and `PecIdentityAdminFacade` in `packages/backend/src/identity-admin/integration-facades.ts`, exported via `@stynx/backend`, to bridge existing `porm`/`pec` service semantics over shared identity-admin core.
2. Added concrete Postgres local identity sync adapter (`PgIdentityLocalSyncAdapter`) with provider-backed `syncToLocal`, `syncUser`, and `listGroupsWithMetaByUserId`, including optional PORM enum-meta loader helper.
3. Added response-event DB lifecycle wrapper (`ResponseEventRequestDbClientLifecycle`) for `finish/close` release semantics.
4. Added configurable audit metadata redaction policy support in shared audit module (`PatternAuditMetadataRedactionPolicy` and module injection hook).
5. Expanded package compatibility test matrix:

- req.user/request.actor parity
- claim-first + SQL fallback entitlement parity
- audit sink mode parity (`audit_write_function` vs `audit_event_table`)
- identity-admin local sync/provider parity coverage
- response-event lifecycle parity

6. Productized PEC global cross-cutting stack in package API:

- `StynxPlatformPipelineModule` for global APP provider wiring (`rate-limit` guard + `sla`/`idempotency` interceptors).
- standalone `StynxRateLimitModule`, `StynxSlaModule`, `StynxIdempotencyModule` APIs.

7. Added optional middleware-style tenant lifecycle adapter:

- `TenantLifecycleMiddleware`
- `createTenantLifecycleMiddleware(...)`
- supports strict `x-tenant-id` validation and response-event client release semantics.

8. Expanded compatibility matrix tests further:

- idempotency replay/conflict/strict durable behavior
- rate-limit in-memory/distributed/strict behavior
- SLA sample/aggregate/error-path behavior
- pipeline module global provider registration behavior
- tenant lifecycle middleware compatibility behavior

9. Completed the two-sprint PORM Flow transposition into independent STYNX packages:

- backend/database package `@stynx/flow` with design/runtime services, effect dispatch, resolver expansion, node form-rule gating, aliases, analytics paging/filtering, task privilege checks, and policy evaluation;
- platform migration `0015_flow_gap_closure.sql`;
- Angular package `@stynx-web/angular-flow` with real Vitest coverage for exports/routes, API facade route families, and component behavior;
- reference API/web package consumption and release changeset coverage.

10. Closed the next Flow gap-closure bucket after reassessing PORM leftovers:

- verified answer/waiver mutation freshness still needed automatic runtime signaling and added stynx-native DB triggers plus integration evidence;
- enabled DML audit for current curated Flow live tables and platform curated tables through platform migrations;
- added generic typed fill execution controls and question-level waiver entry to `@stynx-web/angular-flow`;
- completed the API completeness review by adding only the package-needed fill-scoped waiver listing route;
- seeded reference-web Flow route-access E2E coverage.

11. Completed Flow deprecation-readiness proof for the STYNX package side:

- added reference API HTTP-pipeline E2E coverage for Flow guards, request context, idempotency, audit, design, runtime, forms, waivers, signals, task actions, and analytics;
- expanded reference-web Flow route-access coverage across generic package screens;
- documented the `../porm` consumer cutover plan and the explicit decisions to keep rich visual editing and host store orchestration outside the package baseline for now.

## P1

1. Move reusable pieces from legacy `backend/src/core/*` into `packages/backend` adapters incrementally.
2. Add package-level integration examples for `porm` and `pec` controller/module adoption over `PormIdentityAdminFacade` / `PecIdentityAdminFacade` (code snippets + migration checks).
3. Execute sibling repo cutovers (`porm`, `pec`, `sgp`) to consume package APIs and remove duplicated legacy implementations.
4. Execute the original `porm` Flow consumer cutover to `@stynx/flow` and `@stynx-web/angular-flow` using [porm-flow-deprecation-readiness.md](porm-flow-deprecation-readiness.md) once the consuming repo is ready for the dependency swap.
5. Keep DML audit enabled by default for future mutable curated tables added by any stynx package; exceptions must be explicit and narrow.

## P2

1. Publish versioning and release automation (`changesets` or equivalent).
2. Keep package docs current as exports move. The Wave 08 baseline now has
   package READMEs, `docs/stynx/package-architecture.md`, and the developer
   documentation standard; future work should update those with public API
   changes rather than reopening the old README-absence gap.
3. Revisit richer graph-editor implementation only after multiple consumers need the same package-level visual authoring behavior. Current decision: keep it a host extension point.
4. Revisit a packaged Angular Flow host store only if richer package screens start duplicating graph/form/task selection, loading, CRUD refresh, and error orchestration. Current decision: not needed for the baseline.

## Postponed (per current decision)

1. Add compile/test CI for new workspace packages.
2. Migrate CI pipelines from legacy paths to package/workspace targets.

## Known Risks to Track

- `sgp` verifier hazard found in `../sgp/source/backend/src/auth/cognito-jwt.service.ts#verifySignature` (`this.client` checked before lazy init).
- SQL sink mode differences (`audit.write` vs table insert) can cause shape drift if not explicitly mapped per consumer.
- Identity-admin local enrichment boundaries (org/affiliation/catalog semantics) must not leak into provider-generic package APIs.
- Flow package maturity is "ready for PORM consumer cutover planning": core package completeness, mutation freshness, audit, typed-fill UX, API review, representative HTTP-pipeline proof, and reference-web route E2E are closed for the package baseline. Remaining risk is the separate `../porm` migration plus any host-specific rich visual editor behavior.
