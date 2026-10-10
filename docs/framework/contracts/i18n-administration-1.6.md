# I18n administration contract for 1.6

[ADR-0019](../../../law/adr/2026-10-10-minor-release-1.6.0.md) accepts this
security correction under the Owner's complete 1.6.0 audit mandate. It implements
the existing [RBAC invariant](../../../law/invariants/INV-RBAC-001.json) and
[threat-model trust boundaries](../../meta/security/threat-model.md), without a
new public/system route exemption or a weaker database role.

## Protected HTTP boundary

Preserve the implemented routes and override representations:

| Method | Actual URL                 | Required permission |
| ------ | -------------------------- | ------------------- |
| GET    | `/_tenancy/i18n/overrides` | `i18n:read`         |
| PUT    | `/_tenancy/i18n/overrides` | `i18n:write`        |

Use the real `StynxAuthGuard` and `PermissionGuard` with explicit per-method
permission metadata. A verified principal and admitted tenant membership are
required; tenant membership alone is not administration permission. Grant these
permissions through normal reviewed tenant role bindings. No implicit wildcard,
platform-admin or owner bypass is introduced. Preserve the actual URLs, response
envelopes, override merge semantics and existing idempotency classification.
Missing/invalid authentication is a protected refusal; an authenticated principal
without the required permission is denied. A public or system marker cannot
replace either guard.

For the protected StynxAuthGuard validation path, translate only the existing
typed `InvalidCredentialError` into HTTP 401 `UnauthorizedException`. Keep the
optional-public-tenant invalid-credential behavior and all session/membership
admission rules. Validator, session, permission-store and infrastructure failures
are not invalid credentials and retain their failure semantics; no broad catch
may convert them into 401 or nominal optional authentication.

The canonical admitted RequestContext supplies the tenant and audit actor.
Protected operations reject missing context and any explicit tenant that differs
from that context before reading a cache or executing SQL. Caller-supplied tenant
headers, payload identities or unverified JWT claims do not establish authority.
Normal reads use the actual restricted reader role, readonly transactions and
primary routing when needed for fresh override visibility; normal updates use
the app role. Both retain tenant and actor session settings, tenant predicates
and FORCE RLS. No normal request creates SystemContext or borrows an owner
connection to make a query succeed.

Use the existing `Database.txIndependent` for administration list/update and
cold catalog/locale SQL. An ambient held connection or transaction, including
one concealed by a derived/reset CLS context, is an explicit refusal. Do not
borrow the outer connection's owner/app/reader identity or treat release of a
savepoint as final commit. Publish a successful update's cache only after its
independent transaction actually commits; a nested/savepoint success followed
by outer rollback must never publish an override. Cold-cache priming follows
the same independent transaction boundary. Preserve the existing typed held-
transaction refusal instead of clearing context to bypass it.

`packages/data/migrations/platform/0004_tenancy.sql` already forces RLS on
`tenancy.tenant_settings`; `0009_grants_ddl_privileges.sql` grants app data access
and reader SELECT. Verify those actual installed privileges and tenant isolation
instead of rewriting historical migrations or relaxing their policies. Any
demonstrated additional storage correction uses the normal forward-migration
process. Cache publication follows successful transaction completion and must
not expose an override from a rolled-back update.

## Locale and cache admission

The global LocaleInterceptor also runs on public bootstrap operations. Without a
verified tenant and actor established by canonical authentication/membership
admission, it skips tenant-specific settings SQL and tenant override cache reads
or writes. Preserve the applicable session/header/catalog/default locale
precedence and existing non-tenant fallback. A tenant header alone neither
triggers an owner lookup nor turns a public bootstrap route into a missing-actor
error. Protected administration itself still refuses missing context.

For admitted normal requests, LocaleService and CatalogService use restricted
reader transactions for tenant settings and overrides. Validate an explicitly
supplied tenant against the admitted RequestContext before cache access,
including warm-cache translation, priming and cache mutation. A warm cache must
not bypass tenant admission. Preserve tenant cache separation and existing
catalog/locale behavior. A literal tenant/actor string pair without its trusted
admission provenance is insufficient.

