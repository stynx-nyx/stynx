# `@stynx-internal/migration-linter` — archive-aware SQL migration linter for STYNX

`@stynx-internal/migration-linter` is a standalone CLI that lints SQL migrations against STYNX-specific conventions: archive-table mutation rules, soft-delete-aware constraints, RLS-policy adjacency. It catches migrations that would break STYNX's soft-delete + RLS guarantees before they ship. Run it in CI alongside your other gates.

## Purpose

STYNX's data layer relies on conventions: tenant-scoped tables need RLS policies, archive tables have soft-delete semantics, certain column changes break cascade behaviour. A raw SQL migration can silently violate these. The migration-linter encodes the conventions as lint rules so violations fail at PR time, not in production.

You reach for it whenever you author a Drizzle/SQL migration touching tenant-scoped or archive tables.

What it does NOT do: it's intentionally **not** part of DEVAI's `check-*` family (see "Status" below) — it encodes STYNX-specific SQL conventions, not universal DEVAI semantics. It doesn't run migrations (that's [`@stynx-nyx/cli`](/docs/packages/cli/)'s `stynx migrate`).

## Audience

Backend developers authoring database migrations. Audience-pitch: _"My migration touches an archive table — what rules apply?"_

## Install

Workspace-local; invoke via pnpm:

```bash
pnpm --dir tools/migration-linter exec stynx-migration-lint <migration-file-or-dir>
```

## Quick start

```bash
# Lint a single migration
pnpm --dir tools/migration-linter exec stynx-migration-lint db/migrations/0042_add_orders.sql

# Lint the whole migrations directory (JSON output for CI)
pnpm --filter migration-linter run lint:repo --format=json
```

## Public API surface

### CLI

| Invocation                           | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| `stynx-migration-lint <file-or-dir>` | Lint a migration file or every migration in a directory. |

### Flags

| Flag                   | Description                                |
| ---------------------- | ------------------------------------------ |
| `--format=human\|json` | Output format. JSON for CI gating.         |
| `--fix-suggestions`    | Emit suggested fixes alongside violations. |

### Rule families

| Rule family            | Catches                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Archive-table mutation | Direct deletes / unsafe alters on archive (soft-delete) tables. |
| Soft-delete constraint | Constraints incompatible with soft-delete semantics.            |
| RLS-policy adjacency   | New tenant-scoped tables lacking an RLS policy.                 |

## Configuration

The linter reads its config from the repo's migration-linter config (rule severities, table-classification overrides). Per-rule severity can be tuned; see the tool's config schema.

## Examples

### Example 1 — CI gate

```yaml
# In your CI chain
- name: Lint migrations
  run: pnpm --filter migration-linter run lint:repo --format=json
```

### Example 2 — fix suggestions during development

```bash
pnpm --dir tools/migration-linter exec stynx-migration-lint db/migrations/ --fix-suggestions
```

## Common pitfalls

- **Missing RLS policy on a new tenant-scoped table** — the most common violation. Add the `CREATE POLICY` in the same migration.
- **Raw `DELETE` on an archive table** — archive tables use soft-delete; a hard `DELETE` bypasses cascade rules. Use the soft-delete path.
- **Linter not in CI** — violations only caught locally are easy to skip. Wire `lint:repo` into your CI chain.

## Status: intentionally STYNX-idiosyncratic

Per C-4 Session S9, this tool is **not** folded into DEVAI's `check-*` family and is not planned to be. DEVAI's `check-*` actions operate on DEVAI substrates with universal semantics; the migration-linter encodes STYNX-specific SQL conventions that don't generalize. It stays a STYNX-local tool.

## Related packages

- [`@stynx-nyx/data`](/docs/packages/data/) — the data layer whose conventions this linter enforces (`ADR-001-soft-delete`).
- [`@stynx-nyx/cli`](/docs/packages/cli/) — `stynx migrate` runs the migrations this lints.

## TypeDoc reference

CLI-only tool; no symbol-level API surface.
