---
adr_id: ADR-0019
title: Complete STYNX 1.6.0 minor campaign with upstream and consumer evidence
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [release, minor, campaign, devai, detran, evidence]
---

# ADR-0019 — Complete STYNX 1.6.0 minor campaign

## Status and Owner mandate

The Owner selected a complete STYNX 1.6.0 release, including the required DEVAI,
STYNX and DETRAN work, aiming to close all open STYNX issues and measure 43 PASS
cells plus the two existing N/A cells. The Owner authorized execution through
publication. This records that mandate without claiming an unperformed check,
literal approval of an unknown commit SHA or completed publication.

The verified STYNX entry base is
`03f9a6ae8938dfaa64a33870d60f9f8b448efe10`, the post-publication 1.5.7 evidence
and receipt head. Published 1.5.7 remains immutable. Its RED, non-promoting
observation is historical evidence and is not repaired or relabeled.

## Decision

1. **Minor line.** Release the publishable fixed group together as 1.6.0 with
   accurate minor changesets, package histories, generated readmes and upgrade
   notes. No accidental 2.x package version or broad registry anomaly exception
   is authorized. Existing immutable anomaly identity/remediation controls stay.
2. **Upstream first.** The dedicated DEVAI project owns the 2.4.0 source work,
   release and installed-package evidence. STYNX adopts its exact published
   identity only after verification, through Architect-authored policy and the
   registered pinned CLI. No hand edit of `.devai/config` or historical sensor
   records is allowed. Upstream repairs cover policy-projected inputs,
   candidate-bound reading instances, exact task/member admission, Angular route
   inputs, root portability and constitution-binding measurement.
3. **STYNX feature closure.** Deliver
   [OUTBOX-0004](ADR-OUTBOX-0004-retirement-and-closed-storage.md),
   [MOBILE-OFFLINE-0004](ADR-MOBILE-OFFLINE-0004-minor-parity-and-import.md), the
   existing accepted minimal LTA/profile-set contract and all remaining
   issue-scoped corrections with independent Inspector and Auditor evidence.
   Actual delivery retirement is required; declaring existing deliveries
   inapplicable does not satisfy it.
4. **Consumer evidence.** The separate DETRAN project owns real provider
   compatibility, application migration and its product mapping/authorization.
   STYNX keeps its reusable boundary and consumes verified pinned results.
   Existing blueprints/generated artifacts, tenant/RLS and product authority
   remain intact. Local fixture success is not real provider acceptance.
5. **Truthful machine target.** Seek actual 43 PASS and the two existing N/A
   cells without weakening tests, thresholds, populations, minimum samples or
   required gates. Missing or unmeasurable evidence remains visible. The target
   is not permission to fabricate PASS, change a slow/red historical sample,
   broaden N/A or overwrite old readings. New measurements use the repaired
   append-only/candidate-bound mechanism and preserve historical chain prefixes.
6. **Role and release sequence.** Architect owns law/docs and eventual API/
   trace binding, Engineer owns plant/migrations, Inspector owns sensors and
   Auditor independently reviews evidence. Preserve normal hooks, exact
   candidate RC, signer trust, protected CI and exact action-specific receipts
   across normal rebase landing. Required receipts faithfully cite this Owner
   mandate and concrete action/commit once known. Publication remains the
   existing guarded exact-main `publish:true` flow with registry verification,
   opt-in restoration and committed post-publication evidence; no bypass or
   weakened release descriptor is authorized.

## Audit integration clarification — definitive session admission

