# Identity-Admin Convergence Plan (PORM + PEC)

## Objective
Converge `porm` and `pec` onto one shared provider adapter API implemented in:
- `@stech/stynx-contracts` (`IdentityAdminAdapter`)
- `@stech/stynx-auth-cognito-admin` (`CognitoIdentityAdminAdapter`)

## Promoted Generic Operations
The following PORM operations are promoted to generic provider-level capabilities:
- list users (with email/phone/group filters)
- get user by username
- get user by subject (`sub`)
- update user attributes
- enable/disable user
- list/add/remove user groups
- list groups
- reset password
- set password
- verify email/phone channels (implemented as `email_verified` / `phone_number_verified` updates)

Evidence from PORM and PEC:
- `../porm/backend/src/core/admin/users/users.service.ts`
- `../pec/src/admin/users/cognito-users.service.ts`

## Keep App-Local (Not Generic)
- local DB sync and role/meta enrichment in PORM:
  - `syncToLocal`, `syncUser`, `listGroupsWithMetaByUserId`, `resolveUserGroupLookup`
- app-local route-level authorization style:
  - PORM `AdminOnlyGuard`
  - PEC `@Roles(...ADMIN_ROLES)`

Note: `stynx` now provides optional local extension hooks for these operations through identity-admin local adapter contracts; concrete implementations remain app-owned.

## Standardized Config/Credentials Strategy
Implemented in `CognitoAdminAdapterOptions`:
- `region` (required)
- `userPoolId` (required)
- `endpoint` (optional)
- `credentialsStrategy`:
  - `default-chain` (recommended default)
  - `profile` (uses shared profile via `fromIni`)
  - `provided` (explicit credentials object/provider)
- `profile` (required for `profile` strategy)
- `credentials` (required for `provided` strategy)

### Recommendation
1. Production runtimes: `default-chain`
2. Local developer workflows: `profile` + `AWS_PROFILE`
3. Special automation/integration: `provided`

This eliminates PORM/PEC drift where each service currently resolves config and credentials differently.

## Error Mapping Policy (Implemented)
`mapCognitoError()` maps provider exceptions into shared `IdentityAdminError` codes:
- `IDENTITY_NOT_FOUND`
- `IDENTITY_FORBIDDEN`
- `IDENTITY_CONFLICT`
- `IDENTITY_RATE_LIMITED`
- `IDENTITY_VALIDATION_ERROR`
- `IDENTITY_PROVIDER_ERROR`

This gives both PORM and PEC consistent API-level semantics.

## PORM Migration Target
1. Introduce an app-local facade that delegates generic operations to `CognitoIdentityAdminAdapter`.
2. Keep PORM-only sync/meta methods in a separate local service.
3. Keep existing controller routes but route generic endpoints through adapter facade.

## PEC Migration Target
1. Replace direct AWS SDK calls in `CognitoUsersService` with `CognitoIdentityAdminAdapter` delegate.
2. Keep controller contract stable.
3. Optionally enrich with `setPassword` and `getBySub` endpoints if desired (now generic and available).

## Shared Facade Shape
Both apps should expose one facade split by concern:
- `identityAdminProvider`: generic Cognito provider operations
- `identityAdminLocal`: app-local sync/metadata/entitlement enrichment

This keeps `stynx` reusable while allowing app-specific extensions.
