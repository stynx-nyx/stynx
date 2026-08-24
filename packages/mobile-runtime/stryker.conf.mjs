// @ts-nocheck
import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/mobile-runtime',
  ignoreStatic: true,
  mutate: ['src/runtime.ts'],
});
