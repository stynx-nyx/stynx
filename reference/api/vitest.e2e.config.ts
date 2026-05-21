import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

const stynxPackages = [
  'audit',
  'auth',
  'backend',
  'cli',
  'contracts',
  'core',
  'data',
  'flow',
  'health',
  'i18n',
  'idempotency',
  'logging',
  'privacy',
  'ratelimit',
  'sessions',
  'storage',
  'tenancy',
  'testing',
];
const stynxAlias = Object.fromEntries(
  stynxPackages.map((pkg) => [`@stynx/${pkg}`, resolve(__dirname, `../../packages/${pkg}/src/index.ts`)]),
);

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/reference-api',
  include: ['test/e2e/**/*.e2e.ts'],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  alias: stynxAlias,
});
