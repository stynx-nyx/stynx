import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/storage',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/documents.service.ts',
    'src/object-store.service.ts',
    'src/s3.service.ts',
  ],
});
