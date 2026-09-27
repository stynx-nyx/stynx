# Authorization and session policy in STYNX 1.5.0

This is the Architect contract for CTG-0003, UPS-AUTHZ-01…07 and
UPS-SES-01…03 in DETRAN C-0002. OD-S15-01 makes every item required in
1.5.0. The design extends the existing packages; it does not import
consumer code. Defaults preserve existing applications using the built-in
stores; hosts with custom session stores have the migration described below.

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
It also exports `STYNX_AUTHZ_OPTIONS` from the dynamic module so a
consumer's local `@UseGuards(AuthorizationGuard)` instance receives
`resolveTarget`, `publicMetadataKey`, and `onDeny`.

The guard checks `publicMetadataKey` at method before class and skips
public routes before asking for a principal. It then reads existing
`STYNX_AUTHZ_METADATA` at method before class and calls `resolveTarget`
when supplied. `undefined` or `{}` from the resolver is no target;
a partial object with a nonempty resource **or** action is a target
and is passed unchanged. Without a target and without STYNX metadata,
the route is skipped. With a target, an evaluator can decide based on
it even when STYNX requirements are empty. Existing decorated routes
retain class-name/handler-name fallback only when the resolver did not
provide a target. No target or metadata may be inferred from a raw
header. A consumer that wants to skip incomplete metadata returns
`undefined`; its own resolver reads method before class as needed.
Exceptions thrown by a custom evaluator or `onDeny` propagate
unchanged. The factory's returned `Error` is thrown unchanged, so
Nest filters retain its HTTP status and body.

`PolicyEvaluationContext` in `@stynx-nyx/contracts` gains optional
`tenantId`. At guard time the pre-guard core `RequestContext` normally
contains request ID and time, not tenant: tenant enrichment occurs in
interceptors later. The guard therefore reads only a verified marker
keyed by the exported `STYNX_VERIFIED_TENANT_ID` symbol from
`@stynx-nyx/contracts`. `AuthContextGuard` clears it at request entry
and sets it only after the configured entitlement policy approves the
selected tenant or, without a policy, the selected tenant exactly
matches a member of `principal.tenants`. `StynxAuthGuard` clears it on
a public or failed authentication path and sets it from validated
session `claims.tenantId` on the private path. The tenant lifecycle
middleware can still enrich `request.tenantId` from a header but never
sets this marker. An unverified header leaves the policy evaluation
`tenantId` undefined. A Host-selected public tenant also remains
undefined at guard time.
The existing `principal.claims` is passed unchanged. For `global:true`,
the host must register its authentication guard as an earlier
`APP_GUARD` and import that module before
`StynxAuthorizationModule.forRoot({global:true})`. A controller-level
`@UseGuards(StynxAuthGuard)` runs after all global guards and cannot
provide identity to the global authorization guard. Tests exercise
both orders with the real auth guards and no pre-seeded request fields.
Denial invokes `onDeny` when supplied;
missing principal passes `undefined` so a consumer can emit an
authentication envelope. The default remains `ForbiddenException`
for denied policy and missing principal, preserving current behavior.

The default evaluator keeps role matching exact and case insensitive.
Permission matching is case insensitive in both backend and Angular.
Only a **granted** permission may contain a wildcard: global `*` or
a final `:*` after one or more complete colon-delimited segments.
`ops:*` grants `ops:read` and `ops:case:read`, but never `inf:x`,
`ops`, or `ops2:read`; `ops:case:*` grants `ops:case:read` but not
`ops:caser`. A wildcard on the required side is literal, never an
expansion. `StynxSessionService.hasAllPermissions`,
`hasAnyPermissions`, `stynxPermissionGuard`, and
`*stynxHasPermission` use the same semantics. The separate
`@stynx-nyx/auth` `PermissionGuard` remains exact; its migration is
outside CTG-0003 and must be noted in conformance. Empty requirements
keep their present behavior. Tests assert both grants and denials.

## Sessions

`@stynx-nyx/sessions` adds optional, independent policy settings:

```ts
interface StynxSessionsModuleOptions {
  singleSession?: { mode: 'off' | 'revoke-existing' | 'reject-new' };
  strongFactor?: {
    claimName?: string; // default: amr; can be acr or a custom verified claim
    acceptedValues: string[];
  };
}

interface SessionCreateMetadata {
  verifiedFactorClaims?: Record<string, unknown>;
  priorSessionId?: string;
}
```

The full module options and metadata retain their existing fields.
The `singleSession` default is `off`. Its conflict scope is one user
**within one target tenant**. An active prior record has status
`active`, `expiresAt > now`, and `idleExpiresAt > now` using the
service clock; an idle-expired Redis key is not a conflict.
`revoke-existing` invalidates every conflicting session and its
refresh token; `reject-new` creates nothing if a conflict exists.
An authenticated `priorSessionId` used for a switch is excluded from
the conflict set, including a same-tenant switch. No other tenant's
session is revoked merely due to the policy. The transition must be
atomic in both Redis and in-memory stores, including concurrent
creates across processes. Add an optional `SessionStore.createWithPolicy?(record,
{mode,now,priorSessionId?})` operation returning created/revoked
records or a typed conflict, with one Redis server-side script (or
WATCH/MULTI retry). It reads the user index, checks target tenant and
activeness, and completes each revoke with the same key deletion,
user/tenant index removal, and used refresh lookup as `revokeSession`,
then writes the new session and lookup. Mirror entries and
invalidation are emitted after commit from returned records. Existing
custom stores retain source compatibility at the TypeScript interface
but must implement `createWithPolicy` before upgrading if the host
mounts tenant switching. `SessionService` fails at module boot when
the method is absent, even with mode `off`, because every `exchange`
now requires an atomic prior-session transition. This is an explicit
custom-store migration requirement; built-in Redis and in-memory
stores implement the method. No process-local lock or list-then-create
is sufficient.
Default `off` and no prior session retain the existing create path.

