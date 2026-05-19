import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  include: ['files', 'exports', 'types'],

  workspaces: {
    '.': {
      entry: ['scripts/**/*.{ts,mjs,cjs}', 'turbo.json'],
      project: ['packages/**/*.ts', 'packages-web/**/*.ts', 'apps/**/*.ts', 'tools/**/*.ts'],
    },
    'packages/*': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages-web/*': {
      entry: ['src/index.ts', 'src/public-api.ts', 'src/testing/index.ts'],
      project: ['src/**/*.ts'],
    },
    'domain/*/api': {
      entry: ['src/**/*.module.ts'],
      project: ['src/**/*.ts'],
    },
    'domain/*/web': {
      entry: ['src/**/*.module.ts'],
      project: ['src/**/*.ts'],
    },
    'reference/*': {
      entry: ['src/main.ts', 'scripts/**/*.{mjs,cjs,js,sh}', 'playwright.config.mjs', 'vitest.config.ts'],
      project: [
        'src/**/*.{ts,js,mjs,cjs}',
        'scripts/**/*.{ts,js,mjs,cjs}',
        'test/**/*.{ts,js,mjs,cjs}',
      ],
    },
    'test/*': {
      entry: ['validate.js', 'vitest.config.ts', 'support/*.ts'],
      project: ['**/*.{ts,js,mjs,cjs}'],
    },
    'apps/*': {
      entry: ['src/main.ts', 'src/app.module.ts'],
      project: ['src/**/*.ts'],
    },
  },

  ignoreFiles: [
    'tools/migration-linter/dist/**',
    'reference/web/src/app/reference-web.module.ts',
    'reference/web/src/environments/environment.prod.ts',
    'packages/cli/src/main.ts',
    'packages/backend/src/idempotency/constants.ts',
    'packages/backend/src/idempotency/idempotency.interceptor.ts',
    'packages/backend/src/idempotency/idempotency.module.ts',
    'packages/backend/src/idempotency/pg-idempotency.store.ts',
    'packages/backend/src/idempotency/types.ts',
    'packages/backend/src/rate-limit/constants.ts',
    'packages/backend/src/rate-limit/pg-rate-limit.store.ts',
    'packages/backend/src/rate-limit/rate-limit.guard.ts',
    'packages/backend/src/rate-limit/rate-limit.module.ts',
    'packages/backend/src/rate-limit/types.ts',
    'tools/eslint-config/scripts.mjs',
    'tools/eslint-config/test.mjs',
    'domain/demo-bookmark/api/src/demo-bookmark/dto/update-bookmark-tag.dto.ts',
    'domain/demo-bookmark/api/src/demo-bookmark/entities/bookmark.entity.ts',
    'domain/demo-bookmark/web/src/app/demo-bookmark/bookmark-tag-detail.component.ts',
    'domain/demo-bookmark/web/src/app/demo-bookmark/bookmark-tag-list.component.ts',
    'domain/demo-bookmark/web/src/app/demo-bookmark/bookmark-tag.service.ts',
  ],
  ignoreIssues: {
    'packages/backend/src/idempotency/types.ts': ['types'],
    'packages/backend/src/rate-limit/types.ts': ['types'],
    'tools/migration-linter/src/sql.ts': ['exports'],
  },
};

export default config;
