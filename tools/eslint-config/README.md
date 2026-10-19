# `@stynx-nyx/eslint-config` — shared flat ESLint profiles for STYNX packages and applications

`@stynx-nyx/eslint-config` is an ESM package of named factories that build ESLint flat configs for the four kinds of code in a STYNX-based repository — reusable libraries, NestJS backends, Angular frontends and plain JavaScript scripts — plus a `./test` profile for spec files. Each factory resolves paths (tsconfig, boundary elements) from the consumer's root, so the same profile works in STYNX and in an application that installs the package.

## Purpose

Every STYNX-based repository needs the same lint contract: typed code with no `any` escape hatches, explicit module boundaries, idempotent write routes and ESM-only authored code. Copying those rules into each repository drifts. This package owns them; a repository calls the factory for each kind of code in its `eslint.config.mjs`.

You reach for it when you author `eslint.config.mjs` for a STYNX-based application, or when a lint gate needs the `./test` profile (`eslint --config <resolved @stynx-nyx/eslint-config/test>`).

What it does NOT do: it's not a formatter (Prettier handles formatting). It doesn't lint SQL migrations (that's [`@stynx-internal/migration-linter`](/docs/tools/migration-linter/)).

## Audience

Application and package authors who lint TypeScript or JavaScript against the STYNX contract.

## Install

The package is part of the STYNX workspace and is not yet published; publication with the fixed-group release is tracked as migration item SM-21. Inside the workspace:

```bash
pnpm add -D @stynx-nyx/eslint-config --workspace
```

`eslint` (^10.5.0) and `typescript` (^6.0.3) are peer dependencies; the ESLint plugins the profiles use are regular dependencies.

## Quick start

```js
// eslint.config.mjs at the application root
import { createNestConfig } from '@stynx-nyx/eslint-config';

export default createNestConfig();
```

```js
// eslint.config.mjs for spec files
export { default } from '@stynx-nyx/eslint-config/test';
```

## Public API surface

### Exports

| Export                          | Contents                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@stynx-nyx/eslint-config`      | Named factories: `createLibConfig`, `createNestConfig`, `createAngularConfig`, `createScriptsConfig`, `createTestConfig`. |
| `@stynx-nyx/eslint-config/test` | The test-file profile as a flat-config entry point (default export, as `eslint --config` requires).                       |

The root exposes named factories only (S-38). The default export of `./test` exists because ESLint's `--config` contract requires it.

### Factories

| Factory               | Lints                           | Notes                                                              |
| --------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `createLibConfig`     | `src/**/*.ts`, `lib/**/*.ts`    | Type-aware TypeScript rules.                                       |
| `createNestConfig`    | `src/**/*.ts`                   | Adds `stynx/require-idempotent-route-decorator`.                   |
| `createAngularConfig` | `src/**/*.ts`, inline templates | Angular and template rules; prefers `tsconfig.app.json`.           |
| `createScriptsConfig` | `**/*.{js,mjs,cjs}`             | Plain JavaScript as ESM.                                           |
| `createTestConfig`    | `**/*.{spec,test}.{ts,tsx}`     | CW-1 mutation-assertion guards; syntax-only (no type information). |

### Enabled rule families (strict profiles)

| Family       | Rule(s)                                                                                                                                     | Level   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Explicit any | `@typescript-eslint/no-explicit-any`                                                                                                        | `error` |
| Unsafe types | every `@typescript-eslint/no-unsafe-*` rule the installed plugin ships                                                                      | `error` |
| Boundaries   | `boundaries/dependencies`, deny by default, consumer allow list                                                                             | `error` |
| Idempotency  | `stynx/require-idempotent-route-decorator` (Nest)                                                                                           | `error` |
| Authored CJS | `stynx/no-authored-cjs`: `require`, `createRequire`, `module.exports`, `exports`, `__dirname`, `__filename`, `import = require`, `export =` | `error` |

Run ESLint with `--max-warnings=0`. `test/rule-families.spec.mjs` holds one fixture per family that fails the gate naming its rule, and a clean fixture per profile that passes.

## Configuration

Every factory except `createTestConfig` takes one options object:

| Option                | Default                   | Meaning                                                                           |
| --------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `rootDir`             | `process.cwd()`           | The consumer root; tsconfig paths resolve against it.                             |
| `tsconfig`            | `./tsconfig.json`         | Project file(s) for type-aware rules.                                             |
| `files`               | per factory (table above) | Globs the profile applies to.                                                     |
| `boundaries.elements` | `[]`                      | `eslint-plugin-boundaries` element descriptors, relative to `rootPath`.           |
| `boundaries.allow`    | `[]`                      | Allowed element-to-element dependencies; everything else is denied.               |
| `boundaries.rootPath` | `rootDir`                 | Root the element patterns are relative to.                                        |
| `strict`              | `true`                    | `false` keeps STYNX's pre-migration levels; only STYNX's own entry points use it. |

`createTestConfig` takes `{ files }`.

## Examples

### Example 1 — backend with declared boundaries

```js
import { createNestConfig } from '@stynx-nyx/eslint-config';

export default createNestConfig({
  boundaries: {
    elements: [
      { type: 'domain', pattern: 'src/domain/**' },
      { type: 'http', pattern: 'src/http/**' },
    ],
    allow: [{ from: { type: 'http' }, allow: { to: { type: 'domain' } } }],
  },
});
```

### Example 2 — Angular application plus specs

```js
import { createAngularConfig, createTestConfig } from '@stynx-nyx/eslint-config';

export default [...createAngularConfig(), ...createTestConfig()];
```

### Example 3 — repository scripts

```js
import { createScriptsConfig } from '@stynx-nyx/eslint-config';

export default createScriptsConfig({ files: ['scripts/**/*.mjs'] });
```

## Common pitfalls

- **`any` from untyped imports** — an import TypeScript cannot resolve has an error type, which the `no-unsafe-*` rules report. Install the package's types or parse the value with zod.
- **Boundaries never fire** — elements must match the linted files relative to `boundaries.rootPath`; with no elements declared, no dependency is classified.
- **Flat-config only** — these are flat configs (ESLint 9+). They won't work in a legacy `.eslintrc.json` setup.

## STYNX workspace entry points

STYNX lints its own packages through `tools/eslint-config/{lib,nest,angular,scripts,test}.mjs` (`eslint --config ../../tools/eslint-config/nest.mjs`). Except for `test.mjs`, these pass `strict: false` from `workspace.mjs`, which keeps STYNX's current levels until migration items SM-01, SM-11, SM-12 and SM-13 move it onto the strict profiles. They are not package exports.

## Related packages

- [`@stynx-internal/tsconfig`](/docs/tools/tsconfig/) — the paired TypeScript configs; use both together.
- [`@stynx-internal/create-stynx-app`](/docs/tools/create-stynx-app/) — scaffolds apps that extend these configs.

## TypeDoc reference

Config-only package; no symbol-level API surface.
