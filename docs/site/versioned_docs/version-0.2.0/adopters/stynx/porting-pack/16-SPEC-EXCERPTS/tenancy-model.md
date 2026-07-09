# Tenancy Model

&gt; **Source:** `specs/STYNX-SPEC-v0.6.md` §4 (lines 184–266) and §5
&gt; (lines 267–294).
&gt; **Spec version:** v0.6.

## Tenancy model (§4.1)

**Pool + RLS, single tier, no escalation.**

- One DB per environment.
- One Cognito user pool per environment.
- One S3 bucket per environment.
- All tenants share the same DB, pool, bucket.
- Per-tenant S3 prefix (not separate buckets).
- Region fixed at install time.

No schema-per-tenant. No DB-per-tenant. No Cognito Group as tenant
container — tenancy and roles live in STYNX DB.

## Tenant identification (§4.2)

Resolution order:

1. `X-Tenant-Id` header.
2. Bearer token's `tenant_id` claim.
3. Subdomain (last fallback).

The resolved tenant is placed in a request-scoped `TenantContext`
via `nestjs-cls`. Reading `TenantContext.tenantId` outside a request
throws unless inside `withSystemContext(...)` (I2 enforcement).

## Database schema layout (§4.3)

STYNX owns six PostgreSQL schemas:

| Schema    | Purpose                                                                                                             | RLS                        |
| --------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `core`    | Platform meta: configuration, rate-limit overrides, idempotency keys, schema migration log, soft-delete FK registry | Mixed                      |
| `tenancy` | Tenant lifecycle: tenants, plans, settings                                                                          | RLS on tenant-scoped views |
| `auth`    | Identity/authz: users, roles, perms, groups, memberships, sessions, invitations                                     | RLS                        |
| `audit`   | Append-only audit log, partitioned monthly                                                                          | No RLS; platform role only |
| `storage` | Document registry                                                                                                   | RLS                        |
| `archive` | Mirrored tables of every soft-deletable live table; holds soft-deleted rows permanently                             | RLS                        |

The `public` schema is unused for STYNX-owned objects. Application
schemas are consumer-defined (e.g. `sample.*` in the reference app).

## RLS enforcement (§4.4)

Standard tenant-scoped live table:

```sql
CREATE TABLE sample.example_entity (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants(id),
  -- domain columns ...
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL
);

ALTER TABLE sample.example_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample.example_entity FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sample.example_entity
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Live tables of soft-deletable entities do **not** carry
`deleted_at` / `deleted_by`. Archive mirror carries that metadata
(see `soft-delete-model.md`).

## Three database roles

| Role           | RLS            | Privileges                                 | Used by                              |
| -------------- | -------------- | ------------------------------------------ | ------------------------------------ |
| `stynx_owner`  | BYPASSRLS      | DDL                                        | Migrations; `withSystemContext(...)` |
| `stynx_app`    | Subject to RLS | DML on live + archive; SELECT on `audit.*` | Default app connections              |
| `stynx_reader` | Subject to RLS | SELECT on live + archive                   | Read-only clients                    |

Provisioned by `packages/data/migrations/platform/0001_roles.sql`.

## GUC plumbing (§4.4)

First statement of every transaction:

```sql
SET LOCAL app.tenant_id  = '...';
SET LOCAL app.actor_id   = '...';
SET LOCAL app.request_id = '...';
SET LOCAL app.session_id = '...';
SET LOCAL app.role       = 'app' | 'reader' | 'owner';
```

Plus, during archive moves (set by `@stynx-nyx/data`):

```sql
SET LOCAL app.archive_move    = 'in_progress';   -- suppresses archive-side audit duplication
SET LOCAL app.archive_reason  = 'soft_delete';   -- or 'restore'
```

GUC reads from the audit trigger (`audit.fn_row_change`) decide
whether to write a duplicate audit row during archive moves; see
`audit-model.md`.

## Tenant lifecycle (§4.5)

States: `provisioning → active → suspended → archived → purged`.

- **Suspend** ANDs RLS with `is_active`.
- **Archive** exports + blocks access.
- **Purge** is LGPD hard delete across both live and archive.

Platform-ops only in v1.0 (no tenant self-service).

## Cross-tenant operations (§4.6)

Forbidden by default. Two audited escape hatches:

1. **`@System()` controller methods** — for platform admin routes.
2. **`withSystemContext(reason, fn)`** — for background work; the
   `reason` is recorded in `audit.system_op`.

Impersonation is **disabled by default** in v1.0.

## Sessions (§5)

### Cognito as IdP only (§5.1)

Cognito strictly authenticates. Tenant membership, roles, and
permissions live in STYNX DB. Pattern: AWS SaaS Factory Cognito
reference.

### Token flow (§5.2)

OIDC Auth Code + PKCE against Cognito → STYNX `POST /sessions`
exchanges the Cognito access token for:

- STYNX bearer JWT (10 min).
- Refresh token (24h sliding, opaque).

### Session token shape (§5.3)

Bearer JWT signed with STYNX-owned RSA keypair (quarterly rotation,
JWKS at `/.well-known/jwks.json`).

Claims: `iss, sub, sid, tenant_id, perms_hash, amr, exp, iat, jti`.

Refresh: opaque, rotated on every use; reuse detection kills the
entire session family.

Cookie mode: optional first-party web; `sid` httpOnly+Secure+
SameSite=Lax, CSRF double-submit.

### Tenant switching (§5.5)

Session rotation — old session revoked, new session minted bound to
target tenant. The `perms_hash` is recomputed for the new
membership.

## Adoption hint

For consumers porting from "filter by `org_id` manually":

1. Rename column to `tenant_id` (single migration).
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + create policy.
3. Delete every `WHERE tenant_id = $X` predicate from application
   code (RLS handles it).
4. Wire `@stynx-nyx/tenancy` interceptor to set `app.tenant_id` GUC on
   each transaction.

The hardest part is auditing legacy code for tenant-leaks; the
`@stynx-nyx/testing` RLS-leak matcher catches them in tests.
