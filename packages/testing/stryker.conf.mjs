import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/testing',
  threshold: 60,
  checkers: [],
  mutate: [
    'src/context.ts',
    'src/create-test-app.ts',
    'src/doctor.ts',
    'src/fixtures.ts',
    'src/lgpd-fixture.ts',
    'src/matchers.ts',
    'src/mint-test-session.ts',
  ],
});
