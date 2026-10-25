import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAngularConfig, createLibConfig, createNestConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

const workspaceRoot = stynxWorkspaceOptions.workspaceQuery.rootDir;
const factories = { lib: createLibConfig, nest: createNestConfig, angular: createAngularConfig };

// This is the same source-root census used by the normal workspace query
// enforcement. Explicit overrides mirror the two package-local configurations.
/** @typedef {{ rootDir: string, directory: string, profile: 'lib' | 'nest' | 'angular', tsconfig?: string }} WorkspaceSourceProfile */
const sourceProfiles = stynxWorkspaceOptions.workspaceQuery.packageRoots.map(
  /** @returns {WorkspaceSourceProfile} */
  (directory) => {
  const rootDir = resolve(workspaceRoot, directory);
  if (directory === 'domain/demo-bookmark/web') {
    return { rootDir, directory, profile: 'angular', tsconfig: './tsconfig.json' };
  }
  if (directory === 'tools/database-tooling') {
    return { rootDir, directory, profile: 'lib', tsconfig: './tsconfig.build.json' };
  }
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('scripts' in manifest) ||
      typeof manifest.scripts !== 'object' || manifest.scripts === null ||
      !('lint' in manifest.scripts) || typeof manifest.scripts.lint !== 'string') {
    throw new Error(`Workspace source root has no normal lint command: ${directory}`);
  }
  const profile = /tools\/eslint-config\/(lib|nest|angular)\.mjs/u.exec(manifest.scripts.lint)?.[1];
  if (profile !== 'lib' && profile !== 'nest' && profile !== 'angular') {
    throw new Error(`Unclassified workspace source lint profile: ${directory}`);
  }
  return { rootDir, directory, profile };
});

export const workspaceSourceFiles = sourceProfiles.flatMap(({ directory, profile }) => [
  `${directory}/src/**/*.ts`,
  ...(profile === 'lib' ? [`${directory}/lib/**/*.ts`] : []),
]);

export const rootWorkspaceSourceConfig = sourceProfiles.flatMap(({ rootDir, profile, tsconfig }) => {
  const factory = factories[profile];
  if (!factory) throw new Error(`Unknown workspace lint profile: ${profile}`);
  return factory({
    ...stynxWorkspaceOptions,
    rootDir,
    ...(tsconfig ? { tsconfig } : {}),
  }).map((config) => ({ ...config, basePath: rootDir }));
});
