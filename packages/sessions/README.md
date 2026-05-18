# @stynx/sessions

Redis-backed sessions, refresh-token rotation, JWT/JWKS signing, session mirror writing, and bulk revocation helpers.

## Purpose

Redis-backed sessions, refresh-token rotation, JWT/JWKS signing, session mirror writing, and bulk revocation helpers.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/sessions';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxSessionsModule` when STYNX issues or mirrors sessions locally.

```ts
@Module({
  imports: [StynxSessionsModule.forRoot({ store, mirror, signingKeys })],
})
export class SessionsHostModule {}
```

## Data And Security Model

Access tokens are RS256 signed and exposed through JWKS. Refresh tokens are opaque, rotated, reuse-detected, and indexed for user/tenant revocation. Durable mirrors write through @stynx/data.

## Example

```ts
import { SessionService } from '@stynx/sessions';

const bundle = await sessions.exchangeRefreshToken({ refreshToken, device });
```

## Public API

- StynxSessionsModule
- SessionService
- SessionJwtSigningService
- JwksController
- RedisSessionStore and in-memory store
- SessionMirrorWriter
- tokens, errors, and types

Current barrel highlights:

- `export * from './errors'`
- `export * from './in-memory-session-store'`
- `export * from './jwks.controller'`
- `export * from './jwt-signing.service'`
- `export * from './redis-session-store'`
- `export * from './session-mirror.writer'`
- `export * from './session.service'`
- `export * from './sessions.module'`
- `export * from './tokens'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx/sessions build
pnpm --filter @stynx/sessions test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/sessions test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/architecture/developer-documentation.md](../../docs/architecture/developer-documentation.md)
- [docs/stynx/package-architecture.md](../../docs/stynx/package-architecture.md)
- [docs/operations/runbooks/session-revocation.md](../../docs/operations/runbooks/session-revocation.md)
- [docs/security/README.md](../../docs/security/README.md)
