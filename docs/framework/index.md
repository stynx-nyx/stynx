---
title: Framework
sidebar_label: Framework
---

# Framework

STYNX is a **DEVAI adopter library**. Its framework material is bifurcated:

- The **meta-framework** — substrates, transversals, scorecard, loop, concurrency, evidence, invariants — is upstream at the canonical [DEVAI Framework reference](https://aarusso-nyx.github.io/devai/docs/framework/). STYNX inherits it under Constitution Article 36 (transitive self-application).
- **STYNX's own contract surface** — APIs, schemas, runtime contracts, architecture, RBAC — lives below.

This bifurcation is the locked **Decision A (c) hybrid** in [`ADR-DEVAI-0.2.0-MIGRATION`](../meta/adr/ADR-DEVAI-0.2.0-MIGRATION.md), matching STYNX's `repo.kind = library` classification.

## STYNX's contract surface

| Sub-section                                   | Purpose                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [API](./api/)                                 | OpenAPI 3.1 spec + reference for `@stynx/*` and `@stynx-web/*` packages                       |
| [Architecture](./arch/)                       | High-level architecture guide + reference-app skeletons + invariants under `arch/invariants/` |
| [Contracts](./contracts/)                     | Runtime contracts: error envelopes, audit events, integration adapter, feature flags          |
| [Schemas](./schemas/)                         | JSON Schemas, auto-indexed by the `gen-schema-browser` generator                              |
| [Product](./product/)                         | Owner-substrate specs (use-cases, blueprints)                                                 |
| [Glossary](./glossary/)                       | Joint Owner+Architect glossary                                                                |
| [Architecture Guide](./architecture-guide.md) | Top-level consumer-facing architecture overview                                               |
| [RBAC Matrix](./rbac-matrix.md)               | Role/permission matrix the platform enforces                                                  |
| [Aspect grid](./aspect-grid.md)               | 5×9 substrate × transversal grid (generator-produced)                                         |

## Upstream (DEVAI) framework reference

STYNX does **not** re-state DEVAI's framework. Instead, every term that originates upstream is hyperlinked into DEVAI's published reference:

- [Substrates (F1–F5)](https://aarusso-nyx.github.io/devai/docs/framework/substrates) — what STYNX's own paths under `docs/framework/*` and `docs/meta/*` mean
- [Transversals (T1–T9)](https://aarusso-nyx.github.io/devai/docs/framework/transversals) — the quality dimensions STYNX's sensors score
- [Scorecard](https://aarusso-nyx.github.io/devai/docs/framework/scorecard) — STYNX's own scorecard is at [`/meta/self-scorecard`](../meta/self-scorecard.md)
- [Invariants](https://aarusso-nyx.github.io/devai/docs/framework/invariants) — STYNX's are under [`arch/invariants/`](./arch/invariants/)
- [The DEVAI Loop](https://aarusso-nyx.github.io/devai/docs/framework/loop) — how rounds proceed; STYNX's R15 closeout is a worked example
- [Evidence chain](https://aarusso-nyx.github.io/devai/docs/framework/evidence) — STYNX's evidence-chain at `.devai/state/evidence-chain.json`

## Reading order

If you are **a consumer integrating STYNX**: start with [Architecture Guide](./architecture-guide.md), then [API](./api/), then [Contracts](./contracts/). The full STYNX adoption pack for AI agents porting foreign repos lives at [`adopters/stynx/`](../adopters/stynx/).

If you are **an Architect operating in this repo**: start with [`arch/`](./arch/), then [`contracts/`](./contracts/), then check [`meta/adr/`](../meta/adr/) for ratified decisions and [`meta/self-scorecard`](../meta/self-scorecard.md) for current quality posture.

If you are **looking for the meta-framework** (substrates, scorecard semantics, evidence chain mechanics, scoring rubrics): every link above goes to DEVAI's published reference.
