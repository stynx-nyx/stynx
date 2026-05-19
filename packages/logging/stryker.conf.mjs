import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/logging',
  mutate: [
    'src/dedupe.ts',
    'src/logger.service.ts',
    'src/pino.factory.ts',
    'src/request-logging.middleware.ts',
  ],
});
