import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  include: ['files', 'exports', 'types'],

  workspaces: {
    '.': {
      entry: [
        'scripts/**/*.{ts,mjs,cjs}',
        'turbo.json',
      ],
      project: [
        'packages/**/*.ts',
        'packages-web/**/*.ts',
        'apps/**/*.ts',
        'backend/**/*.ts',
        'bootstrap/**/*.ts',
        'frontend/**/*.ts',
        'test/**/*.ts',
        'tools/**/*.ts',
      ],
    },
    'packages/*': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages-web/*': {
      entry: ['src/index.ts', 'src/public-api.ts'],
      project: ['src/**/*.ts'],
    },
    'apps/*': {
      entry: ['src/main.ts', 'src/app.module.ts'],
      project: ['src/**/*.ts'],
    },
  },

  ignoreFiles: [
    'tools/migration-linter/dist/**',
    'apps/reference-frontend/src/environments/environment.prod.ts',
    'apps/reference-frontend/src/web/main.ts',
    'apps/reference-web/src/app/reference-web.module.ts',
    'apps/reference-web/src/environments/environment.prod.ts',
    'backend/src/core/auth/decorators/current-user.decorator.ts',
    'backend/src/shared/database/index.ts',
    'packages/cli/src/main.ts',
    'packages/stynx-backend/src/idempotency/constants.ts',
    'packages/stynx-backend/src/idempotency/idempotency.module.ts',
    'packages/stynx-backend/src/idempotency/pg-idempotency.store.ts',
    'packages/stynx-backend/src/rate-limit/constants.ts',
    'packages/stynx-backend/src/rate-limit/pg-rate-limit.store.ts',
    'packages/stynx-backend/src/rate-limit/rate-limit.module.ts',
    'test/frontend/admin-users/user-detail.component.spec.ts',
    'test/frontend/admin-users/user-list.component.spec.ts',
    'test/frontend/cypress.config.ts',
    'test/frontend/e2e/smoke.cy.ts',
    'test/frontend/jest.config.ts',
    'test/frontend/unit/language-switcher.component.spec.ts',
  ],
  ignoreIssues: {
    'tools/migration-linter/src/sql.ts': ['exports'],
    'packages/stynx-backend/src/idempotency/types.ts': ['types'],
    'packages/stynx-backend/src/rate-limit/types.ts': ['types'],
  },
};

export default config;
