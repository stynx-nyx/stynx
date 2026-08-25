# `@stynx-nyx/offline-sync`

NestJS server primitives for tenant-scoped numbering reservations, idempotent offline sync batches,
and conflict resolution.

```ts
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';

@Module({ imports: [StynxOfflineSyncModule.forRoot()] })
export class AppModule {}
```

Apply `migrations/0001_offline_sync.sql` before mounting the PostgreSQL store. The migration uses
generic `entity_type`, unique `(tenant_id, payload_hash)` replay protection, and forced tenant RLS.
Use `StynxOfflineSyncModule.inMemory()` only for tests or sandboxes.

See the [offline sync contract](/docs/framework/contracts/offline-sync-api).

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/auth`: `workspace:*`
- `@stynx-nyx/backend`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/testing`: `^11.1.19`
- `@types/node`: `24.12.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
