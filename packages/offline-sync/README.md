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
