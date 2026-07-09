---
adr_id: ADR-003
title: RBAC Matrix Role in a Framework Repository
status: accepted
date: 2026-05-17
authors: ['@aarusso']
tags: [stynx, rbac, devai, inventory]
---

# ADR-003 — RBAC Matrix Role in a Framework Repository

**Authority:** Architect.
**Related:** `INV-RBAC-001`, `docs/framework/rbac-matrix.md`, `docs/meta/known-gaps.md`.

## Status

Accepted on 2026-05-17.

## Context

Stynx is a framework. It provides RBAC primitives, package contracts, reference
applications, sensors, and documentation that consuming applications use to
declare their own roles, permissions, routes, and use-case coverage.

`docs/framework/rbac-matrix.md` was generated from a sensor snapshot. Older audits treated
the empty role/permission counts in that file as if they meant the framework had
no RBAC implementation. That is the wrong abstraction level: the framework can
be correct while a particular generated reference-app inventory is incomplete.

The document still matters, but only if its authority is explicit.

## Decision

`docs/framework/rbac-matrix.md` is a generated diagnostic and template artifact for the
current repository/reference app inventory. It is not the canonical framework
RBAC implementation and must not be treated as the platform permission catalog.

Canonical RBAC authority is split as follows:

- Framework primitives live in `@stynx-nyx/contracts`, `@stynx-nyx/auth`,
  `@stynx-nyx/backend`, and related package tests.
- Reference-app permissions and roles live in reference migrations, seeds, and
  route/controller metadata.
- Generated matrix files report current inventory coverage and reveal missing
  bindings, but they do not define the framework contract.
- Consuming apps should generate their own RBAC matrix from their own roles,
  permissions, routes, and use cases.

## Consequences

- Empty counts in `docs/framework/rbac-matrix.md` are a reference-app inventory gap, not
  proof that STYNX lacks RBAC primitives.
- `docs/meta/known-gaps.md` should route matrix binding gaps to the reference-app
  data/RBAC wave, not package topology waves.
- Future sensors should label generated matrix outputs as diagnostic snapshots
  and include the source timestamp/configuration.
- Package-level RBAC completeness must be proven by contracts, auth/backend
  tests, and reference-app route/permission integration, not by hand-editing the
  generated matrix.