`strongFactor` is disabled by default. If enabled, normalize
`acceptedValues` by trimming and lowercasing every entry and dropping
blank entries; fail at module boot when none remain. Split string
claims on commas and whitespace, drop empty tokens, and compare only
nonempty normalized values. The configured
`claimName` defaults to `amr` and may be `acr` or another verified
claim. The claim may be an array of strings or a string containing
values separated by commas and/or whitespace. Trim and compare
case insensitively; apply the same multi-value rule to `acr`. Empty,
numeric, object, or unmatched values fail. `StynxAuthService` takes
`verifiedFactorClaims` only from the Cognito token validated by
`CognitoJwtValidator`; `deviceMeta` from the client is never evidence.
`SessionService` persists only a server-derived
`strongFactorVerifiedAt` marker in the session record, not claim text.

The real switch boundary is `StynxAuthService.switchTenant` through
`exchangeExistingIdentity`; it passes `priorSessionId = actor.sid`.
Before any write, `SessionService` loads that prior record and proves
same user and active state. The verified factor marker is required
only when `strongFactor` is enabled. A successful
switch copies the marker's original timestamp into the new record,
enabling a second switch without trusting a client field. It uses
the atomic store transition to revoke the prior sid and create the
new one together, removing the current post-create revoke. Direct
`SessionService.exchange` follows the same path. A reject-new
conflict in the target tenant (other than the prior sid), absent
factor, or any policy denial happens before **any** revoke/create;
the old session remains active. A failed write must not leave both
old and new active or neither active. After commit,
`StynxAuthService` invalidates permission-cache entries for the prior
sid and every returned revoked sid, preserving the effect of its
former post-create revoke. Existing auth clients need no request
shape change.

The package exports `createSessionStoreReadinessIndicator(store,
{timeoutMs?})`, a structural `StynxHealthIndicator` named
`stynx-session-store`; default timeout is 500 ms. Its `check()` runs
a read-only optional `SessionStore.probeReadiness?()` when available and is
bounded by that timeout; otherwise it probes a fixed nonexistent
session key through `getSession`. `RedisSessionStore.probeReadiness`
checks `client.isReady` first (immediate down during reconnect) and
then sends `PING`; the bound prevents node-redis's offline queue from
hanging readiness. The in-memory store returns up. Failure returns
`down` with a safe reason. Hosts pass the indicator to the existing
`StynxHealthModule.forRoot(options, indicators)` API. The composition
test lives in `reference/api/test/integration`, whose manifest already
depends on both packages; it starts its own Redis container, pauses
it rather than quitting the client, verifies down within the timeout
while the client reconnects, and verifies up after unpause.
No sessions→health runtime dependency or manifest edit is needed.

## Proof and release binding

Nest E2E uses the actual `forRoot({global:true})` provider path and
proves global guard registration after real authentication
APP_GUARDs, the reverse-order denial, undecorated and public bypass,
target precedence and partial targets, principal claims and tenant,
custom 401/403 status **and JSON body** through `StynxErrorFilter`,
and injectable default/custom evaluator. Include a no-entitlement-policy
case with a forged tenant header outside `principal.tenants`, with and
without `TenantLifecycleMiddleware`; neither reaches the evaluator as
verified tenant. Local `@UseGuards(AuthorizationGuard)` tests prove the
exported options. Backend and Angular tests
exercise permission grants and absence, especially cross-resource
denial, case, intermediate prefixes and required-side literal `*`.
Session HTTP and service tests cover both single-session modes,
same-tenant concurrent creation and `exchange` across multiple real
Redis clients, prior-sid exclusion, reject-new rollback, idle-expired
non-conflict, cross-tenant isolation, refresh
invalidation, verified-factor create and chained switch, spoofed
device metadata, and readiness up/down. Redis integration is
required for the atomic policy; mocks alone cannot prove it.
Existing behavior is also tested with both policies disabled.
The Redis policy script currently targets standalone Redis; Cluster
or routing proxies are unsupported until keys are declared in one
hash slot. Session and auth READMEs state the custom-store migration
requirement, factor provenance, and readiness composition.

Rebind public API baselines for changed packages, trace for changed
tests, the fixed-group changeset, and generated package READMEs.
Run `pnpm check:rls-negative`, `pnpm test:int`, focused Redis/Nest
integration, `pnpm ci:reference-apps`, and `pnpm ci:stynx` before the
single CTG PR. No generated artifact is edited by hand.