Within HTTP processing, dynamically consume the existing read-only
`STYNX_RESOLVED_TENANT_COMMAND_CONTEXT` proof port for the actual request. Require
mode `protected` or `verified`, and exact tenant/actor equality with the current
RequestContext, before tenant SQL or any tenant cache access. A PublicTenantRoute
`nominal` proof is not a verified user even when its configured nominal actor
populates RequestContext; it retains non-tenant locale/catalog fallback. Missing,
stale, mismatched or nominal proof never becomes tenant authority through a warm
cache, header, public marker or nested SystemContext. Do not invent a new public
auth marker, context brand or contract schema.

LocaleInterceptor records HTTP origin in private AsyncLocalStorage for the
actual observable execution, including lazy subscription, handler continuation
and applicable error translation. This origin survives a derived/reset CLS
RequestContext and is not an externally writable capability. Without qualifying
HTTP proof, locale fallback omits tenant overrides; explicit tenant operations
refuse before cache/SQL. Trusted internal callers outside HTTP may continue to
establish RequestContext through the existing application boundary; their
literal tenant/actor pair needs no new public branding API.

## Explicit internal administration and compatibility

Preserve exported classes, method signatures and legitimate internal
administration through an explicit system-only port. It requires an already
active SystemContext established by the authorized internal caller; the method
must not manufacture that capability itself. Seeds and internal administration
declare their system operation, actor, target tenant and actual owner role.
SystemContext logging is evidence of an internal operation, not authentication
or permission for an HTTP caller. Normal controller and locale paths never use
this owner port, including when another internal operation has nested system
context into the request.

The private HTTP-origin scope also prevents an HTTP continuation from selecting
the internal system exception after clearing its tenant/actor CLS frame. For
shared Catalog operations, permit the explicit internal system lane only outside
HTTP origin and without an active tenant frame. An active normal tenant frame
always chooses the restricted tenant lane, even inside SystemContext; an
incomplete or mismatched frame is refused, not reinterpreted as system
administration. An explicit legacy internal update also validates its eventual
cache-publication context before owner SQL; it must not commit a target and then
refuse publication because the active tenant frame belongs to another tenant.

Add separate tenant-context methods only if needed to preserve the existing
internal API while making the request path unambiguous. Do not change public
route defaults solely to obtain a performance result. A supported composition
may justify additive `mountController?: boolean`, default true, following the
Preferences module precedent; otherwise omit it. The default mounted controller
is protected in either case. No new option permits an unguarded HTTP mount or
automatic owner execution.

Engineer declares the actual auth, contracts proof-port and already-used
idempotency runtime dependencies, updates the lockfile, supplies the fixed-group
minor changeset and regenerates package readmes. Correct stale package prose
about the route path. Preserve installed-package boundaries; do not add a
sibling source dependency. Architect separately reviews intended emitted API
changes and rebinds public API/trace artifacts after implementation and Inspector
tests are final.

## Independent acceptance

Inspector retains every existing behavioral assertion while adapting fixtures to
real verified authentication, explicit permission grants and explicit internal
seed context. Add demonstrated-gap checks for missing/invalid authentication,
missing read/write permissions, two-tenant denial, absent actor, mismatched
tenant before warm-cache access, direct restricted reader/app identities,
request-time absence of owner queries, rollback-safe cache publication and
explicit system-only administration. Exercise the actual service/module and
installed package where applicable. Public preauth routes with a tenant header
must still reach their legitimate fallback without tenant SQL/cache access.
Include independently reproduced nested-savepoint rollback/cache leakage,
borrowed SQL roles, hidden held connections, HTTP CLS-reset system fallback and
actual PublicTenantRoute nominal-actor warm-cache witnesses. Verify the real
proof-port modes and observable lifetime, plus protected typed-invalid-credential
401 and unchanged infrastructure failures; simulated string identities alone
cannot close these HTTP boundaries.

The real supported i18n performance root preserves normal guards, pipeline,
security headers and middleware. Functional checks, direct SQL actor/RLS proof,
fresh source/build/runtime custody and complete HTTP measurement remain separate
obligations. This contract supplies no performance or audit PASS.
