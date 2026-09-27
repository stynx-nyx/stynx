# Authorization and session policy in STYNX 1.5.0

This is the Architect contract for CTG-0003, UPS-AUTHZ-01…07 and
UPS-SES-01…03 in DETRAN C-0002. OD-S15-01 makes every item required in
1.5.0. The design extends the existing packages; it does not import
consumer code. Defaults preserve existing applications until they opt in.

## Authorization

`@stynx-nyx/backend` adds these options to the existing
`StynxAuthorizationModule.forRoot` API:

```ts
interface AuthorizationTarget {
  resource?: string;
  action?: string;
}

interface StynxAuthorizationModuleOptions {
  policyEvaluator?: PolicyEvaluator;
  global?: boolean;
  resolveTarget?: (ctx: ExecutionContext) => AuthorizationTarget | undefined;
  publicMetadataKey?: string | symbol;
  onDeny?: (
    ctx: ExecutionContext,
    target: AuthorizationTarget,
    principal: Principal | undefined,
  ) => Error;
}
```

`global: true` registers the one configured `AuthorizationGuard` as
`APP_GUARD` via `useExisting`; the default remains local. The module
always binds and exports `STYNX_AUTHZ_POLICY_EVALUATOR`, using the
supplied evaluator or `DefaultPolicyEvaluator`. Other services can
inject the token without constructing a guard. The exported token
stays the symbol already present in the backend barrel.

The guard checks `publicMetadataKey` at method before class and skips
public routes before asking for a principal. It then reads existing
`STYNX_AUTHZ_METADATA` at method before class and calls `resolveTarget`
when supplied. Without a target and without STYNX metadata, it skips
evaluation. With a target, an evaluator can decide based on the target
even when STYNX requirements are empty. Existing decorated routes
retain class-name/handler-name fallback when no resolver is configured.
The resolver's returned properties override only the corresponding
fallback property. No target or metadata may be inferred from a raw
header. Consumer metadata lookup (for example method over class) is
the consumer's resolver responsibility and is demonstrated in tests.

`PolicyEvaluationContext` in `@stynx-nyx/contracts` gains optional
`tenantId` from an active core `RequestContext`, falling back only to
the verified `request.tenantId` installed by tenancy middleware. It
never uses `X-Tenant-Id` directly. The existing `principal.claims` is
passed unchanged. No active context and no verified request tenant
leave `tenantId` undefined. Denial invokes `onDeny` when supplied;
missing principal passes `undefined` so a consumer can emit an
authentication envelope. The default remains `ForbiddenException`
for denied policy and missing principal, preserving current behavior.

The default evaluator keeps role matching exact and case insensitive.
Permission matching accepts exact permissions, the global `*`, and a
trailing `resource:*` for permissions beginning with `resource:` and
having a nonempty suffix. `ops:*` grants `ops:read` and nested
`ops:case:read`; it never grants `inf:x`, `ops`, or `ops2:read`.
`StynxSessionService.hasAllPermissions`, `hasAnyPermissions`, and
`*stynxHasPermission` use the same semantics. Empty requirements keep
their present behavior. Tests assert both grants and denials.

## Sessions

`@stynx-nyx/sessions` adds optional, independent policy settings:

```ts
interface StynxSessionsModuleOptions {
  singleSession?: { mode: 'off' | 'revoke-existing' | 'reject-new' };
  strongFactor?: {
    acceptedAmr?: string[];
    acceptedAcr?: string[];
  };
}

interface SessionCreateMetadata {
  verifiedFactor?: { amr?: string[]; acr?: string };
  priorSessionId?: string;
}
```

The full module options and metadata retain their existing fields.
The `singleSession` default is `off`. Its scope is one user **within
one tenant**. `revoke-existing` invalidates every previous active
session in that scope, including its refresh token, and emits the
usual mirror and invalidation evidence. `reject-new` creates nothing
when a prior active session exists in that scope. Other tenants are
untouched. The check and create/revoke transition must be atomic in
both Redis and in-memory stores, including concurrent creates. Extend
`SessionStore` with an atomic policy operation; custom stores must
implement it before opting in, with a fail-closed error if absent.
No process-local lock or list-then-create sequence is sufficient for
Redis. Default `off` retains the existing create path.

`strongFactor` is disabled by default. If enabled, configuration must
contain at least one accepted claim value. Creation requires a match
in the validated Cognito token's `amr` array or `acr` string. The
trusted auth boundary passes only these verified claims into
`SessionService.create`; user-supplied `deviceMeta` is never evidence.
The service persists a server-derived `strongFactorVerifiedAt` marker
in the session record, not arbitrary claim text. A tenant switch may
use `priorSessionId` only when the previous active session belongs to
the same user and contains that verified marker. Direct exchange uses
the same check. Missing, malformed, spoofed, or unacceptable claims
fail before creating or revoking a session. Existing auth clients need
no request shape change.

The package exports `createSessionStoreReadinessIndicator(store)`, a
structural `StynxHealthIndicator` named `stynx-session-store`. Its
`check()` performs a read-only storage probe and returns `up` or
`down` with a safe reason; hosts pass it to the existing
`StynxHealthModule.forRoot(options, indicators)` API. This avoids a
runtime dependency from sessions to health. Readiness must report a
disconnected Redis store as down.

## Proof and release binding

Nest E2E proves global guard registration, undecorated and public
bypass, target precedence, principal claims and tenant, custom deny
envelopes, and injectable default/custom evaluator. Backend and
Angular tests exercise permission grants and absence, especially
cross-resource denial. Session tests cover both single-session modes,
same-tenant concurrent creation, cross-tenant isolation, refresh
invalidation, verified-factor creation and switch, spoofed device
metadata, and readiness up/down. Redis integration is required for
the atomic policy; mocks alone cannot prove it. Existing behavior is
also tested with both policies disabled.

Rebind public API baselines for changed packages, trace for changed
tests, the fixed-group changeset, and generated package READMEs.
Run `pnpm check:rls-negative`, `pnpm test:int`, focused Redis/Nest
integration, `pnpm ci:reference-apps`, and `pnpm ci:stynx` before the
single CTG PR. No generated artifact is edited by hand.
