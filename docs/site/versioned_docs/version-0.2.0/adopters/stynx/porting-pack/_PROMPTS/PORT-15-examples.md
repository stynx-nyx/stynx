# PORT-15 — Reference Examples

**Produces:** five files under `docs/stynx/porting-pack/15-REFERENCE-EXAMPLES/`.
**Depends on:** `06`, `07`, `08`, `09`.
**Branch:** `docs/stynx/porting-pack/15-examples`.

## Mission

Concrete, copy-pasteable before/after examples. The consuming agent
treats these as templates.

## Files

### 1. `before-after-service.md`

A typical CRUD service in a realistic foreign style:

- "Before" — raw `pg.Pool` + manual `WHERE org_id = $1` + ad-hoc
  `is_deleted` flag. ~80–120 lines.
- "After" — STYNX-compliant rewrite using `Database.tx`,
  `softDelete`, `@Permission`. ~80–120 lines.
- Annotations between: what changed and why, citing
  `04`/`06`/`07`.

### 2. `before-after-migration.md`

Legacy `CREATE TABLE` (with `organization_id`, `deleted boolean`,
no RLS, no audit) → STYNX rewrite using
`data.create_soft_deletable_table` (or actual helper) with all
invariants. Annotations cite the migration linter rules from `08`.

### 3. `before-after-controller.md`

Controller with custom JWT middleware → rewrite with `@stynx-nyx/auth`
guards, `@Permission`, `@RateLimit`, `@Idempotent`. Show the
NestJS module wiring at the end.

### 4. `before-after-frontend-component.md`

Angular component with hand-rolled HTTP calls + auth handling →
rewrite using `@stynx-nyx/sdk` + `StynxAngularModule` + the
relevant `angular-*` package. If the foreign frontend is React,
include a parallel React/SDK example as an appendix.

### 5. `full-feature-walkthrough.md`

End-to-end walkthrough of a realistic feature ("invoice management
with multi-tenant access, soft-delete, audit, file attachments,
LGPD-aware"). All layers — migration, service, controller,
frontend, tests — in one document. Target 600–800 lines.

## Rules

- Every "After" example must compile against the actual `@stynx-nyx/*`
  exports as documented in `05-PACKAGE-CATALOG.md`. Verify imports.
- Every example is annotated — the agent should learn the _why_,
  not just the diff.
- The "full feature" example exercises at least one cascade FK,
  one block FK, one hide FK, one PII column, one read-only route,
  one idempotent route.

## Acceptance

- All five files present.
- Each has both Before and After sections.
- The full-feature example is the longest and exercises the
  required FK + decorator coverage.
- Imports in After examples match real package surfaces.
