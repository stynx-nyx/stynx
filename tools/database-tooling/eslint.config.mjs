import { fileURLToPath } from 'node:url';
import { createLibConfig } from '../eslint-config/index.mjs';
import { stynxWorkspaceOptions } from '../eslint-config/workspace.mjs';
import { rootDatabaseToolingConfig } from '../eslint-config/root-database-tooling.mjs';

const rootDir = fileURLToPath(new URL('./', import.meta.url));

export default [
  ...createLibConfig({
    ...stynxWorkspaceOptions,
    strict: true,
    rootDir,
    tsconfig: 'tsconfig.build.json',
    workspaceQuery: {
      ...stynxWorkspaceOptions.workspaceQuery,
      packageRoots: ['tools/database-tooling'],
    },
  }).map((config) => ({ ...config, basePath: rootDir })),
  ...rootDatabaseToolingConfig,
];
