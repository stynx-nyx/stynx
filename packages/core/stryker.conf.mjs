import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/core',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/error.filter.ts',
    'src/request-context.interceptor.ts',
    'src/request-context.ts',
    'src/request-id.ts',
    'src/secret-loader.ts',
    'src/system-context.ts',
  ],
});
