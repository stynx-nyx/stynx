# `@stynx-nyx/sessions` — STYNX session lifecycle, JWT signing, key rotation, JWKS endpoint

`@stynx-nyx/sessions` issues + manages STYNX-side session JWTs. It signs access tokens with a rotation-friendly key set, exposes a JWKS endpoint so consumers can verify, supports in-memory + Redis session stores for pin/revoke flows, and mirrors session events to an external writer for audit/observability. Paired with `@stynx-nyx/auth` which exchanges an upstream Cognito token for one of these sessions and verifies them on subsequent requests.

## Purpose

A STYNX app needs short-lived access tokens it controls (not directly Cognito tokens), with: rotation of the signing key without downtime, revocation by session-id (for "log out everywhere"), session pinning to a device, and a JWKS endpoint so client SDKs and other services can verify tokens.

You reach for `@stynx-nyx/sessions` whenever `@stynx-nyx/auth` is wired — the two packages work as a unit. You configure the signing key set (active kid + retired kids still trusted for verification) and the store backend.

What it does NOT do: it doesn't verify upstream Cognito tokens (`@stynx-nyx/auth` does), doesn't manage user accounts (admin endpoints live in `backend/identity-admin`), doesn't issue refresh tokens — STYNX sessions are short-lived and re-issued by a fresh Cognito exchange.

## Audience

Backend developers wiring authentication. Direct interaction is unusual — most use goes through `@stynx-nyx/auth`'s session-exchange. You configure this package; you rarely call it.

## Install

```bash
pnpm add @stynx-nyx/sessions
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/contracts` `^1`, `jose` `^5` (for JWT signing/verification), `ioredis` (optional, for Redis store).

**Node:** 24.x.

## Quick start

```ts
import { StynxSessionsModule } from '@stynx-nyx/sessions';

StynxSessionsModule.forRoot({
  signing: {
    activeKid: 'kid-2026-06',
    keys: {
      'kid-2026-06': {
        /* EC P-256 private key */
      },
      'kid-2026-04': {
        /* retired but still verifying */
      },
    },
    accessTokenTtl: '15m',
  },
  store: { kind: 'redis', redis: { host: 'redis.internal' } },
});
```

The `/sessions/jwks.json` endpoint becomes publicly available (verifiers fetch it to validate tokens).

## Public API surface

### Modules

| Export                | Signature                                 | Description                                                           |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `StynxSessionsModule` | `.forRoot(options: StynxSessionsOptions)` | Registers the JWKS controller, signing service, store, mirror writer. |

### Services / Injectables

| Export                     | Description                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `StynxSessionsService`     | High-level operations: create session, revoke session, list active sessions for a user.                  |
| `SessionJwtSigningService` | Signs access tokens with the active kid; throws `SessionSigningKeyError` if active kid is not in `keys`. |
| `InMemorySessionStore`     | Default store. Single-instance only.                                                                     |
| `RedisSessionStore`        | Multi-instance store.                                                                                    |
| `SessionMirrorWriter`      | Mirrors session events (create/revoke) to a configured downstream (e.g. SQS, EventBridge).               |

### Endpoints (1 controller)

| Method | Path                  | Auth   | Description                                                                              |
| ------ | --------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `GET`  | `/sessions/jwks.json` | public | JSON Web Key Set for the active + retired kids. Verifiers fetch this to validate tokens. |

### Errors

| Export                   | Code                            | Description                                   |
| ------------------------ | ------------------------------- | --------------------------------------------- |
| `SessionSigningKeyError` | `SESSION_SIGNING_KEY_NOT_FOUND` | `activeKid` is not present in `keys` map.     |
| `SessionNotFoundError`   | `SESSION_NOT_FOUND`             | Operation on a session-id that doesn't exist. |
| `SessionRevokedError`    | `SESSION_REVOKED`               | Session was revoked.                          |

### Types / Interfaces

| Export                 | Description                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `StynxSessionsOptions` | `forRoot()` options.                                                                                |
| `SessionRecord`        | Persisted session metadata: `{ id, userId, tenantId?, issuedAt, expiresAt, kid, devicePin?, ... }`. |

## Configuration

### `StynxSessionsModule.forRoot()` options

| Option                   | Type                           | Default       | Description                                                            |
| ------------------------ | ------------------------------ | ------------- | ---------------------------------------------------------------------- |
| `signing.activeKid`      | `string`                       | (required)    | Kid used to sign new tokens.                                           |
| `signing.keys`           | `Record<kid, JWK>`             | (required)    | Map of kid → key. Retired kids stay here so older tokens still verify. |
| `signing.accessTokenTtl` | `string`                       | `'15m'`       | TTL for issued access tokens.                                          |
| `store.kind`             | `'in-memory' \| 'redis'`       | `'in-memory'` | Store backend.                                                         |
| `store.redis`            | `RedisOptions`                 | n/a           | Redis config when `kind: 'redis'`.                                     |
| `mirror.writer`          | `SessionMirrorWriter \| false` | `false`       | Optional event mirror (SQS, EventBridge).                              |
| `pinning.enabled`        | `boolean`                      | `false`       | Require client to send device-fingerprint on each request.             |

## Examples

### Example 1 — basic config

```ts
StynxSessionsModule.forRoot({
  signing: {
    activeKid: 'kid-2026-06',
    keys: { 'kid-2026-06': loadJwkFromSecret() },
    accessTokenTtl: '15m',
  },
});
```

### Example 2 — key rotation (zero-downtime)

```ts
// Step 1: deploy with both old and new kid; active=old
signing: { activeKid: 'kid-2026-04', keys: { 'kid-2026-04': old, 'kid-2026-06': new } }

// Step 2: deploy with active flipped to new; old still in map (verifies in-flight tokens)
signing: { activeKid: 'kid-2026-06', keys: { 'kid-2026-04': old, 'kid-2026-06': new } }

// Step 3: after all old tokens expire, remove old kid
signing: { activeKid: 'kid-2026-06', keys: { 'kid-2026-06': new } }
```

### Example 3 — mirroring session events

```ts
mirror: {
  writer: {
    async writeCreated(session) { await sqs.send({ ... }); },
    async writeRevoked(sessionId) { await sqs.send({ ... }); },
  },
}
```

## Common pitfalls

- **`SessionSigningKeyError` at startup** — `activeKid` isn't in `keys`. Common during rotation if you flip activeKid but forgot to ship the new private key.
- **In-memory store across multiple instances** — each instance has its own session set; revoke on one instance leaves the session valid on others. Use Redis in any multi-instance deploy.
- **JWKS endpoint cached too aggressively** — verifiers may cache the JWKS for hours. Plan rotation timelines accordingly.
- **Mirror writer blocking session creation** — if your `mirror.writer` is slow (or down), session creation stalls. Wrap the mirror in a try/catch or use a queue for back-pressure isolation.

## Related packages

- [`@stynx-nyx/auth`](/docs/packages/auth/) — exchanges upstream tokens for STYNX sessions via this package; verifies sessions on subsequent requests.
- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` for session-bound request metadata.
- [`@stynx-nyx/angular-sessions`](/docs/packages-web/angular-sessions/) — Angular pair: session-list UI + revoke-other-sessions action.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-sessions/`](/docs/api-reference/stynx-sessions/)
