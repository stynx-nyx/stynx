---
adr_id: ADR-FE-CONTRACTS-0001
title: Frontend Completeness Contract Pins
status: accepted
date: 2026-05-19
authors: ['@aarusso']
tags: [stynx, frontend, contracts, auth, audit, flow]
---

# ADR-FE-CONTRACTS-0001 — Frontend Completeness Contract Pins

**Authority:** Architect.
**Related:** [`docs/framework/contracts/auth-hosted-actions.md`](../../framework/contracts/auth-hosted-actions.md), [`docs/framework/contracts/audit-events-api.md`](../../framework/contracts/audit-events-api.md), [`docs/framework/contracts/flow-api.md`](../../framework/contracts/flow-api.md).

## Status

Accepted on 2026-05-19 for FE-C C.4, FE-E E.5-E.8, and FE-F F.2.

## Context

The frontend completeness programme found three places where UI work would have
to invent backend or auth semantics:

- profile security handoff components need hosted identity-provider action URLs;
- the audit package needs list, detail, entity-history, and per-event integrity
  reads, while the live backend currently exposes only `/_audit/log`;
- Flow needs a publish/draft distinction before `@stynx-nyx/angular-flow` can
  show a publish badge or action.

Letting frontend components fill those gaps locally would create incompatible
host behavior and make later backend alignment harder.

## Decision

Architect pins the contracts before Engineers implement the blocked UI slices.

- Hosted auth actions are configured/frontend-resolved links exposed by
  `@stynx-nyx/angular-auth`; profile components do not derive provider URLs.
- Audit UI targets `/audit/events`, `/audit/events/:eventId`,
  `/audit/entities/:entityKind/:entityId/history`, and
  `/audit/events/:eventId/integrity` under `platform:audit:read:*`.
- Flow publishes drafts through `POST /flow/graphs/:id/publish`; runtime starts
  from published graph snapshots and never from draft-only edits.

## Consequences

FE-C, FE-E, and FE-F can implement their package APIs against small stable
contracts. Engineers still need to add backend/auth implementation where the
current code is missing the pinned route or adapter surface, but UI code no
longer has to invent permission names, request DTOs, or tenancy behavior.

The existing `/_audit/log` endpoint remains available for legacy/admin use; it
is not the target contract for `@stynx-nyx/angular-audit`.
