**@stynx-nyx/auth**

---

# @stynx-nyx/auth

Public authentication, authorization, permission-cache, and Cognito exports.

## Classes

- [ActorContextInterceptor](classes/ActorContextInterceptor.md)
- [CognitoIdentityAdminAdapter](classes/CognitoIdentityAdminAdapter.md)
- [CognitoJwtValidator](classes/CognitoJwtValidator.md)
- [CognitoTokenVerifier](classes/CognitoTokenVerifier.md)
- [EffectiveHashComputer](classes/EffectiveHashComputer.md)
- [InMemoryPermissionCacheBackend](classes/InMemoryPermissionCacheBackend.md)
- [PermissionCache](classes/PermissionCache.md)
- [PermissionCacheMetrics](classes/PermissionCacheMetrics.md)
- [PermissionGuard](classes/PermissionGuard.md)
- [PermissionQueryService](classes/PermissionQueryService.md)
- [RedisPermissionCacheBackend](classes/RedisPermissionCacheBackend.md)
- [StynxAuthController](classes/StynxAuthController.md)
- [StynxAuthGuard](classes/StynxAuthGuard.md)
- [StynxAuthModule](classes/StynxAuthModule.md)
- [StynxAuthService](classes/StynxAuthService.md)
- [StynxJwtValidator](classes/StynxJwtValidator.md)

## Interfaces

- [CognitoAccessTokenClaims](interfaces/CognitoAccessTokenClaims.md)
- [CognitoAdminAdapterOptions](interfaces/CognitoAdminAdapterOptions.md)
- [CognitoAdminOptionsFromEnvOverrides](interfaces/CognitoAdminOptionsFromEnvOverrides.md)
- [CognitoTokenVerifierOptions](interfaces/CognitoTokenVerifierOptions.md)
- [HashProbeState](interfaces/HashProbeState.md)
- [PermissionCacheBackend](interfaces/PermissionCacheBackend.md)
- [PermissionCacheRecord](interfaces/PermissionCacheRecord.md)
- [RequestLike](interfaces/RequestLike.md)
- [ResolvedPermissionState](interfaces/ResolvedPermissionState.md)
- [ResolvedStynxAuthModuleOptions](interfaces/ResolvedStynxAuthModuleOptions.md)
- [SessionActor](interfaces/SessionActor.md)
- [SessionExchangeBody](interfaces/SessionExchangeBody.md)
- [SessionSwitchBody](interfaces/SessionSwitchBody.md)
- [StynxAccessTokenClaims](interfaces/StynxAccessTokenClaims.md)
- [StynxAuthModuleOptions](interfaces/StynxAuthModuleOptions.md)

## Type Aliases

- [CognitoAdminCredentialStrategy](type-aliases/CognitoAdminCredentialStrategy.md)
- [PermissionCacheTier](type-aliases/PermissionCacheTier.md)

## Variables

- [joseLoader](variables/joseLoader.md)
- [STYNX_AUTH_OPTIONS](variables/STYNX_AUTH_OPTIONS.md)
- [STYNX_PERMISSION_CACHE_BACKEND](variables/STYNX_PERMISSION_CACHE_BACKEND.md)
- [STYNX_PERMISSION_ROUTE](variables/STYNX_PERMISSION_ROUTE.md)
- [STYNX_PUBLIC_ROUTE](variables/STYNX_PUBLIC_ROUTE.md)
- [STYNX_READONLY_ROUTE](variables/STYNX_READONLY_ROUTE.md)
- [STYNX_SYSTEM_ROUTE](variables/STYNX_SYSTEM_ROUTE.md)

## Functions

- [buildCognitoAdminOptionsFromEnv](functions/buildCognitoAdminOptionsFromEnv.md)
- [mapCognitoError](functions/mapCognitoError.md)
- [Permission](functions/Permission.md)
- [Public](functions/Public.md)
- [ReadOnly](functions/ReadOnly.md)
- [resolveAuthOptions](functions/resolveAuthOptions.md)
- [System](functions/System.md)
- [verifyAuthMutationCoverage](functions/verifyAuthMutationCoverage.md)
