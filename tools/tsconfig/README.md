# `@stynx-internal/tsconfig` — shared TypeScript presets for STYNX workspace packages

`@stynx-internal/tsconfig` provides the shared TypeScript configs every STYNX package extends. Presets — `base` (strict baseline), `node24` (Node 24 backend/server), `angular18` (Angular/browser), `lib` (reusable libraries) — encode STYNX's compiler settings so every package compiles with consistent strictness + module resolution. Extend the matching preset in your package's `tsconfig.json`.

## Purpose

A monorepo needs consistent TypeScript settings, but a Node server, an Angular app, and a published library target different runtimes + module systems. Maintaining per-package compiler options drifts. `@stynx-internal/tsconfig` centralises the presets; packages pick the matching one.

You reach for it when authoring a new `@stynx-*` package, or aligning a package's compiler config to the workspace standard.

What it does NOT do: it's not a linter (that's [`@stynx-internal/eslint-config`](/docs/tools/eslint-config/)). It doesn't bundle or build (your bundler/tsc does).

## Audience

Workspace package authors. Audience-pitch: _"My new package targets Node 24 — which tsconfig do I extend?"_

## Install

```bash
pnpm add -D @stynx-internal/tsconfig
```

## Quick start

```jsonc
// tsconfig.json in a Node backend package
{
  "extends": "@stynx-internal/tsconfig/node24.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src"],
}
```

```jsonc
// tsconfig.json in an Angular package
{
  "extends": "@stynx-internal/tsconfig/angular18.json",
  "include": ["src"],
}
```

## Public API surface

### Presets

| Preset           | Extend for                      | Description                                                                  |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `base.json`      | (foundation)                    | Strict baseline — `strict: true`, `noUncheckedIndexedAccess`, ES2022 target. |
| `node24.json`    | Node 24 backend/server packages | Node 24 lib + module resolution + CommonJS/ESM interop.                      |
| `angular18.json` | Angular/browser packages        | Angular-compatible target + DOM libs + decorators.                           |
| `lib.json`       | reusable TypeScript libraries   | Declaration emit + stricter public-API settings.                             |

## Configuration

Each preset is a JSON config you `extends`. Override `compilerOptions` in your local `tsconfig.json` after the extend:

```jsonc
{
  "extends": "@stynx-internal/tsconfig/lib.json",
  "compilerOptions": { "declarationDir": "dist/types" },
}
```

## Examples

### Example 1 — backend package

```jsonc
{ "extends": "@stynx-internal/tsconfig/node24.json", "include": ["src"] }
```

### Example 2 — published library with declarations

```jsonc
{
  "extends": "@stynx-internal/tsconfig/lib.json",
  "compilerOptions": { "outDir": "dist", "declaration": true },
  "include": ["src"],
}
```

### Example 3 — Angular package

```jsonc
{ "extends": "@stynx-internal/tsconfig/angular18.json", "include": ["src"] }
```

## Common pitfalls

- **Path-mapping inheritance** — `extends` does NOT merge `paths`; if a preset declares `paths`, your local `paths` replaces rather than merges. Re-declare what you need.
- **Module-resolution mode mismatch** — extending `node24` in an Angular package (or vice versa) produces wrong module resolution. Match the preset to the package type.
- **Target drift** — overriding `target` locally can break compatibility with the preset's `lib`. Override deliberately.

## Related packages

- [`@stynx-internal/eslint-config`](/docs/tools/eslint-config/) — the paired ESLint configs; use both together.
- [`@stynx-internal/create-stynx-app`](/docs/tools/create-stynx-app/) — scaffolds apps that extend these presets.

## TypeDoc reference

Config-only package; no symbol-level API surface.
