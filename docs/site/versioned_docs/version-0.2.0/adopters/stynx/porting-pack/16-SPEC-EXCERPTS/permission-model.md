# Permission Model

&gt; **Sources:** `specs/STYNX-SPEC-v0.6.md` §6 (lines 295–346),
&gt; `specs/STYNX-ADR-002-perms-caching.md` (245 lines), and
&gt; `packages/auth/src/permission-cache.ts`.
&gt; **Spec version:** v0.6 + ADR-002.

## Shape — `resource:action:scope` RBAC

Every permission key is `resource:action:scope`. Examples:

```
document:read:*
document:read:own
document:write:*
document:delete:*       -- soft delete
document:hard_delete:*
document:restore:*
document:read_trash:*
```

**No ABAC.** No relationship-based authz. No policy hooks. Wildcards
expand at cache build time; runtime check is an O(1) hash-set lookup.

## Default seeded roles

On tenant creation: `owner`, `admin`, `member`, `viewer`.
Platform-level: `platform:support`, `platform:billing`,
`platform:ops`. Group hierarchy depth capped at 8.

## Decorators (§6.2)

```typescript
import { Permission, ReadOnly, Public, System } from '@stynx-nyx/auth';
import { Audit, Idempotent, RateLimit } from '@stynx-nyx/backend';

@Controller('documents')
export class DocumentsController {
  @Get(':id')
  @Permission('document:read:*')
  getOne(@Param('id') id: string) { ... }

  @Post()
  @Permission('document:write:*')
  @RateLimit({ bucket: 'tenant', scope: 'documents.write' })
  @Audit({ entity: 'document', op: 'create' })
  @Idempotent('Idempotency-Key')
  create(@Body() dto: CreateDocDto) { ... }

  @Delete(':id')                  // soft delete
  @Permission('document:delete:*')
  remove(@Param('id') id: string) { ... }

  @Delete(':id')                  // hard delete via ?hard=true
  @Permission('document:hard_delete:*')
  hardRemove(@Param('id') id: string, @Query('hard') h: 'true') { ... }

  @Post(':id/restore')
  @Permission('document:restore:*')
  restore(@Param('id') id: string) { ... }

  @Get('_trash')
  @Permission('document:read_trash:*')
  listTrash() { ... }

  @Get('reports/usage')
  @Permission('document:read:*')
  @ReadOnly()
  usageReport() { ... }
}
```

`@ReadOnly()` switches the route's transaction to `role='reader'`,
`readonly=true` (I7 enforcement; see `tenancy-model.md`).

`@Public()` opts out of auth entirely (e.g. login, healthz). Use
sparingly — every route without `@Permission`/`@Public`/`@System`
fails CI per I4.

`@System()` allows cross-tenant operations on platform routes.
Audited automatically.

## Effective permission resolution (§6.3)

Resolved **once at session creation**. Hashed into `perms_hash`.
Cached in Redis with pub/sub invalidation on mutation.

The bearer JWT carries `perms_hash` (claim, see `tenancy-model.md`).
On request:

1. JWT verified via JWKS.
2. Session lookup by `sid`.
3. `perms_hash` compared to the cached value; match → use cached perm
   set; mismatch → re-resolve from DB and update cache.
4. Permission check is `cached_set.has(required_key)`.

## ADR-002 — three-tier cache

The cache implementation
(`packages/auth/src/permission-cache.ts:68–70`):

```typescript
new TtlLruCache<string, PermissionCacheRecord>(5_000, 10_000); // tier 1: in-process LRU
new TtlLruCache<string, HashProbeState>(1_000, 10_000); // hash-probe cache
// + Redis tier (tier 2) and DB fallback (tier 3)
```

### Six mutation paths that update `effective_hash`

ADR-002 §2.6 lists the six writes that must update
`auth.memberships.effective_hash` and emit a Redis pub/sub
invalidation:

1. Adding a permission to a role.
2. Removing a permission from a role.
3. Adding a role to a user.
4. Removing a role from a user.
5. Adding a user to a group.
6. Removing a user from a group.

Implementation:
`packages/auth/src/effective-hash-computer.ts` (referenced from
audit). Each mutation computes the new hash inside the same
transaction that performs the write, so cache invalidation is
atomic with the change.

## Hash probe

When a new request arrives carrying a stale `perms_hash`, the auth
guard probes the hash-probe cache (tier 1.5) before falling back to
Redis. This protects the hot path from stampede on a popular role
mutation.

## Permissions seeding

Permissions are seeded by migration. The reference-api migration
(`reference/api/migrations/0001_reference.sql`) is the
canonical example; `[VERIFY exact INSERT shape in PORT-07]`.

## Read API

`GET /_audit/log` is platform-role gated. Per-tenant admin UIs get
a scoped subset.
