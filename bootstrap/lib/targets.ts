import fs from 'fs';
import path from 'path';

export const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const rootPath = (...parts: string[]): string => path.resolve(WORKSPACE_ROOT, ...parts);
const exists = (filePath: string): boolean => fs.existsSync(filePath);

export const REFERENCE_BACKEND_WORKSPACE = '@stynx/reference-api';
export const LEGACY_BACKEND_WORKSPACE = 'backend';
export const REFERENCE_FRONTEND_WORKSPACE = '@stynx/reference-web';
export const PREVIOUS_REFERENCE_FRONTEND_WORKSPACE = '@stech/reference-frontend';
export const LEGACY_FRONTEND_WORKSPACE = 'frontend';

export const REFERENCE_BACKEND_ENV_PATH = rootPath('apps/reference-api/.env');
export const LEGACY_BACKEND_ENV_PATH = rootPath('backend/.env');
export const REFERENCE_FRONTEND_ENV_DIR = rootPath('apps/reference-web/src/environments');
export const PREVIOUS_REFERENCE_FRONTEND_ENV_DIR = rootPath('apps/reference-frontend/src/environments');
export const LEGACY_FRONTEND_ENV_DIR = rootPath('frontend/src/environments');

export interface FrontendBuildTarget {
  workspace: string;
  buildScript: string;
  distRoot: string;
}

export const resolveBackendWorkspace = (): string => {
  if (exists(rootPath('apps/reference-api/package.json'))) {
    return REFERENCE_BACKEND_WORKSPACE;
  }
  if (exists(rootPath('backend/package.json'))) {
    return LEGACY_BACKEND_WORKSPACE;
  }
  throw new Error('No backend workspace target found (expected apps/reference-api or backend).');
};

export const resolveFrontendBuildTarget = (): FrontendBuildTarget => {
  if (exists(rootPath('apps/reference-web/package.json'))) {
    return {
      workspace: REFERENCE_FRONTEND_WORKSPACE,
      buildScript: 'build:web',
      distRoot: rootPath('apps/reference-web/dist/browser'),
    };
  }

  if (exists(rootPath('apps/reference-frontend/package.json'))) {
    return {
      workspace: PREVIOUS_REFERENCE_FRONTEND_WORKSPACE,
      buildScript: 'build:web',
      distRoot: rootPath('apps/reference-frontend/dist/browser'),
    };
  }

  if (exists(rootPath('frontend/package.json'))) {
    return {
      workspace: LEGACY_FRONTEND_WORKSPACE,
      buildScript: 'build',
      distRoot: rootPath('frontend/dist'),
    };
  }

  throw new Error('No frontend workspace target found (expected apps/reference-web, apps/reference-frontend, or frontend).');
};

export const resolveBackendEnvPath = (): string => {
  if (exists(rootPath('apps/reference-api'))) {
    return REFERENCE_BACKEND_ENV_PATH;
  }
  return LEGACY_BACKEND_ENV_PATH;
};

export const resolveLegacyBackendEnvMirrorPath = (): string | null => {
  if (exists(rootPath('backend'))) {
    return LEGACY_BACKEND_ENV_PATH;
  }
  return null;
};

export const resolveFrontendEnvDirs = (): string[] => {
  const dirs: string[] = [];
  if (exists(rootPath('apps/reference-web/src/environments'))) {
    dirs.push(REFERENCE_FRONTEND_ENV_DIR);
  }
  if (exists(rootPath('apps/reference-frontend/src/environments'))) {
    dirs.push(PREVIOUS_REFERENCE_FRONTEND_ENV_DIR);
  }
  if (exists(rootPath('frontend/src/environments'))) {
    dirs.push(LEGACY_FRONTEND_ENV_DIR);
  }
  return dirs;
};
