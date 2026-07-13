---
adr_id: ADR-PREFERENCES-0001
title: Tenant-subject preferences boundary
status: accepted
date: 2026-07-12
authors: ['Architect']
tags: [stynx, preferences, tenancy, privacy, profile]
---

# ADR-PREFERENCES-0001 — Tenant-subject preferences boundary

**Authority:** Architect (DEVAI Constitution Article 6).
**Contract:** [`docs/framework/contracts/preferences-api.md`](../../framework/contracts/preferences-api.md).
**Round:** R21 W02.

## Status

Accepted on 2026-07-12. The four category names and the tenant-scoped,
non-HR boundary are locked owner decisions in the R21 handoff.

## Context

`@stynx-nyx/angular-profile` calls `/profile` and `/profile/preferences`, but no
reusable backend package owns those routes. Its current index signatures admit
arbitrary product and personnel fields, and its preference write has no lost
update protection. `tenancy.tenant_settings` is tenant-wide and therefore is
not a suitable subject-preference store.

## Decision

Create a publishable backend package named `@stynx-nyx/preferences` under
`packages/preferences`. It owns validation, application orchestration, a
provider-neutral storage port, NestJS registration, and the `/profile` and
`/profile/preferences` compatibility routes. The reference Postgres adapter is
part of this package and uses the repository's `@stynx-nyx/data` context.

Every record is scoped by the composite identity `(tenantId, subjectId)`.
Controllers obtain both values from authenticated, trusted STYNX request
context. Neither identifier is accepted in a body, query parameter, or path.
The store has exactly four categories: `locale`, `theme`, `accessibility`, and
`notificationDelivery`; their key-level schemas are closed.

The generic `/profile` representation is a compatibility projection, not a
personnel master. It contains only `subjectId`, `displayName`, avatar references,
and the typed preferences document. Email, legal name parts, HR identifiers,
employment, payroll, benefits, compensation, legal identity, and adopter-domain
fields are forbidden. Only `displayName` and `avatarDocumentId` are writable.

Writes use a strong integer revision exposed as an ETag. `If-Match` is required,
including `If-Match: "0"` for the first persisted write, so two readers cannot
silently overwrite one another. PUT replaces the complete preference document;
PATCH applies a JSON Merge Patch-like category/key merge with explicit `null`
reset semantics defined by the contract. Defaults are adopter-configured only
within the closed schemas and are resolved at read time, not persisted as
arbitrary JSON.

The reference table is `profile.subject_preferences`, protected by forced RLS.
Application access always runs under tenant context; there is no cross-tenant
lookup API. Audit events carry actor, tenant, subject, operation, category names,
revision, and request metadata, but never preference values.

## Compatibility and versioning

The route names remain `/profile` and `/profile/preferences`, but the current
Angular wire types and unconditional PUT are unsafe. This is an intentional
breaking public-contract correction requiring major changesets for
`@stynx-nyx/angular-profile` and any already-published backend surface, plus a
minor/new-package changeset for `@stynx-nyx/preferences` according to release
policy. W03 must update Angular types, ETag handling, forms, reference API/web,
SDK-style client behavior, OpenAPI, public API baselines, docs, and fixtures in
one compatibility lane. No legacy arbitrary keys or last-write-wins fallback is
provided.

## Consequences

Adopters may choose defaults and supported values such as locales or timezones,
but cannot add categories or keys. Product and HR data stays in adopter-owned
modules. The narrow profile projection may require consumers to obtain email or
legal identity from their identity provider or domain API. Existing route URLs
remain stable while response/request shapes become closed and revision-aware.
