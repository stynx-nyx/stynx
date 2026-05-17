# @stynx/flow

Backend workflow module for tenant-scoped Flow design and runtime state.

This package implements the STYNX Flow architecture in `docs/architecture/flow.md`.
It is generic framework code: host-domain behavior is provided through adapter
contracts and declarative effect payloads, not through CMS or PORM imports.

## Current Surface

- Design CRUD for scopes, graphs, nodes, edges, agent rules, transition effects,
  node form rules, policy sets, and policy rules.
- Graph import/export for tenant-local workflow definitions.
- Runtime services for run creation, signals, node/task progression, task
  candidates, assignment/action flows, form fact rebuilding, effect dispatch,
  and policy evaluation.
- PORM-compatible migration aliases for fill creation, bulk answer upsert,
  form-scoped fill detail, fill-scoped waiver listing, fill answers, and fill
  waivers.
- Bounded analytics envelopes for open tasks and run summary views.
- Database triggers that re-signal active targets after answer/waiver mutation
  so form-gated auto nodes do not stale.
- DML audit enabled for current curated Flow live tables.

## Verification Status

Current package maturity is ready with caveats:

- `pnpm --filter @stynx/flow test` covers route contracts, validation, effect
  dispatch, resolver expansion, analytics, task privilege, and policy behavior.
- `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int` covers
  tenant-scoped database/runtime behavior, audit trigger coverage, and
  answer-mutation signal freshness against PostgreSQL.
- Full HTTP request-pipeline coverage for every Flow route family is still a
  follow-up target.
- API additions should be driven by stynx package completeness, Angular package
  needs, E2E evidence, or consumer deprecation work rather than absolute PORM
  route parity. The current reviewed addition is `GET /flow/fills/:fillId/waivers`.

## Required Host Modules

Host applications must configure the STYNX platform pipeline, `@stynx/data`,
`@stynx/auth`, and tenancy context before mounting `StynxFlowModule`.
