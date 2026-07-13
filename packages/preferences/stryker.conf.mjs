// @ts-nocheck
import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/preferences',
  ignoreStatic: true,
  mutate: [
    'src/errors.ts',
    'src/in-memory-preferences.store.ts',
    'src/preferences.service.ts',
    'src/schema.ts',
  ],
});
