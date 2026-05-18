import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/sessions',
  threshold: 60,
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/in-memory-session-store.ts',
    'src/jwt-signing.service.ts',
    'src/session.service.ts',
  ],
});
