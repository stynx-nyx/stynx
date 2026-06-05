---
adr_id: ADR-FE-AUDIT-CONTRACT-0004
title: Frontend Audit Read Contract
status: accepted
date: 2026-05-20
authors: ['@aarusso']
tags: [stynx, frontend, angular, audit, contracts]
---

# ADR-FE-AUDIT-CONTRACT-0004 - Frontend Audit Read Contract

**Authority:** Architect.
**Related:** `docs/framework/contracts/audit-events-api.md`, `docs/work/plan/FE-WAVE-E-tenancy-and-audit.md`, `docs/work/plan/FE-WAVE-E-report.md`.

Decision summary: `@stynx-web/angular-audit` targets a read-only audit events
contract under `/audit/*`, not the legacy `/_audit/log` endpoint, and preserves
tenant isolation plus per-event integrity semantics.

## Status

Accepted on 2026-05-20 for FE-E E.5-E.11.

## Context

The FE completeness audit found no reusable audit viewer even though STYNX audit
data and hash-chain behavior are core platform surfaces. The legacy
`GET /_audit/log` route is useful as an admin log view, but it does not define
the frontend package contract for list/detail/entity-history/integrity behavior.

If Angular audit components invented endpoints, permission names, or tenant
fallbacks locally, adopters would get incompatible audit behavior across hosts.

## Decision

The frontend audit package consumes the dedicated audit events contract.

- Audit list, detail, entity-history, and integrity reads use
  `platform:audit:read:*`.
- The canonical routes are `GET /audit/events`,
  `GET /audit/events/:eventId`,
  `GET /audit/entities/:entityKind/:entityId/history`, and
  `GET /audit/events/:eventId/integrity`.
- Audit reads execute under the active tenant context. Cross-tenant event and
  entity lookups return `404` rather than leaking existence through `403`.
- `@stynx-web/angular-audit` exposes read-only service, provider, route, log,
  detail, entity-history, and hash-integrity badge surfaces.
- No audit mutation route is part of the frontend package contract; audit events
  remain append-only evidence.
- The legacy `/_audit/log` route is not the target contract for this package.

## Alternatives Considered

- **Wrap `/_audit/log` only.** Rejected because it does not provide the detail,
  per-entity history, or per-event integrity shape required by the package.
- **Invent package-local audit permissions.** Rejected because platform audit
  authorization already has a canonical `platform:audit:read:*` permission.
- **Expose cross-tenant failures as permission errors.** Rejected because it can
  leak that an event or entity exists outside the caller-visible tenant.

## Consequences

Adopters must implement or adapt the `/audit/*` read contract before mounting
the package against a live backend. The Angular package can render audit lists,
event details, entity timelines, and hash-integrity state without taking write
authority over audit evidence.

The existing admin log route may remain for legacy/platform use, but package
documentation and migration guidance should point new frontend integrations at
the accepted audit events contract.
