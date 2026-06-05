# `@stynx/cli` — STYNX workspace CLI for app scaffolding, migrations, doctor, audit, and adoption

`@stynx/cli` is the STYNX-side command-line tool — distinct from the sibling `devai` CLI which governs the C-4 DEVAI pilot. The verb set covers what an app developer (or workspace integrator) actually runs day-to-day: `stynx init <name>` scaffolds a new STYNX app, `stynx migrate {up,down,redo,status}` drives Drizzle migrations, `stynx doctor` runs the app-side health check, `stynx audit verify` validates the audit chain integrity, `stynx privacy ropa` produces a LGPD Record-of-Processing-Activities export, and `stynx adopt {scan,apply,...}` is the porting-onboarding helper for foreign apps moving onto STYNX.

## Purpose

Every STYNX-based app needs the same handful of operations: scaffold, migrate, doctor, audit-verify, ROPA-export, and (for the porting use case) adopt-scan. Embedding each as a bash script per app accumulates drift. `@stynx/cli` consolidates them with a consistent verb shape, JSON-output mode for CI, and the same input-validation discipline as the runtime packages. It's a thin orchestration layer — the heavy lifting lives in the runtime `@stynx/*` packages it shells into.

You reach for `@stynx/cli` when you're: bootstrapping a new STYNX app (`stynx init`), running a migration step in CI or locally, exporting a ROPA before an audit, verifying the audit chain hash, or driving the `adopt` flow when porting a foreign app's data + endpoints onto STYNX.

What it does NOT do: it does not run inside your app's runtime. It is a developer/operator tool, not a NestJS-injectable. For runtime equivalents (e.g. trigger a migration from app code), use `@stynx/data`'s migration helpers directly.

## Audience

Backend developers + workspace integrators. The `init` and `adopt` verbs are for the app-creation moment; the `migrate` / `doctor` / `audit` / `privacy` verbs are routine app-ops once the app is running.

## Install

```bash
pnpm add -D @stynx/cli
# or globally
pnpm add -g @stynx/cli
```

Then invoke as `stynx <verb>` (or via `pnpm exec stynx <verb>` if installed locally).

**Peer dependencies:** `@stynx/core` `^1`, `@stynx/data` `^1`, `@stynx/audit` `^1`, `@stynx/privacy` `^1`. **Node:** 24.x.

## Quick start

```bash
# Scaffold a new STYNX backend app
npx stynx init my-app

# Or scaffold with Angular workspace files
npx stynx init my-app --angular --dir /workspaces/

# Migrate up to head
stynx migrate up --db postgres://localhost/my_app

# Doctor: app-side health check
stynx doctor

# Verify audit chain integrity (idempotent)
stynx audit verify

# Generate LGPD ROPA
stynx privacy ropa --out ./ropa.json
```

## Public API surface

### CLI verbs

