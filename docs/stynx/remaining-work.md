# Remaining Work Backlog

## P0
1. No open P0 items.

## Recently Completed
1. Added `PormIdentityAdminFacade` and `PecIdentityAdminFacade` in `packages/stynx-backend/src/identity-admin/integration-facades.ts`, exported via `@stech/stynx-backend`, to bridge existing `porm`/`pec` service semantics over shared identity-admin core.
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

## P1
1. Move reusable pieces from legacy `backend/src/core/*` into `packages/stynx-backend` adapters incrementally.
2. Add package-level integration examples for `porm` and `pec` controller/module adoption over `PormIdentityAdminFacade` / `PecIdentityAdminFacade` (code snippets + migration checks).
3. Execute sibling repo cutovers (`porm`, `pec`, `sgp`) to consume package APIs and remove duplicated legacy implementations.

## P2
1. Publish versioning and release automation (`changesets` or equivalent).
2. Normalize package docs under one entrypoint (`docs/stynx/package-architecture.md` + consumer quickstarts).

## Postponed (per current decision)
1. Add compile/test CI for new workspace packages.
2. Migrate CI pipelines from legacy paths to package/workspace targets.

## Known Risks to Track
- `sgp` verifier hazard found in `../sgp/source/backend/src/auth/cognito-jwt.service.ts#verifySignature` (`this.client` checked before lazy init).
- SQL sink mode differences (`audit.write` vs table insert) can cause shape drift if not explicitly mapped per consumer.
- Identity-admin local enrichment boundaries (org/affiliation/catalog semantics) must not leak into provider-generic package APIs.
