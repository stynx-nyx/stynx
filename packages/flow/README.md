# @stynx/flow

Backend workflow module for tenant-scoped Flow design and runtime state.

This package implements the STYNX Flow architecture in `docs/architecture/flow.md`.
It is generic framework code: host-domain behavior is provided through adapter
contracts and declarative effect payloads, not through CMS or PORM imports.

## Current Surface

- Design CRUD for scopes, graphs, nodes, edges, agent rules, transition effects,
  node form rules, policy sets, and policy rules.
- Graph import/export for tenant-local workflow definitions.
- Runtime services are intentionally limited to stubs until the runtime prompt
  implements task execution and signal behavior.

## Required Host Modules

Host applications must configure the STYNX platform pipeline, `@stynx/data`,
`@stynx/auth`, and tenancy context before mounting `StynxFlowModule`.
