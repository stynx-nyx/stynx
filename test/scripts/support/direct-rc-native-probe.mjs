// Executes actual script text with all effect imports intercepted. No RC, signing,
// key reads, network, or child programs are executed; process/env are synthetic.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { createHash } from 'node:crypto';
import { unwrapDevaiCheckReport } from '../../../scripts/lib/devai-local-rc.mjs';
import { canonicalize } from '../../../scripts/lib/mutation-roster.mjs';
const [file, scenario] = process.argv.slice(2),
  source = readFileSync(file, 'utf8');
const root = '/synthetic/stynx',
  candidate = 'a'.repeat(40),
  tree = 'b'.repeat(40);
const trace = [],
  stdout = [],
  stderr = [];
const result = { scenario, trace, stdout, stderr, actualEffects: [] };
const finish = (code) => {
  result.exit = code;
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
};
const env = {
  DEVAI_RC_TOOLCHAIN: '/synthetic-controls/toolchain.json',
  DEVAI_RC_ENVIRONMENT: '/synthetic-controls/environment.json',
  DEVAI_RC_PRIVATE_KEY: '/synthetic-controls/never-read-private',
  DEVAI_RC_PUBLIC_KEY: '/synthetic-controls/never-read-public',
  DEVAI_RC_EVIDENCE_DIR: '/synthetic-evidence',
  STYNX_TEST_PG_HOST: 'synthetic',
  STYNX_TEST_PG_PORT: '0',
  STYNX_TEST_PG_USER: 'synthetic',
  STYNX_TEST_PG_TEMPLATE: 'synthetic',
};
let descriptor = {
  tasks: [{ nodeId: 'a', dependencies: [], toolchainKeys: ['node'], allowlistedEnv: [] }],
  profiles: [{ profileId: 'rc', requiredNodes: ['a'] }],
};
let receipt = { path: 'receipt.json', digest: 'digest' };
if (scenario === 'digest-number') receipt.digest = 7;
if (scenario === 'path-number') receipt.path = 7;
if (scenario === 'missing-receipt') receipt = {};
if (scenario === 'task-map-null') descriptor.tasks = null;
if (scenario === 'required-string') {
  descriptor = {
    tasks: [
      { nodeId: 'a', dependencies: 'b', toolchainKeys: 'node', allowlistedEnv: 'ABSENT' },
      { nodeId: 'b', dependencies: [], toolchainKeys: [], allowlistedEnv: [] },
    ],
    profiles: [{ profileId: 'rc', requiredNodes: 'a' }],
  };
}
if (scenario === 'unknown-task') descriptor.profiles[0].requiredNodes = ['missing'];
if (scenario === 'toolchain-env-scalars') {
  descriptor.tasks[0].toolchainKeys = 7;
  descriptor.tasks[0].allowlistedEnv = 7;
}
if (scenario === 'required-number') descriptor.profiles[0].requiredNodes = 7;
if (scenario === 'dependency-number') descriptor.tasks[0].dependencies = 7;
if (scenario === 'dependency-null') descriptor.tasks[0].dependencies = null;
if (scenario === 'dependency-missing') delete descriptor.tasks[0].dependencies;
const isControls = [
  'controls',
  'required-string',
  'task-map-null',
  'unknown-task',
  'toolchain-env-scalars',
  'required-number',
  'dependency-number',
  'dependency-null',
  'dependency-missing',
].includes(scenario);
const argv = [
  'node',
  '/synthetic/stynx/scripts/devai-local-rc.mjs',
  isControls ? 'controls' : 'prepare',
  ...(isControls ? ['--output-dir', '/synthetic-controls-output'] : ['--candidate', candidate]),
];
const files = {
  [root + '/law/policy/devai-package-identity.json']: {
    package: 'synthetic-devai',
    version: '0.0.0',
  },
  [root + '/node_modules/@aarusso-nyx/devai/package.json']: {
    name: 'synthetic-devai',
    version: '0.0.0',
  },
  [root + '/test-tasks.json']: descriptor,
  '/synthetic-controls/toolchain.json': { node: process.version },
  '/synthetic-controls/environment.json': {},
  [root + '/law/policy/devai-local-rc-toolchain.json']: { node: process.version },
  [root + '/law/policy/devai-local-rc-environment.json']: {},
};
const fakeProcess = {
  argv,
  env,
  version: process.version,
  execPath: process.execPath,
  stdout: {
    write(value) {
      stdout.push(value);
    },
  },
  stderr: {
    write(value) {
      stderr.push(value);
    },
  },
  exit: finish,
};
const fs = {
  existsSync(value) {
    trace.push({ op: 'exists', path: value });
    return true;
  },
  realpathSync(value) {
    trace.push({ op: 'realpath', path: value });
    return value;
  },
  readFileSync(value, encoding) {
    trace.push({ op: 'read', path: value, encoding });
    if (!Object.hasOwn(files, value)) throw new Error('Unexpected synthetic read ' + value);
    return JSON.stringify(files[value]);
  },
  mkdirSync(value, options) {
    trace.push({ op: 'mkdir', path: value, options });
  },
  writeFileSync(value, body, options) {
    trace.push({ op: 'write', path: value, body, options });
  },
};
const child = {
  spawnSync(command, args, options) {
    trace.push({ op: 'spawn', command, args, options, envIdentity: options.env === env });
    let text = '';
    if (command === 'git') {
      const action = args.slice(2).join(' ');
      text =
        action === 'rev-parse HEAD'
          ? candidate
          : action === 'rev-parse HEAD^{tree}'
            ? tree
            : action === 'status --porcelain'
              ? ''
              : undefined;
    } else if (command === 'pnpm') text = args[0] === '--version' ? '9.15.0' : 'mock playwright';
    else if (command === 'pg_isready') text = 'mock ready';
    else if (command.endsWith('/.bin/devai')) text = JSON.stringify({ receipt });
    else if (command === process.execPath && args[0].endsWith('/export-cli.js'))
      text = JSON.stringify({ taskPolicyDigest: 'synthetic-policy' });
    else throw new Error('Unexpected synthetic child ' + command);
    if (text === undefined) throw new Error('Unexpected synthetic args ' + args);
    return { status: 0, signal: null, stdout: text, stderr: '' };
  },
};
const nativePath = {
  ...path,
  join(...args) {
    try {
      return path.join(...args);
    } catch (error) {
      trace.push({ op: 'join-error', args, name: error.name, code: error.code });
      throw error;
    }
  },
  resolve(...args) {
    try {
      return path.resolve(...args);
    } catch (error) {
      trace.push({ op: 'resolve-error', args, name: error.name, code: error.code });
      throw error;
    }
  },
};
const deps = {
  'node:child_process': child,
  'node:crypto': { createHash },
  'node:fs': fs,
  'node:path': nativePath,
  'node:url': url,
  './lib/devai-local-rc.mjs': { unwrapDevaiCheckReport },
  './lib/mutation-roster.mjs': { canonicalize },
};
const context = vm.createContext({
  process: fakeProcess,
  console: {
    log() {
      throw new Error('Unexpected console');
    },
  },
});
// Preserve the script's same-realm Error classification across intercepted native-module errors.
const RealmError = vm.runInContext('Error', context);
context.Error = class extends RealmError {
  static [Symbol.hasInstance](value) {
    return value instanceof RealmError || value instanceof Error;
  }
};
const module = new vm.SourceTextModule(source, {
  context,
  identifier: 'file:///synthetic/stynx/scripts/devai-local-rc.mjs',
  initializeImportMeta(meta) {
    meta.url = 'file:///synthetic/stynx/scripts/devai-local-rc.mjs';
  },
});
await module.link((specifier) => {
  if (!Object.hasOwn(deps, specifier)) throw new Error('Unexpected import ' + specifier);
  const exports = deps[specifier];
  return new vm.SyntheticModule(
    Object.keys(exports),
    function () {
      for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
    },
    { context },
  );
});
await module.evaluate();
finish(0);
