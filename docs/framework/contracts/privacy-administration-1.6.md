# Privacy administration in STYNX 1.6

ADR-0019 records the Owner's selected boundary: tenant-scoped HTTP subject rights
and explicit global internal jobs. This contract corrects the demonstrated
unguarded, owner-elevating privacy implementation. It supplies scope and
acceptance obligations, not a provider, performance or release verdict.

## HTTP contracts

Preserve the three existing URLs, methods and operation IDs:

| Operation                                          | Success | Permission               | Scope                                          |
| -------------------------------------------------- | ------- | ------------------------ | ---------------------------------------------- |
| `POST /privacy/exports`                            | 201     | `privacy:subject-rights` | Verified tenant, optionally one member subject |
| `POST /privacy/erasures`                           | 201     | `privacy:subject-rights` | One member subject in the verified tenant      |
| `GET /privacy/retention`, omitted or `dryRun=true` | 200     | `privacy:read`           | Tenant retention report                        |
| `GET /privacy/retention?dryRun=false`              | 200     | `privacy:subject-rights` | Tenant retention application                   |

POST operations remain synchronous, with their existing completed-result fields
and `NoIdempotent` markers. Do not promise an asynchronous job or idempotent
external effects. Correct generated OpenAPI POST success responses to actual
201; do not change runtime success status to fit the old projection. Retention
keeps its existing `dryRun`, `actions` and `partitions` fields; tenant HTTP always
returns `partitions: []` and never executes or reports global partition work.

Actual STYNX authentication and permission enforcement are required. The
conditional retention permission uses the actual verified principal and cannot
admit effectful requests solely through `privacy:read`. It must not introduce
permission SQL that borrows a held connection. Authentication establishes the
principal before permission evaluation; canonical tenant admission subsequently
establishes the existing `STYNX_RESOLVED_TENANT_COMMAND_CONTEXT` proof. At tenant
operation entry require its `protected` or `verified` mode and an exact match to
the current tenant and actor. Parsed unsigned claims, nominal public-tenant
actors, environment switches and caller-created proof objects grant no admission.

The subject-rights permission delegates operations over the admitted tenant's
active member subjects. The caller may act on self or another such member; self
identity does not bypass permission. The subject remains distinct from the
verified audit actor. Inside the operation transaction, verify the subject's
active `auth.memberships` row for the effective tenant before subject data work.
Missing or foreign membership is a 403 without cross-tenant disclosure.

Validate actual runtime bodies as closed objects with UUID selectors and the
existing `json`/`csv` format enum. Export still requires `subjectUserId` or
`tenantId`, retaining its existing `PrivacyValidationError` 400 code/message
when neither is supplied. A supplied export tenant must equal the admitted
tenant or receive 403 before subject SQL or object-store work. Subject-only
exports still use that admitted tenant. Erasure accepts its existing required
`subjectUserId`; it gains no body-selected tenant. Malformed, blank or unknown
fields and unsupported query values are 400. Retention accepts only omitted,
`true` or `false`, with omitted meaning true. Invalid/inactive credentials are
401, insufficient permission/admission is 403, and infrastructure failures keep
their typed failure behavior. Preserve core error serialization.

## Restricted tenant execution

Controller methods use explicit tenant service ports. Tenant reads use primary
reader, readonly independent transactions. Erasure and retention application use
primary app write independent transactions; retain the same retention strategies,
counts and dry-run rules. Never create SystemContext, use owner, borrow a held or
hidden connection, or publish success after only a nested savepoint. Membership
and subject effects share the operation transaction. Refuse unsupported ambient
transaction state before SQL, cache or external work.

HTTP origin remains privately bound for the operation lifetime. CLS reset or a
nested SystemContext cannot convert an HTTP operation into an internal global
one. Consume the existing resolved tenant proof port; add no public authority
marker or caller-supplied trust flag. Literal trusted internal RequestContext
pairs are not evidence of verified HTTP authentication.

PII metadata reads, including `core.pii_map`, use the restricted reader lane for
HTTP. Server-controlled override files remain validated configuration. Do not
self-elevate metadata loading or add broad grants to bypass a demonstrated
installation defect. Any necessary grant repair is a forward migration verified
on fresh and populated installations. Existing legal-basis and retention review
obligations remain; missing approved values are not invented.

Before effects, validate the entire grouped rule set. Every rule for one table
must agree on its subject column and, for a tenant table, its tenant column.
Conflicting or partially tenant-mapped groups fail configuration. Whole groups
without a tenant column are global and excluded from tenant operations, including
`auth.users`. Document this exclusion as scope: tenant completion is not global
account export/erasure. Never choose the first grouped rule as authority or guess
a tenant mapping. Every tenant table query, live and archive, has a parameterized
tenant predicate and, when requested, a subject predicate. FORCE RLS and direct
restricted-role grants provide independent isolation. No request may execute
unfiltered SQL over a global group or the global partition maintenance function.

