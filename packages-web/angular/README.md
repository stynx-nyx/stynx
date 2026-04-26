# @stynx-web/angular

Angular 20 core integration for STYNX.

It provides:
- `StynxAngularModule.forRoot(...)`
- auth, tenant, request-id, and error interceptors
- `TenantContextService`
- `ErrorBannerService` and `ToastService`
- `EmptyStateComponent`

Verification:

```bash
pnpm --filter @stynx-web/angular test
pnpm --filter @stynx-web/angular typecheck
```
