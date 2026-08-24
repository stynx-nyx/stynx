import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/notifications',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/notifications.service.ts',
    'src/dispatch.service.ts',
    'src/inbox.service.ts',
    'src/templates/registry.ts',
    'src/templates/render.ts',
    'src/preferences/preferences.port.ts',
    'src/adapters/email-ses.adapter.ts',
    'src/adapters/sms-sns.adapter.ts',
    'src/adapters/push-stub.adapter.ts',
    'src/adapters/inapp-postgres.adapter.ts',
  ],
});
