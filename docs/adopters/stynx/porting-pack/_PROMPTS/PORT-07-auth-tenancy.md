# PORT-07 — Auth and Tenancy Patterns

**Produces:** `docs/stynx/porting-pack/07-AUTH-AND-TENANCY-PATTERNS.md`.
**Depends on:** `04`, `05`, `16-SPEC-EXCERPTS/permission-model.md`,
`16-SPEC-EXCERPTS/tenancy-model.md`.
**Branch:** `docs/stynx/porting-pack/07-auth-tenancy`.

## Mission

Patterns for replacing the foreign codebase's auth/tenancy plumbing
with STYNX's.

## Read

- `packages/auth/src/index.ts` and the decorator implementations:
  `@Permission`, `@ReadOnly`, `@Public`, `@System`, plus guards.
- `packages/auth/src/permission-cache.ts`.
- `packages/sessions/src/` — token issuance & refresh.
- `packages/tenancy/src/` — TenantContext + interceptors.
- `reference/api/src/main.ts` and `app.module.ts` for wiring.
- The Cognito wiring: search for `@aws-sdk/client-cognito-identity-provider`.

## Sections

````
# 07 — Auth and Tenancy Patterns

## Pattern A — Replacing existing JWT middleware

By starting point:
- Passport JWT → ...
- Custom JWT → ...
- Auth0 → ...
- Clerk → ...
- Cognito-direct → ...

[Each: minimum-effort migration steps, citing @stynx-nyx/auth wiring.]

## Pattern B — Introducing TenantContext

[From "filter by org_id manually" → "set GUC, RLS does the rest".
Cite tenancy/src/ + database.ts GUC plumbing.]

## Pattern C — Declaring permissions

- Naming convention: `resource:action:scope` (cite spec §6).
- Seeding in a migration: cite the seed pattern from
  reference/api/migrations/.
- Attaching to tenant roles: cite the auth schema.

## Pattern D — Tenant switching

[How a logged-in user switches active tenant; client header,
session re-issue, cache invalidation. Cite GAP-004 if open.]

## Pattern E — Impersonation

[VERIFY the spec actually supports impersonation. If yes, document.
If no, mark `[NOT SUPPORTED IN v1.0]`.]

## Pattern F — Read-only routes (@ReadOnly)

[Decorator + `stynx_reader` role enforcement. Cite database.ts:65.]

## Pattern G — System / cross-tenant ops (@System)

[`withSystemContext` + @System decorator. Caveats around audit
attribution.]

## Cognito wiring diagram

```mermaid
sequenceDiagram
  participant SPA
  participant Cognito
  participant App
  participant DB
  SPA->>Cognito: OIDC PKCE login
  Cognito-->>SPA: id_token + access_token
  SPA->>App: GET /me with Bearer
  App->>App: verify JWT (JWKS)
  App->>DB: lookup tenancy + perms_hash
  DB-->>App: roles, perms_hash
  App-->>SPA: session response
````

[Then enumerate exactly what consuming codebases provision in
Cognito (User Pool, app client, callback URLs) vs in STYNX DB
(tenancy.tenants, auth.memberships, auth.permissions).]

```

## Rules

- Pattern A must cover at least four starting auth stacks; the
  consuming agent will be reading this before knowing which
  applies.
- Pattern E: if impersonation is not in v1.0, do not invent it.
- The Cognito wiring must show the boundary: which data lives in
  Cognito vs STYNX DB.

## Acceptance

- All seven patterns present.
- Cognito Mermaid diagram present.
- Each pattern names the @stynx package(s) it composes.
```
