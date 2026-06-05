---
slug: /rfcs/0001-rationalization
---

# RFC 0001: Workspace Rationalization

- Status: Accepted
- Date: 2026-04-27

## Problem

The repository carried legacy top-level app and package surfaces alongside the spec-shaped STYNX workspace. This made ownership, CI, package naming, and dependency boundaries ambiguous.

## Constraints

The remediation had to preserve reusable STYNX package behavior, remove the `@stech/*` namespace, keep generated specs untouched, and retain green build, lint, typecheck, and test gates.

## Options

- Keep compatibility packages and document them as legacy. This minimized short-term churn but preserved namespace drift.
- Move behavior into spec-shaped packages and delete legacy workspaces. This required broader edits but aligned CI and ownership to the target topology.

## Decision

Move behavior into `packages/*`, `packages-web/*`, `apps/*`, and `tools/*`; delete legacy top-level workspaces; and keep audit evidence under `internal work note (not published)`.

## Migration

The remediation landed through local commits covering contracts, Angular tenancy, privacy storage boundaries, package rationalization, lint invariants, and gate restoration.

## Rollback

Rollback by reverting the rationalization commits as a unit. Partial rollback is not recommended because workspace globs, package names, and CI gates depend on each other.

## Evidence

- internal rationalization notes
