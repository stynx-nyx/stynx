# `@stynx-nyx/migration-linter` — SQL migration linter for STYNX

`@stynx-nyx/migration-linter` ships the `stynx-migration-lint` CLI. It lints SQL migrations against STYNX conventions: archive-table mutation rules, soft-delete-aware constraints, RLS-policy adjacency, globally unique migration prefixes, `app.*`-only policy settings, LGPD personal-data annotations and applied-migration immutability. Every file is first validated with libpg_query (`pg-query-emscripten`). It catches migrations that would break STYNX's soft-delete, RLS and LGPD guarantees before they ship.

## Purpose

STYNX's data layer relies on conventions: tenant-scoped tables need RLS policies, archive tables have soft-delete semantics, applied migrations are immutable, and personal data needs a documented legal basis. A raw SQL migration can silently violate these. The linter encodes the conventions as rules (`LINT001`–`LINT013`), so violations fail at PR time instead of in production.

You use it whenever you write a SQL migration.

It does NOT run migrations. Running them is the job of
[`@stynx-nyx/cli`](/docs/packages/cli/)'s `stynx migrate`.

## Audience

Backend developers who write database migrations, and CI nodes that gate SQL changes (DEVAI v3 `sql-lint`). Audience-pitch: _"My migration touches an archive table — what rules apply?"_

## Install

The package is named for publication in the STYNX fixed-group release. Inside the
STYNX workspace, run it with pnpm:

```bash
pnpm --dir tools/migration-linter exec stynx-migration-lint <migration-file-or-dir>
```

## Quick start

```bash
# Lint a single migration
pnpm --dir tools/migration-linter exec stynx-migration-lint db/migrations/0042_add_orders.sql

# Lint several roots as one population, with every context input (JSON for CI)
stynx-migration-lint database/ddl database/migrations --format=json --lgpd \
  --base-dir .scratch/base --manifest database/seed/modules.txt
```

## Public API surface

### CLI

| Invocation                              | Description                                                        |
| --------------------------------------- | ------------------------------------------------------------------ |
| `stynx-migration-lint <file-or-dir>...` | Lint one or more migration files or directories as one population. |

### Flags

Each value flag takes either `--flag value` or `--flag=value`. An unknown flag exits 2.

| Flag                   | Description                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format=human\|json` | Output format. JSON (`{ files, issues[], parserIssues[] }`) for CI gating.                                                                                                                                             |
| `--fix-suggestions`    | Emit suggested fixes alongside violations.                                                                                                                                                                             |
| `--lgpd`               | Enable `LINT012`: personal-data columns must carry `-- @pii: basis=<basis>, retention=<period>`.                                                                                                                       |
| `--base-dir <dir>`     | Base revision (merge base) of the linted files at their working-directory-relative paths. Files present there are applied history: `LINT010` ignores collisions among them and `LINT013` requires them byte-identical. |
| `--manifest <path>`    | Applied-migration manifest in `sha256sum` form (`<sha256>  <path>`), paths relative to the working directory (`LINT013`).                                                                                              |

### Exit codes

| Code | Meaning                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Clean.                                                                                                                                                                                                     |
| `1`  | At least one `LINT0nn` issue.                                                                                                                                                                              |
| `2`  | Parser errors or `pg-query-emscripten` unavailable (`parserIssues`), or an unavailable input: a missing target, `--base-dir` or `--manifest`, a malformed manifest, an unknown flag. Never a clean result. |

### Rules

| Code      | Catches                                                                                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINT001` | Tenant-scoped table without RLS enabled and a tenant isolation policy in the same migration.                                                                                                                                                                                |
| `LINT002` | Soft-deletable table without its `archive.*` mirror.                                                                                                                                                                                                                        |
| `LINT003` | `ALTER TABLE` on a soft-deletable table without the paired archive change.                                                                                                                                                                                                  |
| `LINT004` | FK to a soft-deletable parent without `-- @softdelete_fk: hide \| cascade \| block`.                                                                                                                                                                                        |
| `LINT005` | Destructive statement without `-- @destructive: approved-by=<ticket>`.                                                                                                                                                                                                      |
| `LINT006` | `SECURITY DEFINER` without `-- @security-definer-approved: <name>/<ticket>`.                                                                                                                                                                                                |
| `LINT007` | Non-`SELECT` grant on `audit.*` to `stynx_app`.                                                                                                                                                                                                                             |
| `LINT008` | Two soft-deletable tables mapping to the same archive name.                                                                                                                                                                                                                 |
| `LINT009` | `hide` FK on a `NOT NULL` column.                                                                                                                                                                                                                                           |
| `LINT010` | A newly added file whose numeric prefix (`0012_`) is already used by another file across all linted roots. Files present in `--base-dir` are applied history and never collide with each other. Without `--base-dir` every file counts as new, so any duplicate is flagged. |
| `LINT011` | A `CREATE`/`ALTER POLICY` that reads a GUC outside `app.*` through `current_setting`.                                                                                                                                                                                       |
| `LINT012` | Under `--lgpd`: a personal-data column (email, CPF, phone, birth date, address, …) without a complete `-- @pii:` annotation.                                                                                                                                                |
| `LINT013` | An applied migration whose bytes differ from the manifest digest or from the base revision, or a manifest-listed file that was removed.                                                                                                                                     |