Tenant erasure never disables a shared external identity or modifies global user
rows. It returns existing per-rule live/archive actions only for eligible tenant
groups. Retention false applies existing eligible tenant `delete_row` effects;
other strategies remain reported according to the existing contract, not silently
implemented as new destructive behavior. Dry-run counts remain tenant-only.

Exports retain ZIP manifest plus JSON and CSV members, and their existing result
fields. The existing format enum is a compatibility selector, not a promise that
the archive excludes the other representation. Bind the effective tenant in the
manifest and object key `exports/<tenant-uuid>/<export-uuid>.zip`. Upload only after
the SQL snapshot commits; SQL refusal/rollback cannot produce an object or URL.
Return success only after upload and presign actually succeed. External failures
must propagate, without fabricated atomic compensation or a completed result.

## Explicit global internal jobs and migration

Retain the existing global service entrypoints `exportData`, `eraseSubject` and
`applyRetention` as caller-established SystemContext-only internal capabilities,
outside HTTP origin. They no longer create their own owner authority. Add explicit
tenant ports for controller use; exported signatures and legitimate explicit
internal callers remain supported. A normal tenant lane never upgrades to the
global lane because an outer caller holds SystemContext.

Global identity disable and whole-session-partition maintenance remain explicit
internal work. Operators migrate global HTTP calls to reviewed internal callers
that establish SystemContext with a meaningful reason and retain actor/job
custody. Global retention remains unscheduled and dry-run by default, with the
unchanged ADR-SESSIONS-0003 database clock, 90-day cutoff, owner-only grants,
current/next-month protection and non-resurrection behavior. The tenant HTTP
`dryRun=false` operation continues tenant row effects but no longer applies global
partition drops. The runbook must make that security correction explicit.

Global erasure requires an actual configured identity adapter and approved
subject/provider mapping. The default no-op is not a successful identity disable;
missing effective implementation refuses before destructive global effects.
Provider failure after a committed SQL erasure is a real non-atomic failure and
must not be relabeled success. This contract introduces no invented distributed
transaction, durable job ledger, provider identity, OID, anchor or production
credential.

## Pseudonym and export safety corrections

Replace reversible base64 encoding under `hash_with_salt` with actual
HMAC-SHA256. Use the configured nonempty erasure salt as its secret key and a
versioned unambiguous domain-separated message binding table, column, subject
and tenant scope where applicable. Retain the `hash:` prefix and deterministic
same-input replacement with a bounded digest. Validate configuration before
erasure; never log or export the salt or reversible message. This is
pseudonymization, not anonymity. Historical replacements are not silently
rewritten outside an ordinary authorized erasure operation.

JSON preserves raw values. CSV is a spreadsheet-safe presentation: neutralize
formula-capable string/header beginnings (`=`, `+`, `-`, `@`, tab or carriage
return, including leading whitespace/control before a formula prefix) before
normal comma, quote and linebreak escaping. Preserve real numeric values,
including negative numbers; do not treat a JSON number as an untrusted formula
string. Bind the exact neutralization rule and state in the manifest/docs that
JSON is the lossless representation. Do not claim universal executable-content
sanitization or silently mutate JSON to match CSV presentation.

## Independent acceptance

Inspector retains every existing behavioral assertion. Existing global-owner
assertions move to explicit internal caller scaffolding; intended changed HTTP
security assertions become stronger, not deleted. Cover real authenticated and
unsigned/expired/inactive/wrong-permission paths, conditional retention permission,
body tenant and subject membership mismatch, the same subject in two tenants,
exact actor custody, global-rule exclusion and conflicting mappings, live/archive
parity, FORCE RLS/direct reader/app logins, nested SystemContext/CLS reset and
held/hidden connection refusal. Prove no HTTP owner query, partition call or
identity-disable call. Preserve independent global partition protection tests.

Object-store qualification requires the actual supported adapter and approved
public fixture scope: actual upload, exact ZIP readback, tenant key/access
boundaries, presign expiry and failure propagation. `PutObject Expires` alone is
not deletion/lifecycle proof. Local real SDK/emulator tests identify their local
scope; in-memory and no-op providers do not qualify real effects or latency.
Global identity acceptance separately requires approved real mapping and side
effect evidence. No production provider values may be invented.

Full privacy performance qualification still requires the real mounted root,
authentication, roles, provider effects, fresh build, module/handler/middleware
custody and unchanged complete workload population. This authority amendment
supplies no advance functional, provider, performance, audit or release PASS.
