# `create-stynx-app` — scaffold a new STYNX-based Angular application

`create-stynx-app` (`@stynx-internal/create-stynx-app`) is the project scaffolder. Run it once to generate a standalone Angular app pre-wired with the STYNX foundation: `provideStynxDefaults()`, OIDC auth via `@stynx-web/angular-auth`, tenant resolution, and a Flow client placeholder. It's the fastest path from zero to a running STYNX frontend.

## Purpose

Starting a STYNX app from a blank Angular workspace means wiring `@stynx-web/angular`, auth, tenancy, the SDK, and the build config by hand — error-prone and repetitive. `create-stynx-app` generates a correct, runnable starting point so you skip the boilerplate.

You reach for it once, at the very beginning of a new app.

What it does NOT do: it's not a code generator for ongoing development (it scaffolds the initial app, not features). It doesn't scaffold the backend (use [`@stynx/cli`](/docs/packages/cli/)'s `stynx init` for that).

## Audience

Workspace integrators starting a new STYNX-based application. Audience-pitch: _"I want to build a new app on STYNX — what do I run?"_

## Install

No install needed — run via the workspace, or (when published) via npx:

```bash
node tools/create-stynx-app/bin.mjs my-stynx-app
# or, when published:
npx create-stynx-app my-stynx-app
```

## Quick start

```bash
# Scaffold + install dependencies
node tools/create-stynx-app/bin.mjs my-stynx-app

# Scaffold without installing (fast)
node tools/create-stynx-app/bin.mjs /tmp/my-stynx-app --no-install

# Preview the target path without writing
node tools/create-stynx-app/bin.mjs my-app --dry-run
```

The generated app is a standalone Angular 20 app wired through `provideStynxDefaults(...)`, with STYNX Angular core, OIDC auth, tenant resolution, and an empty Flow client placeholder.

## Public API surface

### CLI

| Invocation                | Description                      |
| ------------------------- | -------------------------------- |
| `create-stynx-app <name>` | Scaffold a new app at `<name>/`. |

### Flags

| Flag           | Description                                           |
| -------------- | ----------------------------------------------------- |
| `--no-install` | Scaffold files but skip `pnpm install`.               |
| `--dry-run`    | Print the target path without writing files.          |
| `--force`      | Allow writing into an existing (non-empty) directory. |

## Configuration

The scaffolder takes no config file — behaviour is driven entirely by CLI flags. The generated app's config lives in its own `app.config.ts` (where `provideStynxDefaults()` is wired).

## Examples

### Example 1 — new app, full setup

```bash
node tools/create-stynx-app/bin.mjs acme-portal
cd acme-portal
pnpm start
```

### Example 2 — CI smoke (no install)

```bash
node tools/create-stynx-app/bin.mjs /tmp/smoke --no-install
# assert files exist, then discard
```

## Common pitfalls

- **Scaffolding into a non-empty directory** without `--force` aborts to avoid clobbering. Use `--force` deliberately.
- **Template pins a STYNX version** — the generated app references specific `@stynx-web/*` versions. After scaffolding, run your package manager's update to align with the latest if needed.
- **Backend not scaffolded** — this tool produces the frontend. Pair with `stynx init` ([`@stynx/cli`](/docs/packages/cli/)) for the backend.

## Related packages

- [`@stynx/cli`](/docs/packages/cli/) — `stynx init` scaffolds the backend side.
- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation the generated app wires.
- [`@stynx-internal/eslint-config`](/docs/tools/eslint-config/) + [`@stynx-internal/tsconfig`](/docs/tools/tsconfig/) — the configs the generated app extends.

## TypeDoc reference

CLI-only tool; no symbol-level API surface.
