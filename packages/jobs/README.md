# @stynx-nyx/jobs

Postgres-backed recurring scheduler and background-worker runtime (E2). Jobs
are always tenant-owned, claimed atomically with `FOR UPDATE SKIP LOCKED`, and
run under STYNX system context. Consumers enqueue one-shot work through
`JobsPort`, or register a handler with `JobsRegistry`.

Apply the platform migrations before enabling workers. This package deliberately
does not expose a controller: applications retain their own authorization and
domain APIs.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@types/node`: `24.12.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
