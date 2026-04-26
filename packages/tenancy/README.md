# @stynx/tenancy

Tenant resolution and lifecycle primitives for STYNX, including:

- request-scoped tenant resolution from header, bearer claim, or subdomain
- active-membership validation with a short-lived in-pod LRU cache
- tenant provisioning, suspension, archive, and purge orchestration
- platform admin endpoints for tenant lifecycle operations

Lifecycle model:

- `provisioning -> active -> suspended -> archived -> purged`
- `is_active` remains the hard access gate used by request validation and RLS-adjacent checks

Operational notes:

- `/sessions`, `/.well-known/jwks.json`, and health/metrics/info routes are exempt from tenant resolution
- platform admin routes use an env-flag guard for now; auth permission wiring can replace that later
