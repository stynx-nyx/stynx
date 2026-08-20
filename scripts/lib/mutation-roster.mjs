import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export const MUTANT_STATUSES = [
  'CompileError',
  'Ignored',
  'Killed',
  'NoCoverage',
  'Pending',
  'RuntimeError',
  'Survived',
  'Timeout',
];

const CONFIG_PATTERN = /^stryker\.(?:conf|config)\.(?:cjs|js|json|mjs|ts)$/u;
const PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
const REMOTE_UNSAFE_PATTERN =
  /\btest:mutation\b|run-mutation-evidence\.mjs|(?:^|[;&|]\s*|\n\s*)(?:pnpm\s+(?:exec\s+)?|npx\s+)?stryker(?:\s|$)/u;
const PACKAGE_MANAGER_BUILTINS = new Set([
  'add',
  'audit',
  'config',
  'deploy',
  'dlx',
  'env',
  'exec',
  'fetch',
  'install',
  'list',
  'pack',
  'publish',
  'remove',
  'setup',
  'store',
  'update',
  'version',
  'why',
]);

class RemoteMutationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RemoteMutationError';
    this.code = code;
  }
}

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveMutationThresholds(policy, packageName, literalOverride) {
  if (literalOverride !== undefined) {
    return {
      break: literalOverride,
      high: literalOverride,
      low: Math.max(60, literalOverride - 10),
    };
  }
  const override = policy.perPackage?.[packageName]?.mutation;
  if (typeof override === 'number') {
    return { break: override, high: override, low: Math.max(60, override - 10) };
  }
  const policyName = override ?? policy.defaults?.mutation ?? 'default';
  const selected = policy.policies?.mutation?.[policyName];
  if (typeof selected === 'number') {
    return { break: selected, high: selected, low: Math.max(60, selected - 10) };
  }
  if (selected && typeof selected === 'object' && typeof selected.break === 'number') {
    return {
      break: selected.break,
      high: typeof selected.high === 'number' ? selected.high : selected.break,
      low: typeof selected.low === 'number' ? selected.low : Math.max(60, selected.break - 10),
    };
  }
  throw new Error(`unknown mutation policy ${String(policyName)} for ${packageName}`);
}

export function discoverMutationRoster(repoRoot) {
  const workspaceRoots = ['packages', 'packages-web'];
  const failures = [];
  const roster = [];
  const policyPath = resolve(repoRoot, 'tools/repo-config/test-policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));

  for (const workspaceRoot of workspaceRoots) {
    const absoluteRoot = resolve(repoRoot, workspaceRoot);
    if (!existsSync(absoluteRoot)) {
      failures.push(`${workspaceRoot}: workspace root is missing`);
      continue;
    }
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = resolve(absoluteRoot, entry.name);
      const manifestPath = resolve(packageDir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const configFiles = readdirSync(packageDir).filter((file) => CONFIG_PATTERN.test(file));
      const strykerScript = manifest.scripts?.stryker;
      if (configFiles.length > 1) {
        failures.push(
          `${relative(repoRoot, packageDir)}: multiple Stryker configs (${configFiles.join(', ')})`,
        );
      }
      if (configFiles.length > 0 && typeof strykerScript !== 'string') {
        failures.push(`${manifest.name}: Stryker config exists but scripts.stryker is missing`);
      }
      if (typeof strykerScript === 'string' && configFiles.length === 0) {
        failures.push(`${manifest.name}: scripts.stryker exists but no Stryker config was found`);
      }
      if (configFiles.length !== 1 || typeof strykerScript !== 'string') continue;
      if (!PACKAGE_NAME.test(manifest.name ?? '')) {
        failures.push(`${relative(repoRoot, packageDir)}: invalid package name`);
        continue;
      }
      const configPath = resolve(packageDir, configFiles[0]);
      const literalMatches = [
        ...readFileSync(configPath, 'utf8').matchAll(/\bthreshold\s*:\s*(\d+(?:\.\d+)?)/gu),
      ];
      if (literalMatches.length > 1) {
        failures.push(`${manifest.name}: multiple literal mutation threshold overrides`);
      }
      const literalThreshold =
        literalMatches[0]?.[1] === undefined ? undefined : Number(literalMatches[0][1]);
      const workspace = relative(repoRoot, packageDir).split('\\').join('/');
      const mutationNa = (policy.notApplicable ?? []).some(
        (declaration) =>
          declaration.packagePattern === manifest.name && declaration.levels?.includes('Mutation'),
      );
      if (mutationNa) failures.push(`${manifest.name}: executable mutation suite is declared N/A`);
      roster.push({
        packageName: manifest.name,
        workspace,
        config: relative(repoRoot, configPath).split('\\').join('/'),
        script: strykerScript,
        thresholds: resolveMutationThresholds(policy, manifest.name, literalThreshold),
      });
    }
  }
  roster.sort((left, right) => left.packageName.localeCompare(right.packageName));
  if (new Set(roster.map((entry) => entry.packageName)).size !== roster.length) {
    failures.push('mutation roster contains duplicate package names');
  }
  return { roster, failures };
}

function manifestCatalog(repoRoot) {
  const manifests = [];
  const seen = new Set();

  function addManifest(path) {
    const absolute = resolve(path);
    if (seen.has(absolute) || !existsSync(absolute)) return;
    seen.add(absolute);
    const value = JSON.parse(readFileSync(absolute, 'utf8'));
    manifests.push({ path: absolute, directory: dirname(absolute), scripts: value.scripts ?? {} });
  }

  function visitDirectory(path, depth) {
    if (!existsSync(path) || depth > 5) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const entryPath = resolve(path, entry.name);
      if (entry.isDirectory()) visitDirectory(entryPath, depth + 1);
      else if (entry.isFile() && entry.name === 'package.json') addManifest(entryPath);
    }
  }

  addManifest(resolve(repoRoot, 'package.json'));
  for (const root of ['packages', 'packages-web', 'reference', 'domain', 'tools', 'test', 'docs']) {
    visitDirectory(resolve(repoRoot, root), 0);
  }
  return manifests;
}

