import { resolve } from 'node:path';
import { createAngularConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

const workspaceRoot = stynxWorkspaceOptions.workspaceQuery.rootDir;
const packages = ['angular', 'angular-auth', 'angular-i18n'];
export const workspaceAngularTestingFiles = packages.map(
  (name) => `packages-web/${name}/testing/index.ts`,
);

// These published secondary entrypoints are implementation, not syntax-only
// tests. Reuse the owning Angular profile and its real compiler dependencies.
/** @param {string} packageRoot */
export function angularTestingConfigForRoot(packageRoot) {
  const rootDir = resolve(packageRoot);
  const name = packages.find(
    (candidate) => resolve(workspaceRoot, 'packages-web', candidate) === rootDir,
  );
  if (name === undefined) return [];
  const configs = createAngularConfig({
    ...stynxWorkspaceOptions,
    rootDir,
    files: ['testing/index.ts'],
    tsconfig: './tsconfig.lint-testing-entry.json',
    boundaries: {
      ...stynxWorkspaceOptions.boundaries,
      // Only this exact testing entry uses the package directory as its
      // owning element. Its primary barrel is the same package, not a new
      // allowed inter-package dependency; every other element/rule is retained.
      elements: stynxWorkspaceOptions.boundaries.elements.map((element) =>
        element.type === name ? { ...element, pattern: `packages-web/${name}` } : element,
      ),
    },
  }).filter((config) => config.files?.includes('testing/index.ts'));
  if (configs.length !== 1)
    throw new Error(`Angular testing entry has no unique source profile: ${rootDir}`);
  return configs.map((config) => ({ ...config, basePath: rootDir }));
}

export const workspaceAngularTestingConfig = packages.flatMap((name) =>
  angularTestingConfigForRoot(resolve(workspaceRoot, 'packages-web', name)),
);
