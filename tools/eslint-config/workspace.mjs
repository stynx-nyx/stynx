// Options that bind the shared factories to the STYNX monorepo itself. Only
// STYNX's own `--config ../../tools/eslint-config/*.mjs` entry points use
// them; this module is not exported.
//
// `strict: false` keeps the type-safety levels STYNX lints with today:
// `no-explicit-any` and four `no-unsafe-*` rules off and no `no-authored-cjs`.
// `stynx/require-idempotent-route-decorator` is at error in every profile since
// SM-13, and boundaries are deny-by-default since SM-12 (below). SM-11 moves
// STYNX onto the remaining strict (published default) levels and then deletes
// this switch.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// SM-12: every package linted through a workspace entry point is one boundaries
// element, and an import from one package to another must be listed here. The
// list codifies the graph measured on 2026-10-23 (S10, Owner decision O-6 (a));
// a new edge is a reviewed change to this file. Keys and values are element
// types: the package directory name, or `reference-api` / `reference-web`.
const allowedDependencies = {
  // packages/*
  audit: ['auth', 'contracts', 'core', 'data'],
  auth: ['contracts', 'core', 'data', 'idempotency', 'sessions'],
  backend: ['contracts', 'core', 'data', 'idempotency', 'integration-adapter', 'ratelimit'],
  cli: ['auth', 'core', 'data'],
  contracts: [],
  core: [],
  data: ['core'],
  'feature-flags': [],
  flow: ['auth', 'backend', 'core', 'data', 'idempotency'],
  health: [],
  i18n: ['auth', 'contracts', 'core', 'data', 'idempotency'],
  idempotency: ['contracts', 'data'],
  'integration-adapter': [],
  jobs: ['core', 'data'],
  logging: ['core'],
  'mobile-runtime': [],
  notifications: ['core', 'data', 'i18n', 'integration-adapter', 'logging', 'preferences'],
  'offline-sync': ['auth', 'backend', 'core', 'data', 'idempotency'],
  outbox: ['core', 'data'],
  pdf: [],
  'pdf-a': ['logging'],
  'pdf-a-vera-docker': ['pdf-a'],
  preferences: ['core', 'data', 'idempotency'],
  privacy: ['auth', 'contracts', 'core', 'data', 'idempotency', 'storage'],
  ratelimit: ['auth', 'contracts', 'data'],
  sessions: ['core', 'data', 'idempotency'],
  signature: ['health', 'integration-adapter'],
  storage: ['core', 'data'],
  tenancy: ['contracts', 'core', 'data', 'idempotency'],
  testing: ['core', 'data', 'sessions'],
  worklist: ['core', 'data'],
  // packages-web/*
  angular: ['angular-tenancy', 'sdk'],
  'angular-audit': ['angular-auth', 'angular-i18n', 'angular-ui', 'sdk'],
  'angular-auth': ['angular', 'angular-i18n', 'sdk'],
  'angular-flow': ['angular-auth', 'angular-i18n', 'angular-storage', 'angular-ui'],
  'angular-i18n': [],
  'angular-iam': ['angular-auth', 'angular-i18n', 'angular-ui', 'sdk'],
  'angular-profile': [
    'angular',
    'angular-auth',
    'angular-i18n',
    'angular-storage',
    'angular-ui',
    'sdk',
  ],
  'angular-sessions': ['angular-auth', 'angular-i18n', 'angular-ui'],
  'angular-storage': ['angular', 'angular-i18n', 'angular-ui'],
  'angular-tenancy': ['angular-i18n'],
  'angular-trash': ['angular-auth', 'angular-i18n', 'angular-ui', 'sdk'],
  'angular-ui': ['angular', 'angular-i18n'],
  sdk: [],
  // tools/*
  'migration-linter': [],
  // reference/*
  'reference-api': [
    'audit',
    'auth',
    'backend',
    'core',
    'data',
    'flow',
    'health',
    'i18n',
    'idempotency',
    'logging',
    'offline-sync',
    'preferences',
    'privacy',
    'ratelimit',
    'sessions',
    'storage',
    'tenancy',
  ],
  'reference-web': [
    'angular',
    'angular-auth',
    'angular-flow',
    'angular-i18n',
    'angular-iam',
    'angular-profile',
    'angular-sessions',
    'angular-storage',
    'angular-tenancy',
    'angular-trash',
    'angular-ui',
    'sdk',
  ],
};

const elementDirectory = (type) => {
  if (type === 'migration-linter') return 'tools/migration-linter';
  if (type.startsWith('reference-')) return `reference/${type.slice('reference-'.length)}`;
  if (type === 'sdk' || type === 'angular' || type.startsWith('angular-')) {
    return `packages-web/${type}`;
  }
  return `packages/${type}`;
};

const boundaryElements = Object.keys(allowedDependencies).map((type) => ({
  type,
  pattern: `${elementDirectory(type)}/src/**`,
}));

const boundaryAllow = Object.entries(allowedDependencies)
  .filter(([, targets]) => targets.length > 0)
  .map(([type, targets]) => ({ from: { type }, allow: { to: { type: targets } } }));

// Package name -> directory, so a `@stynx-nyx/<name>` import resolves to its
// source element instead of `dist` (see import-resolver.mjs).
const workspacePackages = Object.fromEntries(
  Object.keys(allowedDependencies).map((type) => {
    const directory = join(workspaceRoot, elementDirectory(type));
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    return [manifest.name, directory];
  }),
);

export const stynxWorkspaceOptions = {
  strict: false,
  boundaries: {
    rootPath: workspaceRoot,
    elements: boundaryElements,
    allow: boundaryAllow,
    strict: true,
    workspacePackages,
  },
};
