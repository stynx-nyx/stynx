# @stynx/cli

Command-line tools for init, doctor checks, migrations, audit verification, privacy ROPA output, and adoption helpers.

## Purpose

Command-line tools for init, doctor checks, migrations, audit verification, privacy ROPA output, and adoption helpers.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/cli';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

No NestJS module setup is required. Use the package as a CLI entrypoint or import command helpers in automation tests.

## Data And Security Model

CLI commands may connect to PostgreSQL or inspect repository files depending on the command. Production-impacting commands must use the same database URL, migration, and audit controls as the owning packages.

## Example

```sh
stynx doctor
stynx migrate status --database-url "$DATABASE_URL"
stynx privacy ropa --database-url "$DATABASE_URL"
```

## Public API

- CLI command registration
- audit verification helpers
- doctor checks
- init scaffolding
- migration status/run helpers
- privacy ROPA output
- adoption scan/apply helpers

Current barrel highlights:

- `export * from './cli'`
- `export * from './audit'`
- `export * from './doctor'`
- `export * from './init'`
- `export * from './migrate'`
- `export * from './privacy-ropa'`
- `export * from './adopt'`

## Verification

```sh
pnpm --filter @stynx/cli build
pnpm --filter @stynx/cli test
pnpm --filter @stynx/cli test:adopt
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/arch/developer-documentation.md](../../docs/arch/developer-documentation.md)
- [docs/stynx/package-architecture.md](../../docs/stynx/package-architecture.md)
- [docs/stynx/consumer-adoption-guide.md](../../docs/stynx/consumer-adoption-guide.md)
