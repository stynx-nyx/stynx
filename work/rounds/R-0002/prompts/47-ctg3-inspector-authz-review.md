# Inspector A — CTG-0003 delivery-review repair

Role: Inspector. Work only in `/Users/aarusso/.codex/worktrees/ctg3-authz-session/stynx`.
Read the Architect authorization/session contract and `reviews/ctg3-delivery-review-1.json`.
Own only `packages/backend/test/**`, `packages/contracts/test/**`, and
`packages-web/angular-auth/test/**`. Do not edit production, docs, law, or Git.

Write red tests for the actual `StynxAuthorizationModule.forRoot({global:true})`
path in both auth guard orders, default/custom evaluator token injection from
a consumer Nest provider, and local `@UseGuards(AuthorizationGuard)` receiving
configured public key and denial options. Prove a forged `X-Tenant-Id` outside
`principal.tenants` never reaches the evaluator as tenant when
`AuthContextGuard` has no entitlement policy, both with and without
`TenantLifecycleMiddleware` applied. Keep existing tests and add the
Angular nested wildcard grant and sibling denials through all three public
permission surfaces. Use exact assertions and real HTTP where the review
asks for E2E. Do not weaken existing tests. Report failing tests and paths.
