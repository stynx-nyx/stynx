import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/logging',
  threshold: 60,
  mutate: [
    'src/dedupe.ts',
    'src/logger.service.ts',
    'src/pino.factory.ts',
    'src/request-logging.middleware.ts',
  ],
});
