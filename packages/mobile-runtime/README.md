# `@stynx-nyx/mobile-runtime`

Framework-free offline-first orchestration for STYNX mobile consumers. It promotes TEAT's proven
runtime behind seven ports and keeps entity vocabulary consumer-defined.

```ts
import { OfflineFirstMobileRuntime } from '@stynx-nyx/mobile-runtime';
import { createMobileRuntimeSandbox } from '@stynx-nyx/mobile-runtime/testing';

type EntityType = 'inspection' | 'notice';
const sandbox = createMobileRuntimeSandbox<EntityType>();
const runtime = new OfflineFirstMobileRuntime<EntityType>(sandbox.ports);
```

The workflow is session bootstrap, normative-package install, entity-scoped number reservation,
draft/evidence/finalization, queue submission, and conflict resolution. Construction rejects an
unencrypted store; evidence and payload digests use `sha256:` prefixes.

Production secure-storage, session, backend, camera, GPS, and printer adapters are consumer-owned.
See the [mobile runtime contract](/docs/framework/contracts/mobile-runtime-api).
