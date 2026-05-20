---
adr_id: ADR-FE-FLOW-PUBLISH-0003
title: Flow Draft and Publish Contract
status: accepted
date: 2026-05-20
authors: ['@aarusso']
tags: [stynx, frontend, angular, flow, publish]
---

# ADR-FE-FLOW-PUBLISH-0003 - Flow Draft and Publish Contract

**Authority:** Architect.
**Related:** `docs/contracts/flow-api.md`, `docs/work/plan/FE-WAVE-F-flow-installable.md`, `docs/work/plan/FE-WAVE-F-report.md`.

Decision summary: Flow design edits are drafts until explicitly published;
runtime execution starts only from immutable published graph versions exposed by
the Flow API contract and consumed by `@stynx-web/angular-flow`.

## Status

Accepted on 2026-05-20 for FE-F F.2 and F.10.

## Context

`@stynx-web/angular-flow` needs to be installable without each host inventing a
draft/runtime policy. Before FE-F, graph editing and runtime execution were not
separated clearly enough for the designer to show publication state or for a
runtime to reject draft-only graphs deterministically.

The frontend package also needs one provider shape that works for SDK-backed,
mock-backed, and custom host transports.

## Decision

Flow exposes draft and published graph state as a first-class API contract.

- `FlowGraph` responses include `status: 'draft' | 'published'` and optional
  `publishedVersion`, `publishedAt`, and `publishedBy` fields.
- `POST /flow/graphs/:id/publish` validates the draft, honors
  `Idempotency-Key`, checks `expectedDraftVersion` when supplied, and returns a
  `PublishFlowGraphResponse`.
- Published runtime snapshots are immutable for a graph version. Later design
  mutations affect the draft and do not mutate already published runtime state.
- New runtime starts resolve the latest published version unless an explicit
  published version is supplied. Draft-only runtime attempts return `409`.
- Publish is a platform-audited mutation with action `flow.graph.publish` and
  requires `flow:publish:design`.
- `provideStynxFlow(...)` accepts SDK-backed, mock-backed, and custom transport
  clients through a stable factory/configuration surface.

## Alternatives Considered

- **Infer publication from internal persistence flags.** Rejected because Angular
  consumers must not depend on backend table implementation details such as
  `isActive`.
- **Let runtime start from the current draft.** Rejected because draft edits
  would become runtime changes without an explicit operator action.
- **Require only the STYNX SDK client.** Rejected because reference apps, tests,
  and adopters need a supported custom/mock transport path.

## Consequences

Adopters integrating Flow must treat graph design and runtime execution as
separate surfaces. Host APIs implementing the Flow contract must expose publish
semantics and validation errors, and UI code should show draft/published state
instead of guessing from local edit state.

The `@stynx-web/angular-flow` package can now be installed in SDK-backed or
custom-host apps without rewriting its publish action, runtime start behavior,
or task/design provider wiring.
