---
title: Framework
sidebar_label: Framework
---

# Framework

STYNX's contract surface is maintained in this repository.

| Sub-section                                   | Purpose                                                         |
| --------------------------------------------- | --------------------------------------------------------------- |
| [API](./api/)                                 | OpenAPI specification and package API reference                 |
| [Architecture](./arch/)                       | Architecture guides, reference-app structure, and invariants    |
| [Contracts](./contracts/)                     | Runtime contracts for errors, audit, integrations, and features |
| [Schemas](./schemas/)                         | JSON Schemas and their generated index                          |
| [Product](./product/)                         | Use cases and module blueprints                                 |
| [Glossary](./glossary/)                       | Shared runtime and package terminology                          |
| [Architecture Guide](./architecture-guide.md) | Consumer-facing architecture overview                           |
| [RBAC Matrix](./rbac-matrix.md)               | Enforced role and permission model                              |

Consumers should start with the architecture guide, then the API and runtime
contracts. Repository contributors should also read
[`docs/meta/development-contract.md`](../meta/development-contract.md), the architecture
invariants, and accepted decisions under [`docs/meta/adr/`](../meta/adr/).
