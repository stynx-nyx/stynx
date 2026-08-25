# `@stynx-nyx/preferences`

Closed, tenant-and-subject scoped preferences and a narrow profile projection. Mount `StynxPreferencesModule.forRoot()` after STYNX core/data/auth context modules. HTTP writes require a strong `If-Match` ETag and never accept tenant or subject identifiers from callers.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`
- `zod`: `^4.3.6`

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
