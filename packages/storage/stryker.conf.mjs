import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/storage',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/documents.service.ts',
    'src/object-store.service.ts',
    'src/s3.service.ts',
  ],
});
