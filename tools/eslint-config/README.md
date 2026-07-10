# `@stynx-internal/eslint-config` — shared flat ESLint configs for STYNX workspace packages

`@stynx-internal/eslint-config` provides the shared ESLint flat configs every `@stynx-nyx/*` and `@stynx-nyx/*` package extends. Four exported configs — `nest` (backend), `angular` (web), `lib` (library), and the base — encode STYNX's lint rules so every package lints consistently. Extend the right one in your package's `eslint.config.mjs`.

## Purpose

A monorepo with backend + web + library packages needs consistent lint rules, but each package type has different needs (Angular template rules don't apply to a NestJS service). Maintaining per-package ESLint configs drifts. `@stynx-internal/eslint-config` centralises the rule sets; packages just pick the matching export.

You reach for it when authoring a new `@stynx-*` package, or when a package's lint config drifts from the workspace standard.

What it does NOT do: it's not a formatter (Prettier handles formatting). It doesn't lint SQL migrations (that's [`@stynx-internal/migration-linter`](/docs/tools/migration-linter/)).

## Audience

Workspace package authors. Audience-pitch: _"I'm authoring a new @stynx-_ package — which config do I extend?"\*

## Install

```bash
pnpm add -D @stynx-internal/eslint-config
```

## Quick start

```js
// eslint.config.mjs in a backend package
import nestConfig from '@stynx-internal/eslint-config/nest';

export default [...nestConfig];
```

```js
// eslint.config.mjs in a web package
import angularConfig from '@stynx-internal/eslint-config/angular';

export default [...angularConfig];
```

## Public API surface

### Exported configs

| Export                                  | Use for                         | Description                                         |
| --------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `@stynx-internal/eslint-config`         | (base)                          | The base ruleset all others build on.               |
| `@stynx-internal/eslint-config/nest`    | backend `@stynx-nyx/*` packages | NestJS + TypeScript rules.                          |
| `@stynx-internal/eslint-config/angular` | web `@stynx-nyx/*` packages     | Angular + template + TypeScript rules.              |
| `@stynx-internal/eslint-config/lib`     | reusable library packages       | Library-author rules (stricter public-API hygiene). |

## Configuration

Each export is a flat-config array you spread into your `eslint.config.mjs`. Override individual rules by appending an object after the spread:

```js
import nestConfig from '@stynx-internal/eslint-config/nest';

export default [
  ...nestConfig,
  { rules: { '@typescript-eslint/no-explicit-any': 'warn' } }, // local override
];
```

## Examples

### Example 1 — backend package

```js
import nest from '@stynx-internal/eslint-config/nest';
export default [...nest];
```

### Example 2 — web package with a local override

```js
import angular from '@stynx-internal/eslint-config/angular';
export default [...angular, { files: ['**/*.spec.ts'], rules: { 'max-lines': 'off' } }];
```

### Example 3 — library package

```js
import lib from '@stynx-internal/eslint-config/lib';
export default [...lib];
```

## Common pitfalls

- **Config-not-found on extend** — the export subpath must match exactly (`/nest`, `/angular`, `/lib`). Check the package's `exports` map.
- **Rule conflicts when mixing two configs** — don't spread both `nest` and `angular` into one package; pick the one matching the package type.
- **Flat-config vs legacy `.eslintrc`** — these are flat configs (ESLint 9+). They won't work in a legacy `.eslintrc.json` setup.

## Related packages

- [`@stynx-internal/tsconfig`](/docs/tools/tsconfig/) — the paired TypeScript configs; use both together.
- [`@stynx-internal/create-stynx-app`](/docs/tools/create-stynx-app/) — scaffolds apps that extend these configs.

## TypeDoc reference

Config-only package; no symbol-level API surface.
