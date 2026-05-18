# @stynx/<package>

One-sentence consumer scope. State whether this package is a NestJS module,
framework-agnostic contract package, CLI, adapter package, or test harness.

## Purpose

Explain the runtime capability this package owns and the package boundary it
does not cross. Mention related packages that must be configured first.

## Install And Import

```ts
import { StynxExampleModule } from '@stynx/<package>';
```

In the monorepo, package consumers use workspace dependencies. Published
consumers install the matching `@stynx/*` package version.

## Module Setup

Show the smallest NestJS module, CLI command, or test-harness setup that proves
how a consumer wires the package.

```ts
@Module({
  imports: [
    StynxExampleModule.forRoot({
      // required options
    }),
  ],
})
export class AppModule {}
```

Use "No NestJS module setup required" for type-only, CLI-only, or test-only
packages.

## Data And Security Model

Document tenant, RLS, audit, privacy, storage, Redis, PostgreSQL, external
service, or credential assumptions. If the package is implementation-free, say
that explicitly.

## Example

Provide a short code path that a host application can copy without importing
package internals.

## Public API

Summarize exports from `src/index.ts` and link to package-level docs or specs.
Keep exports behind the public barrel; avoid documenting deep imports as stable.

## Verification

List package-local commands:

```sh
pnpm --filter @stynx/<package> build
pnpm --filter @stynx/<package> test
```

Add integration-test commands if the package owns database, Redis, S3, Cognito,
or HTTP behavior.

## Documentation Standard

Public barrels must carry package-level `@packageDocumentation`. Exported
services, modules, guards, interceptors, decorators, adapters, and errors need
symbol-level TSDoc when their contract is not obvious from the type signature.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [STYNX Spec](../../docs/architecture/STYNX-SPEC-v0.6.md)
- [Developer Documentation Standard](../../docs/architecture/developer-documentation.md)