The full audit-remediation scope includes reconciling the existing public-tenant
revocation behavior with the sessions package's separately asserted legacy API.
Accept additive `SessionService.getActive(sid): Promise<SessionRecord | null>`
under the exact [session admission contract](../../docs/framework/contracts/authorization-session-1.5.md#active-session-admission-in-160).
It performs one store read, distinguishes validated inactive state from malformed
state and infrastructure failure, preserves expiry cleanup, and propagates
store/clock/cleanup failures. Both applicable built-in guard paths use it without
fallback. Definitive null means nominal optional authentication or protected
401; failure is never nominal. Preserve `get`'s revoked-session
`InvalidRefreshTokenError` behavior and every existing assertion. This adds no
broader credential catch or new backend-to-sessions dependency. The existing
membership-denial 403 contract remains mandatory.

## Audit integration clarification — protected i18n administration

The full audit mandate includes correcting the actual i18n administration
boundary under `INV-RBAC-001` and the existing least-privilege/RLS contract.
Accept the [i18n 1.6 administration contract](../../docs/framework/contracts/i18n-administration-1.6.md):
preserve the actual override URLs, require verified authentication and explicit
`i18n:read`/`i18n:write` permissions, and execute normal request reads/writes with
tenant/actor-bound reader/app transactions. Locale interception on public
bootstrap routes retains non-tenant fallback without tenant SQL or cache access
when verified tenant/actor context is absent. Internal administration retains an
explicit system-only port; no request method may create its own owner authority.

Preserve exported APIs and legitimate internal callers through an explicit
already-active SystemContext, with additive methods only where necessary to
separate that capability from normal requests. Declare the actual auth and
idempotency runtime dependencies, fixed-group minor changeset and generated
package documentation. Independent Inspector evidence and later Architect API
and assertion bindings remain required. No new public controller option is
required unless a supported composition demonstrates that need; a mount opt-out,
if added, defaults to mounting the protected controller. This clarification
authorizes implementation and independent verification, not advance acceptance.

Independent negative witnesses require the concrete repair to use existing
independent transactions, refusing held/hidden connections and publishing cache
only after actual commit. A private HTTP-origin scope consumes the existing
resolved tenant-command proof port: only exact-context `protected`/`verified`
proof permits tenant SQL/cache, and nominal public-tenant actors retain fallback.
CLS reset or nested SystemContext cannot turn HTTP into internal owner authority.
Trusted internal callers retain the existing context boundary without a new
public marker/schema. The protected auth guard maps only typed invalid
credentials to 401 and preserves infrastructure failures. These are corrections
of demonstrated privilege/cache leaks, not relaxed assertions or new exclusions.

## Audit integration clarification — tenant privacy rights and global internal jobs

The Owner selected “Tenant-scoped HTTP; global internal jobs” for the demonstrated
privacy privilege and cross-tenant defects. Accept the
[privacy 1.6 administration contract](../../docs/framework/contracts/privacy-administration-1.6.md).
The existing three HTTP routes retain their methods, operation IDs, synchronous
results and actual POST 201/GET 200 status. Require verified authentication,
exact protected/verified tenant-command proof and the existing delegated
`privacy:subject-rights` permission for export/erasure and retention application;
retention dry-run reporting requires `privacy:read`. Tenant effects use scoped
reader/app independent transactions and tenant/subject predicates, never owner.
`dryRun=false` retains tenant row application with `partitions: []`; it does not
become a report-only refusal or a global partition action.

Global table groups, shared identity disable and whole-partition retention belong
to explicit caller-established SystemContext internal operations outside HTTP
origin. Existing global service ports remain, but cannot self-create authority.
Validate subject membership and closed inputs, reject conflicting grouped rule
metadata, and exclude unscoped global groups from tenant work. Preserve RLS,
actor/subject distinction, nested/held connection refusal and genuine failure
outcomes. The contract also corrects reversible `hash_with_salt` encoding with
keyed HMAC-SHA256 pseudonymization and spreadsheet formula exposure in CSV while
preserving lossless JSON. No anonymity, distributed atomicity or unperformed
provider effect is claimed.

This prospectively restricts ADR-SESSIONS-0003's HTTP exposure: the unchanged
90-day owner-only partition sweep remains an explicit internal operator job,
unscheduled and dry-run by default. Update its runbook accordingly; tenant HTTP
report/apply never calls or discloses global partition maintenance. Independent
Inspector evidence, intended API/OpenAPI/trace bindings and actual supported
provider acceptance remain mandatory. This selection supplies the privacy scope;
it does not approve production provider inputs or promote performance/release
readiness.

## Privacy test-tier extension

Prospectively extend D13 of the historical STYNX 1.1.1 campaign controls; its
original five-file decision and observations remain unchanged. The ordinary
privacy tier retains the exact three unit files and one wiring file. The
serialized integration tier now includes both `privacy.module.spec.ts` and the
additive `privacy-object-store.provider.spec.ts`. Their disjoint union and the
dedicated coverage tier must resolve all six files from the actual configuration.
Preserve the original 94 behavioral cases and every assertion; the four actual
local-provider cases add evidence rather than replacing an existing boundary.

Do not change timeouts, source declarations, thresholds, unrelated concurrency,
mutation population or ordinary gates. The live population regression must bind
the sixth file explicitly. Real AWS SDK/LocalStack adapter observations qualify
only the declared local fixture and do not establish production-provider approval,
object deletion/lifecycle, full coverage, latency or release readiness.

## Protected integration and version-stage observation

The feature candidate retains the published unified 1.5.7 manifest versions
until normal protected integration. Its prospective 1.6.0 observation requires
the exact governed 44-package roster, uniform root/package versions, absent
prerelease state and a valid pending fixed-group minor plan whose computed
target equals the registry policy's 1.6.0 target. A prospective plan is not an
observation of already-versioned packages or permission to publish them.

After the feature merge, the existing Changesets workflow generates the
`ci: version packages` PR as a direct first-parent child of `origin/main`.
The versioned candidate must have consumed its pending changesets and satisfy
the unchanged exact 1.6.0 root/all-package assertions, registry monotonicity,
release-context classification and publication controls. Preserve independent
tests of both stages; reject mixed versions, invalid or mismatched plans and
unconsumed changesets in the versioned state. Do not add a release-context
exemption, synthetic manifest projection, test skip or weaker final gate to
admit the feature candidate.

## Completion evidence

Each issue closes only against its actual acceptance evidence, with upstream
and consumer dependencies distinguished. Completion requires independent ordinary
checks, migrations from empty and populated databases, live role/storage/RLS
verification, intended emitted API and trace bindings, exact candidate release
proof, all-package registry/tag/release verification and preserved new machine
observation evidence. Mutation hardening remains optional and non-promoting.
This decision supplies scope and authority, not an advance success verdict.

## Prospective bounded publication amendment — 2026-10-11

The Owner's later same-day publication priority is recorded in
[ADR-RELEASE-0001](2026-10-11-bounded-1.6.0-publication.md). Exactly 1.6.0 uses its
closed bounded machine scope, unchanged fifteen-node signed RC and retained
static/security/product/protected release controls. No k6 or mutation execution;
full HTTP qualification, complete-green audit, consumer/provider acceptance and
issue closure continue only against actual follow-up evidence. The original
mandate and historical observations above remain preserved, without advance PASS.
