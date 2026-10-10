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

## Completion evidence

Each issue closes only against its actual acceptance evidence, with upstream
and consumer dependencies distinguished. Completion requires independent ordinary
checks, migrations from empty and populated databases, live role/storage/RLS
verification, intended emitted API and trace bindings, exact candidate release
proof, all-package registry/tag/release verification and preserved new machine
observation evidence. Mutation hardening remains optional and non-promoting.
This decision supplies scope and authority, not an advance success verdict.