| Verb                               | Subcommand / Options          | Description                                                                                                                                                                        |
| ---------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init <app-name>`                  | `--angular --dir <dir>`       | Scaffold a new STYNX app. Produces a NestJS skeleton with `@stynx/*` packages pre-installed + a starter `AppModule`. `--angular` adds the Angular workspace under `packages-web/`. |
| `migrate status`                   | `--db <url>`                  | Report applied + pending migrations.                                                                                                                                               |
| `migrate up`                       | `--db <url> [--to <name>]`    | Apply pending migrations up to head (or to a specific marker).                                                                                                                     |
| `migrate down`                     | `--db <url> --to <name>`      | Roll back to a marker.                                                                                                                                                             |
| `migrate redo`                     | `--db <url>`                  | Roll back the last migration and re-apply.                                                                                                                                         |
| `doctor`                           | `--repo-root <path>`          | Run the app-side doctor check: F1 paths, package linkage, build health. Mirrors sibling DEVAI doctor's signal.                                                                     |
| `audit verify`                     | `--db <url>`                  | Verify the audit event chain's hash integrity end-to-end. Exits non-zero if a break is found.                                                                                      |
| `privacy ropa`                     | `--out <path>`                | Generate a LGPD Record-of-Processing-Activities JSON document from the PII column registry.                                                                                        |
| `adopt scan`                       | `--source <dir> --out <path>` | Scan a foreign app's controllers + DB schema; emit a structured adoption-plan.                                                                                                     |
| `adopt apply`                      | `--plan <path>`               | Apply a previously-scanned adoption plan to the current STYNX repo.                                                                                                                |
| `adopt apply-proposed-permissions` | `--plan <path>`               | Apply the permission proposals from an adoption scan to `@stynx/auth` config.                                                                                                      |
| `adopt link-cognito-users`         | `--mapping <path>`            | Link foreign-app user identities to Cognito principals.                                                                                                                            |

### Programmatic API

| Export                                                                                                     | Description                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `buildProgram`                                                                                             | Returns a `Commander.Command` with every verb registered. Useful in tests + workspace tooling. |
| `runDoctor`                                                                                                | Programmatic doctor entry point (also exported by `@stynx/testing`).                           |
| `migrateUp` / `migrateDown` / `migrateRedo` / `migrationStatus`                                            | Direct migration runners.                                                                      |
| `verifyAuditChain`                                                                                         | Direct audit-chain verifier.                                                                   |
| `generateRopaFromApp`                                                                                      | Direct ROPA generator.                                                                         |
| `scaffoldApp`                                                                                              | Direct scaffolder (init verb's implementation).                                                |
| `adoptScan` / `adoptApply` / `adoptApplyProposedPermissions` / `linkCognitoUsers` / `formatAdoptScanHuman` | Adoption flow entry points.                                                                    |

## Configuration

### Per-verb flags

Most verbs accept a `--repo-root` flag (defaulting to `process.cwd()`) and a `--db <url>` flag (defaulting to `process.env.DATABASE_URL`). Run `stynx <verb> --help` for the exhaustive list.

### Environment variables

| Variable                 | Used by               | Description                                             |
| ------------------------ | --------------------- | ------------------------------------------------------- |
| `DATABASE_URL`           | migrate, audit verify | Default DB connection string.                           |
| `STYNX_AUDIT_CHAIN_HEAD` | audit verify          | Override the expected chain-head hash for verification. |

## Examples

### Example 1 — CI migration step

```yaml
# .github/workflows/migrate.yml
- name: Apply migrations
  run: pnpm exec stynx migrate up --db ${{ secrets.DATABASE_URL }}
```

### Example 2 — adoption scan + apply

```bash
# Scan a foreign repo
stynx adopt scan --source ../old-app --out ./adoption-plan.json

# Inspect (it's human-readable JSON)
cat adoption-plan.json | jq

# Apply
stynx adopt apply --plan ./adoption-plan.json
```

### Example 3 — programmatic use in workspace tooling

```ts
import { buildProgram } from '@stynx/cli';

const program = buildProgram();
await program.parseAsync(['node', 'stynx', 'migrate', 'status']);
```

## Common pitfalls

- **Confusing `@stynx/cli` with the sibling `devai` CLI** — they live in different sibling checkouts (`stynx/packages/cli/` vs `devai/packages/cli/`). Both produce a binary named after themselves. The sibling devai CLI governs the C-4 pilot's doctor + sensor + spec checks; `@stynx/cli` is your app's runtime ops.
- **Running `stynx migrate up` against a production DB without dry-run** — there is no built-in dry-run gate. Wrap in `--db` to a staging URL first, OR use `stynx migrate status` to inspect what would run.
- **`stynx audit verify` exiting non-zero in CI** — the chain hash mismatched. Often caused by replaying audit events out-of-order in a test setup; not necessarily a true integrity break. Inspect the head hash before assuming compromise.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — config loading + secret loader the CLI uses to read `DATABASE_URL` from secrets.
- [`@stynx/data`](/docs/packages/data/) — the migration runner the CLI delegates to.
- [`@stynx/audit`](/docs/packages/audit/) — the audit chain whose integrity `audit verify` checks.
- [`@stynx/privacy`](/docs/packages/privacy/) — the PII column registry the ROPA generator reads.
- [`@stynx-internal/create-stynx-app`](/docs/tools/create-stynx-app/) — a thinner npx-style scaffolder, alternative to `stynx init` for the very-first-time use case.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-cli/`](/docs/api-reference/stynx-cli/)
