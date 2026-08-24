import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/outbox',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/outbox.service.ts',
    'src/backoff.ts',
    'src/ack-signature.ts',
  ],
});
