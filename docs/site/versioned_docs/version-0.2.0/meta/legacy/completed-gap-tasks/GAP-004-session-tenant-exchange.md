# GAP-004 — Sessions: Tenant-Switch Without Logout

**Priority:** MEANINGFUL  
**Package:** `packages/sessions`  
**Source of truth:** pec's `POST /auth/sessions/&#123;id&#125;/exchange`  
**Run from:** `./stynx` repo root
**Status:** Complete

---

## Context

`@stynx/sessions` has no way for a user to switch to a different tenant
context without first logging out and logging back in. pec exposes
`POST /auth/sessions/&#123;id&#125;/exchange` which atomically revokes the current
session and issues a new one bound to the requested tenant, provided the
actor already holds a valid membership in that tenant.

Without this, multi-tenant UIs must implement round-trip logouts, which
creates a bad UX and increases the attack surface for token replay between
logout and re-login.

---

## Goal

Add an `exchange(sessionId, newTenantId, actor)` method to `SessionService`
that atomically revokes the originating session and creates a new one for the
target tenant. Add the supporting types and errors. Expose through index.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `packages/sessions/src/session.service.ts`
- `packages/sessions/src/types.ts`
- `packages/sessions/src/errors.ts`
- `packages/sessions/src/index.ts`

---

## Step 2 — Add types to `packages/sessions/src/types.ts`

Append after the existing type definitions:

```typescript
export interface SessionExchangeOptions {
  /** The session being replaced. Must be active and belong to `actorUserId`. */
  sessionId: string;
  /** The tenant the new session should be scoped to. */
  newTenantId: string;
  /** The user performing the exchange — must match the originating session. */
  actorUserId: string;
  /** Optional membership ID in the new tenant. */
  membershipId?: string;
  /** Optional device metadata to carry over or override. */
  deviceMeta?: DeviceMetadata;
  /** Optional permissions hash for the new tenant context. */
  permsHash?: string;
}

export interface SessionExchangeResult {
  /** The new session bundle issued for the target tenant. */
  bundle: SessionBundle;
  /** The session ID that was revoked. */
  revokedSessionId: string;
}
```

---

## Step 3 — Add `SessionExchangeError` to `packages/sessions/src/errors.ts`

Append after the existing error classes:

```typescript
export class SessionExchangeError extends Error {
  constructor(
    public readonly code: 'SESSION_NOT_FOUND' | 'SESSION_OWNER_MISMATCH' | 'SESSION_NOT_ACTIVE',
    message: string,
  ) {
    super(message);
    this.name = 'SessionExchangeError';
  }
}
```

---

## Step 4 — Add `exchange()` to `SessionService`

In `packages/sessions/src/session.service.ts`, add the following method to
the `SessionService` class (after the existing `touch()` method):

```typescript
async exchange(options: SessionExchangeOptions): Promise<SessionExchangeResult> {
  const current = await this.store.getSession(options.sessionId);
  if (!current) {
    throw new SessionExchangeError('SESSION_NOT_FOUND', `Session ${options.sessionId} not found`);
  }
  if (current.userId !== options.actorUserId) {
    throw new SessionExchangeError(
      'SESSION_OWNER_MISMATCH',
      `Session ${options.sessionId} does not belong to user ${options.actorUserId}`,
    );
  }

  const now = this.now();
  try {
    this.assertActive(current, now);
  } catch {
    throw new SessionExchangeError(
      'SESSION_NOT_ACTIVE',
      `Session ${options.sessionId} is no longer active`,
    );
  }

  // Revoke the originating session before creating the replacement so that
  // if the subsequent create fails the caller must re-authenticate.
  await this.revokeInternal(options.sessionId, 'revoked', undefined);

  const bundle = await this.create(
    options.actorUserId,
    options.newTenantId,
    current.cognitoSub,
    options.deviceMeta ?? current.deviceMeta ?? {},
    {
      ...(options.membershipId !== undefined ? { membershipId: options.membershipId } : {}),
      ...(options.permsHash !== undefined ? { permsHash: options.permsHash } : {}),
    },
  );

  return { bundle, revokedSessionId: options.sessionId };
}
```

Import `SessionExchangeError` and `SessionExchangeOptions`, `SessionExchangeResult`
at the top of `session.service.ts`:

```typescript
import { SessionExchangeError } from './errors';
import type { SessionExchangeOptions, SessionExchangeResult } from './types';
```

---

## Step 5 — Verify index exports

`packages/sessions/src/index.ts` already has `export * from './errors'` and
`export * from './types'`. The new types and error class are automatically
exported. Confirm after build that they appear:

```bash
pnpm --filter @stynx/sessions build && node -e "const m = require('./packages/sessions/dist'); console.log(Object.keys(m))" | tr ',' '\n' | grep -iE "exchange|Exchange"
```

---

## Step 6 — Add unit test

In `test/packages/` add `session-exchange.test.ts`:

```typescript
// 1. Create a session via SessionService.create() using an in-memory store
// 2. Call exchange() with matching actorUserId and a different newTenantId
//    — expect SessionExchangeResult with a new bundle whose tenantId === newTenantId
//    — expect the original session to be revoked (status === 'revoked')
// 3. Call exchange() with a mismatched actorUserId — expect SessionExchangeError
//    with code SESSION_OWNER_MISMATCH
// 4. Call exchange() with a non-existent sessionId — expect SessionExchangeError
//    with code SESSION_NOT_FOUND
// 5. Revoke the session manually, then call exchange() — expect SESSION_NOT_ACTIVE
```

---

## Verification

```bash
# TypeScript builds
pnpm --filter @stynx/sessions build

# Unit tests pass
pnpm --filter @stynx/sessions test

# Lint clean
pnpm --filter @stynx/sessions lint
```

---

## Acceptance criteria

- [x] `SessionExchangeOptions` and `SessionExchangeResult` exported from `@stynx/sessions`
- [x] `SessionExchangeError` exported from `@stynx/sessions` with typed `code` field
- [x] `SessionService.exchange()` revokes the source session before issuing the replacement
- [x] Owner mismatch and inactive session are each rejected with typed errors
- [x] Unit test covers happy path and all three error cases
- [x] `pnpm build`, `pnpm test:unit`, `pnpm lint` all green
