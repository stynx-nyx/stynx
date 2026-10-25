import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceImplementationConfig } from './workspace-implementation.mjs';
import compatibilityProject from './tsconfig.workspace-compatibility.json' with { type: 'json' };
import docsProject from './tsconfig.workspace-docs-implementation.json' with { type: 'json' };
import k6Project from './tsconfig.workspace-k6.json' with { type: 'json' };

const directory = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(directory, '../..');
/** @param {string[]} files */
const rooted = (files) =>
  files.map((file) => relative(rootDir, resolve(directory, file)).replaceAll('\\', '/'));
const docsFiles = rooted(docsProject.files);
const groups = [
  {
    files: rooted(compatibilityProject.files),
    project: 'tsconfig.workspace-compatibility.json',
    sourceType: 'commonjs',
    k6: false,
  },
  {
    files: docsFiles.filter((file) => file.endsWith('.js')),
    project: 'tsconfig.workspace-docs-implementation.json',
    sourceType: 'commonjs',
    k6: false,
  },
  {
    files: docsFiles.filter((file) => file.endsWith('.mjs')),
    project: 'tsconfig.workspace-docs-implementation.json',
    sourceType: 'module',
    k6: false,
  },
  {
    files: rooted(k6Project.files),
    project: 'tsconfig.workspace-k6.json',
    sourceType: 'module',
    k6: true,
  },
];

// Reuse the established native module policies. Actual compatibility CommonJS
// remains CommonJS; k6 gets its own real declarations and no Node environment.
export const workspaceRuntimeRemaindersConfig = groups.map((group) => {
  const base = workspaceImplementationConfig.find(
    (config) => config.languageOptions.sourceType === group.sourceType,
  );
  if (!base) throw new Error(`Missing maintained module policy: ${group.sourceType}`);
  return {
    ...base,
    files: group.files,
    languageOptions: {
      ...base.languageOptions,
      ...(group.k6
        ? {
            globals: {
              __ENV: 'readonly',
              __VU: 'readonly',
              __ITER: 'readonly',
              open: 'readonly',
              console: 'readonly',
            },
          }
        : {}),
      parserOptions: {
        ...base.languageOptions.parserOptions,
        project: resolve(directory, group.project),
      },
    },
  };
});
