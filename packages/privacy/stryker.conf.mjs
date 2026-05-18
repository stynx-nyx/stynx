import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/privacy',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/pii-map.service.ts',
    'src/privacy.service.ts',
    'src/ropa.ts',
  ],
});
