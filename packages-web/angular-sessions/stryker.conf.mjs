import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/angular-sessions',
  mutate: [
    'src/active-sessions.component.ts',
    'src/provide-sessions.ts',
    'src/sdk-sessions.adapter.ts',
    'src/tokens.ts',
  ],
});
