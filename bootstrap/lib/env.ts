import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { parse } from 'dotenv';
import { resolveBackendEnvPath, resolveFrontendEnvDirs, resolveLegacyBackendEnvMirrorPath } from './targets';

export interface EnvState {
  [key: string]: string;
}

export interface WriteEnvOptions {
  dryRun?: boolean;
  debug?: boolean;
}

export const BACKEND_ENV_PATH = resolveBackendEnvPath();

function debugLog(enabled: boolean | undefined, message: string) {
  if (enabled) {
    // eslint-disable-next-line no-console
    console.log(chalk.gray(`[debug] ${message}`));
  }
}

export async function loadEnv(envPath: string = BACKEND_ENV_PATH): Promise<EnvState> {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    return { ...parse(raw) };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

export async function writeEnv(envPath: string, updates: Record<string, string | undefined>, options: WriteEnvOptions = {}): Promise<void> {
  const current = await loadEnv(envPath);
  const merged: EnvState = { ...current };
  let changed = false;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      if (merged[key] !== undefined) {
        debugLog(options.debug, `Removing ${key}`);
        delete merged[key];
        changed = true;
      }
      continue;
    }
    if (merged[key] !== value) {
      debugLog(options.debug, `Setting ${key}=${value}`);
      merged[key] = value;
      changed = true;
    }
  }
  if (!changed) {
    debugLog(options.debug, 'No .env changes detected');
    return;
  }
  if (options.dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`dry-run: skipping write to ${envPath}`));
    return;
  }
  const lines = Object.entries(merged)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, `${lines.join(os.EOL)}${os.EOL}`);
}

export async function writeBackendEnv(updates: Record<string, string | undefined>, options: WriteEnvOptions = {}): Promise<void> {
  await writeEnv(BACKEND_ENV_PATH, updates, options);
  const legacyMirror = resolveLegacyBackendEnvMirrorPath();
  if (legacyMirror && legacyMirror !== BACKEND_ENV_PATH) {
    await writeEnv(legacyMirror, updates, options);
  }
}

export interface AngularEnvUpdate {
  apiBaseUrl?: string;
  frontendUrl?: string;
  cognito?: {
    region?: string;
    userPoolId?: string;
    clientId?: string;
    redirectUrl?: string;
    logoutUrl?: string;
  };
  storageBucket?: string;
  cloudfrontDomain?: string;
}

function updateKey(text: string, key: string, value: string): string {
  const expression = new RegExp(`${key}\\s*:\\s*(["'])?.*?\\1?,`, 's');
  if (expression.test(text)) {
    return text.replace(expression, `${key}: '${value}',`);
  }
  return text;
}

function updateCognito(text: string, cfg: NonNullable<AngularEnvUpdate['cognito']>): string {
  const block = `cognito: {
    region: '${cfg.region ?? ''}',
    userPoolId: '${cfg.userPoolId ?? ''}',
    clientId: '${cfg.clientId ?? ''}',
    redirectUrl: '${cfg.redirectUrl ?? ''}',
    logoutUrl: '${cfg.logoutUrl ?? ''}',
  },`;
  const expression = /cognito:\s*{[^}]*},?/s;
  if (expression.test(text)) {
    return text.replace(expression, block);
  }
  return text;
}

async function updateAngularFile(filePath: string, updates: AngularEnvUpdate, options: WriteEnvOptions): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const original = content;
    if (updates.apiBaseUrl) {
      content = updateKey(content, 'apiBaseUrl', updates.apiBaseUrl);
    }
    if (updates.frontendUrl) {
      content = updateKey(content, 'frontendUrl', updates.frontendUrl);
    }
    if (updates.storageBucket) {
      content = updateKey(content, 'storageBucket', updates.storageBucket);
    }
    if (updates.cloudfrontDomain) {
      content = updateKey(content, 'cloudfrontDomain', updates.cloudfrontDomain);
    }
    if (updates.cognito) {
      content = updateCognito(content, updates.cognito);
    }
    if (content === original) {
      debugLog(options.debug, `No Angular env changes for ${filePath}`);
      return;
    }
    if (options.dryRun) {
      // eslint-disable-next-line no-console
      console.log(chalk.yellow(`dry-run: skipping write to ${filePath}`));
      return;
    }
    await fs.writeFile(filePath, content, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      debugLog(options.debug, `Angular env file missing: ${filePath}`);
      return;
    }
    throw err;
  }
}

export async function updateAngularEnvironments(updates: AngularEnvUpdate, options: WriteEnvOptions = {}): Promise<void> {
  const files = ['environment.ts', 'environment.prod.ts'];
  const dirs = resolveFrontendEnvDirs();
  await Promise.all(dirs.flatMap((dir) => files.map((file) => updateAngularFile(path.join(dir, file), updates, options))));
}