function shellTokens(value) {
  return [...value.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

function packageManagerInvocations(text) {
  const invocations = [];
  for (const match of text.matchAll(/\b(?:corepack\s+)?pnpm(?=\s)([^\n;&|]*)/gu)) {
    const tokens = shellTokens(match[1] ?? '');
    let filtered = false;
    let directory;
    let index = 0;
    while (index < tokens.length && tokens[index].startsWith('-')) {
      const flag = tokens[index];
      if (flag === '--filter' || flag === '-F') {
        filtered = true;
        index += 2;
      } else if (flag === '--dir' || flag === '-C') {
        directory = tokens[index + 1];
        index += 2;
      } else {
        index += 1;
      }
    }
    if (tokens[index] === 'run') index += 1;
    const script = tokens[index]?.replace(/^[`(]+|[`),]+$/gu, '');
    if (!script || PACKAGE_MANAGER_BUILTINS.has(script) || script.startsWith('-')) continue;
    invocations.push({ script, filtered, directory });
  }
  for (const match of text.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/gu)) {
    invocations.push({ script: match[1], filtered: false, directory: undefined });
  }
  for (const match of text.matchAll(/\byarn\s+(?:run\s+)?([A-Za-z0-9:_-]+)/gu)) {
    if (!PACKAGE_MANAGER_BUILTINS.has(match[1])) {
      invocations.push({ script: match[1], filtered: false, directory: undefined });
    }
  }
  for (const match of text.matchAll(/\b(?:npx\s+)?turbo\s+run\s+([A-Za-z0-9:_-]+)/gu)) {
    invocations.push({ script: match[1], filtered: true, directory: undefined });
  }
  return invocations;
}

function repositoryScriptFiles(text, currentDirectory, repoRoot) {
  const paths = [];
  for (const match of text.matchAll(
    /\b(?:node|bash|sh)\s+(?:--[A-Za-z0-9-]+\s+)*((?:\.\.\/|\.\/)?(?:scripts|tools)\/[A-Za-z0-9_./-]+\.(?:c?js|mjs|ts|sh))/gu,
  )) {
    const absolute = resolve(currentDirectory, match[1]);
    const escaped = relative(repoRoot, absolute);
    if (escaped.startsWith('..') || !existsSync(absolute)) continue;
    paths.push(absolute);
  }
  return paths;
}

export function verifyNoRemoteMutationWorkflows(repoRoot) {
  const workflowsDirectory = resolve(repoRoot, '.github/workflows');
  const workflowNames = existsSync(workflowsDirectory)
    ? readdirSync(workflowsDirectory)
        .filter((name) => /\.ya?ml$/u.test(name))
        .sort()
    : [];
  const manifests = manifestCatalog(repoRoot);
  const rootManifest = manifests.find((entry) => entry.path === resolve(repoRoot, 'package.json'));
  if (!rootManifest) {
    throw new RemoteMutationError(
      'REMOTE_SCRIPT_UNRESOLVED',
      'remote mutation guard could not load the root package manifest',
    );
  }
  const visited = new Set();
  const reachableScripts = new Set();

  function inspectText(text, source, scope, followPackageManagers = true) {
    if (REMOTE_UNSAFE_PATTERN.test(text)) {
      throw new RemoteMutationError(
        'REMOTE_LOCAL_ONLY_NODE',
        `${source} reaches the local-only mutation node`,
      );
    }
    for (const invocation of followPackageManagers ? packageManagerInvocations(text) : []) {
      let candidates;
      if (invocation.directory) {
        const target = resolve(scope.directory, invocation.directory, 'package.json');
        candidates = manifests.filter((entry) => entry.path === target);
      } else if (invocation.filtered) {
        candidates = manifests.filter(
          (entry) => typeof entry.scripts[invocation.script] === 'string',
        );
      } else {
        candidates = [scope].filter(
          (entry) => typeof entry.scripts[invocation.script] === 'string',
        );
      }
      if (candidates.length === 0) {
        throw new RemoteMutationError(
          'REMOTE_SCRIPT_UNRESOLVED',
          `${source} invokes unresolved package script ${invocation.script}`,
        );
      }
      for (const manifest of candidates) {
        const key = `${manifest.path}:${invocation.script}`;
        if (visited.has(key)) continue;
        visited.add(key);
        reachableScripts.add(`${relative(repoRoot, manifest.path)}#${invocation.script}`);
        inspectText(manifest.scripts[invocation.script], key, manifest);
      }
    }
    for (const path of repositoryScriptFiles(text, scope.directory, repoRoot)) {
      const key = `file:${path}`;
      if (visited.has(key)) continue;
      visited.add(key);
      inspectText(
        readFileSync(path, 'utf8'),
        relative(repoRoot, path),
        rootManifest,
        /\.(?:sh)$/u.test(path),
      );
    }
  }

  for (const workflowName of workflowNames) {
    const path = resolve(workflowsDirectory, workflowName);
    inspectText(readFileSync(path, 'utf8'), `.github/workflows/${workflowName}`, rootManifest);
  }

  return {
    workflowCount: workflowNames.length,
    reachableScripts: [...reachableScripts].sort(),
  };
}