### Library

`lintSqlTarget(target, options)` and `lintSqlTargets(targets, options)` return the same
`LintRunResult` as the JSON output. Input errors throw `LintInputError`. `LINT_CODES`,
`PII_COLUMN_TOKENS`, `PII_COLUMN_NAMES` and `isPiiColumnName` describe the rule set.

## Configuration

The CLI has no configuration file. The flags above supply all the context. Annotation comments in the SQL itself (`@no_soft_delete`, `@softdelete_fk`, `@destructive`, `@security-definer-approved`, `@pii`) record intentional exceptions and LGPD metadata next to the statement they apply to.

## Examples

### Example 1 — CI gate

`lint:repo` lints STYNX's own `packages/data/migrations` against the merge base. It writes the
base revision to a scratch `--base-dir`, taking the base from `STYNX_MIGRATION_BASE_REF`, else
`git merge-base HEAD origin/main`, else (shallow checkouts) a depth-1 fetch of `origin main`. It
exits 2 when no base resolves.

```yaml
# In your CI chain
- name: Lint migrations
  run: pnpm --filter migration-linter run lint:repo --format=json
```

### Example 2 — annotate personal data under LGPD

```sql
CREATE TABLE acme.contact (
  id uuid PRIMARY KEY,
  -- @pii: basis=contract, retention=5y
  email text NOT NULL,
  phone text -- @pii: basis=consent, retention=2y
);
```

## Common pitfalls

- **Missing RLS policy on a new tenant-scoped table** — the most common violation. Add the `CREATE POLICY` in the same migration.
- **Editing an applied migration** — `LINT013` rejects it. Add a new migration that changes the schema instead.
- **Reusing a prefix in another root** — `LINT010` checks every root passed in one run, so lint all migration roots together and pass the merge base as `--base-dir`. Otherwise duplicates already in history are reported too.
- **Running without the parser** — a missing `pg-query-emscripten` exits 2 with `parserIssues`. It never passes silently.

## Status

The package carries the `@stynx-nyx` name and a publishable manifest. Fixed-group
publication follows in the STYNX release that publishes the tooling packages.

## Related packages

- [`@stynx-nyx/data`](/docs/packages/data/) — the data layer whose conventions this linter enforces (`ADR-001-soft-delete`).
- [`@stynx-nyx/cli`](/docs/packages/cli/) — `stynx migrate` runs the migrations this lints.

## TypeDoc reference

CLI-first tool; the library entry point re-exports the lint functions and rule constants listed above.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `pg-query-emscripten`: `^5.1.0`

### Optional dependencies

_None._

### Peer dependencies

_None._

### Development-only dependencies

- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
