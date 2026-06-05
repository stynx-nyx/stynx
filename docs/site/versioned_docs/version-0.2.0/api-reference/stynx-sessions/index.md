**@stynx/sessions**

---

# @stynx/sessions

Public session management exports for stores, JWT signing, JWKS, and session mirroring.

## Classes

- [InMemorySessionStore](classes/InMemorySessionStore.md)
- [InvalidRefreshTokenError](classes/InvalidRefreshTokenError.md)
- [RedisSessionStore](classes/RedisSessionStore.md)
- [RefreshTokenReuseDetectedError](classes/RefreshTokenReuseDetectedError.md)
- [SessionExchangeError](classes/SessionExchangeError.md)
- [SessionExpiredError](classes/SessionExpiredError.md)
- [SessionJwksController](classes/SessionJwksController.md)
- [SessionJwtSigningService](classes/SessionJwtSigningService.md)
- [SessionMirrorWriter](classes/SessionMirrorWriter.md)
- [SessionService](classes/SessionService.md)
- [SessionSigningKeyError](classes/SessionSigningKeyError.md)
- [StynxSessionsModule](classes/StynxSessionsModule.md)

## Interfaces

- [DeviceMetadata](interfaces/DeviceMetadata.md)
- [IssuedAccessToken](interfaces/IssuedAccessToken.md)
- [RefreshTokenLookup](interfaces/RefreshTokenLookup.md)
- [ResolvedStynxSessionsModuleOptions](interfaces/ResolvedStynxSessionsModuleOptions.md)
- [SessionBundle](interfaces/SessionBundle.md)
- [SessionCreateMetadata](interfaces/SessionCreateMetadata.md)
- [SessionExchangeOptions](interfaces/SessionExchangeOptions.md)
- [SessionExchangeResult](interfaces/SessionExchangeResult.md)
- [SessionMirror](interfaces/SessionMirror.md)
- [SessionMirrorEntry](interfaces/SessionMirrorEntry.md)
- [SessionRecord](interfaces/SessionRecord.md)
- [SessionStore](interfaces/SessionStore.md)
- [StynxSessionSigningKey](interfaces/StynxSessionSigningKey.md)
- [StynxSessionSigningKeySet](interfaces/StynxSessionSigningKeySet.md)
- [StynxSessionsModuleOptions](interfaces/StynxSessionsModuleOptions.md)

## Type Aliases

- [SessionStatus](type-aliases/SessionStatus.md)

## Variables

- [STYNX_SESSION_MIRROR](variables/STYNX_SESSION_MIRROR.md)
- [STYNX_SESSION_STORE](variables/STYNX_SESSION_STORE.md)
- [STYNX_SESSIONS_OPTIONS](variables/STYNX_SESSIONS_OPTIONS.md)

## Functions

- [resolveSessionsOptions](functions/resolveSessionsOptions.md)
