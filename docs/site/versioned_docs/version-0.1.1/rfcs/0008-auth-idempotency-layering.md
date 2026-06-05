---
slug: /rfcs/0008-auth-idempotency-layering
---

# RFC 0008: Auth Idempotency Decorator Layering

- Status: Accepted
- Date: 2026-04-27

## Problem

Spec section 3 places `@stynx/idempotency` above `@stynx/auth` in the package
DAG, but `@stynx/auth` imports `@NoIdempotent()` from `@stynx/idempotency`.

## Constraints

Session exchange, tenant switching, logout, and permission inspection endpoints
must opt out of mutation idempotency before a STYNX session has been issued.
Moving those annotations into the higher-level backend pipeline would hide the
route contract from the controller that owns it.

## Options

- Move a duplicate decorator into auth. This would remove the package edge but
  create two metadata symbols for one HTTP pipeline decision.
- Keep the dependency and document it as a narrow decorator-only exception.

## Decision

Keep the dependency as a documented exception. `@stynx/auth` may import only the
metadata decorator from `@stynx/idempotency`; it must not import idempotency
stores, interceptors, module providers, or backend implementations.

## Migration

No runtime migration is required. The dependency remains in
`packages/auth/package.json`, and the README records the constraint for future
reviews.

## Rollback

If the spec DAG becomes strict with no exceptions, move the shared decorator
metadata into a lower package such as `@stynx/core` and update both auth and
idempotency to consume that symbol.
