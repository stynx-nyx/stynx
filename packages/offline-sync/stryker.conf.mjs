// @ts-nocheck
import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/offline-sync',
  ignoreStatic: true,
  mutate: ['src/errors.ts', 'src/in-memory-offline-sync.store.ts', 'src/offline-sync.service.ts'],
});
