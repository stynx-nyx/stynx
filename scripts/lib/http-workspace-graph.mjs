import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dependencyKinds = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const scripts = new Map([
  ['tsc -p tsconfig.json', 'tsconfig.json'],
  ['rm -rf dist && tsc -p tsconfig.json', 'tsconfig.json'],
  ['rm -rf dist && tsc -p tsconfig.build.json', 'tsconfig.build.json'],
  ['tsc -p tsconfig.json && pnpm run @stynx:emit-openapi', 'tsconfig.json'],
  [
    'node ../../scripts/verify-reference-api-build-inputs.mjs && tsc -p tsconfig.json',
    'tsconfig.json',
  ],
]);

function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_WORKSPACE_GRAPH_INVALID';
  throw error;
}

function local(root, path) {
  const value = relative(root, path);
  if (value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value))
    refuse('Workspace member escapes owned checkout');
  return value.split(sep).join('/');
}

function regularBytes(root, path) {
  local(root, path);
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path || !lstatSync(path).isFile())
    refuse('Workspace manifest/config must be an owned regular file');
  return readFileSync(path);
}

function expandPattern(root, pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0 || isAbsolute(pattern))
    refuse('Invalid workspace package pattern');
  const parts = pattern.split('/');
  if (
    parts.some(
      (part) =>
        !part || part === '.' || part === '..' || (part !== '*' && /[*?\[\]{}()!\\:]/u.test(part)),
    )
  )
    refuse('Unsupported workspace package pattern');
  let paths = [root];
  for (const part of parts) {
    const next = [];
    for (const parent of paths) {
      if (!existsSync(parent)) continue;
      if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory())
        refuse('Workspace directory is linked or not a directory');
      if (part === '*') {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === 'bower_components') continue;
          if (entry.isSymbolicLink()) refuse('Linked workspace pattern member');
          if (entry.isDirectory()) next.push(resolve(parent, entry.name));
        }
      } else next.push(resolve(parent, part));
    }
    paths = next;
  }
  return paths.filter((path) => existsSync(path));
}

/** Derive the real recursive reference build closure; no caller-selected rows. */
export function deriveHttpWorkspaceGraph(checkoutRoot) {
  const root = realpathSync(checkoutRoot);
  const rootManifest = JSON.parse(regularBytes(root, resolve(root, 'package.json')));
  if (rootManifest.packageManager !== 'pnpm@9.15.0')
    refuse('Unpinned HTTP workspace package manager');
  const workspaceBytes = regularBytes(root, resolve(root, 'pnpm-workspace.yaml'));
  const document = YAML.parseDocument(workspaceBytes.toString('utf8'), { uniqueKeys: true });
  if (document.errors.length) refuse('Invalid workspace YAML');
  const patterns = document.toJS()?.packages;
  if (!Array.isArray(patterns) || patterns.length === 0)
    refuse('Missing workspace package patterns');
  const byName = new Map();
  const byRoot = new Map();
  const foldedRoots = new Map();
  for (const pattern of patterns) {
    const directories = expandPattern(root, pattern);
    if (!pattern.includes('*') && directories.length !== 1)
      refuse('Required workspace root is missing');
    for (const directory of directories) {
      const manifestPath = resolve(directory, 'package.json');
      if (!existsSync(manifestPath)) {
        if (!pattern.endsWith('*')) refuse('Required workspace manifest is missing');
        continue;
      }
      const name = local(root, directory);
      if (byRoot.has(name)) continue;
      if (foldedRoots.has(name.toLowerCase())) refuse('Case-colliding workspace roots');
      foldedRoots.set(name.toLowerCase(), name);
      const bytes = regularBytes(root, manifestPath);
      const manifest = JSON.parse(bytes);
      if (
        typeof manifest.name !== 'string' ||
        manifest.name.length === 0 ||
        byName.has(manifest.name)
      )
        refuse('Missing or duplicate workspace package name');
      const member = { name: manifest.name, root: name, manifestSha256: digest(bytes), manifest };
      byName.set(member.name, member);
      byRoot.set(name, member);
    }
  }
  const entry = byName.get('@stynx-nyx/reference-api');
  if (!entry || entry.root !== 'reference/api') refuse('Missing actual reference API composition');
  const edges = (member) => {
    const found = new Set();
    for (const kind of dependencyKinds) {
      const dependencies = member.manifest[kind] ?? {};
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))
        refuse('Malformed workspace dependency declaration');
      for (const [name, version] of Object.entries(dependencies)) {
        if (typeof version !== 'string') refuse('Malformed workspace dependency version');
        if (
          !version.startsWith('workspace:') &&
          (/^[.]/u.test(version) ||
            /[\\/:]/u.test(version) ||
            /[.](?:tgz|tar.gz|tar)$/iu.test(version))
        )
          refuse('Unsupported selected dependency directory or alias specification');
        if (version.startsWith('workspace:') && !byName.has(name))
          refuse('Unresolved explicit workspace dependency');
        if (name.startsWith('@stynx-nyx/') && !byName.has(name))
          refuse('Unresolved STYNX workspace dependency');
        if (byName.has(name)) {
          if (version !== 'workspace:*')
            refuse('Unsupported local workspace alias, range or dependency precedence');
          found.add(name);
        }
      }
    }
    return [...found].sort();
  };
  const selected = [];
  const visited = new Set();
  const active = new Set();
  const visit = (name) => {
    if (active.has(name)) refuse('Cyclic HTTP workspace build graph');
    if (visited.has(name)) return;
    active.add(name);
    const member = byName.get(name);
    const dependencyNames = edges(member);
    for (const dependency of dependencyNames) visit(dependency);
    const buildScript = member.manifest.scripts?.build;
    const compilerConfig = scripts.get(buildScript);
    if (!compilerConfig) refuse('Unsupported selected workspace build script');
    if ('prebuild' in member.manifest.scripts || 'postbuild' in member.manifest.scripts)
      refuse('Unreviewed workspace build lifecycle hook');
    if (buildScript.includes('@stynx:emit-openapi') && member.root !== 'packages/core')
      refuse('OpenAPI build generator is confined to core');
    if (
      member.root === 'packages/core' &&
      buildScript !== 'tsc -p tsconfig.json && pnpm run @stynx:emit-openapi'
    )
      refuse('Core build omits its actual OpenAPI generator');
    const nestedScripts = {};
    if (member.root === 'packages/core') {
      const generator = member.manifest.scripts?.['@stynx:emit-openapi'];
      if (generator !== 'node ./scripts/emit-openapi.mjs')
        refuse('Core build changes its nested OpenAPI script');
      if (
        'pre@stynx:emit-openapi' in member.manifest.scripts ||
        'post@stynx:emit-openapi' in member.manifest.scripts
      )
        refuse('Unreviewed nested OpenAPI lifecycle hook');
      nestedScripts['@stynx:emit-openapi'] = generator;
      regularBytes(root, resolve(root, member.root, 'scripts/emit-openapi.mjs'));
    }
    if (
      buildScript.includes('verify-reference-api-build-inputs') &&
      member.root !== 'reference/api'
    )
      refuse('Reference verifier is confined to the real reference root');
    if (
      member.root === 'reference/api' &&
      buildScript !==
        'node ../../scripts/verify-reference-api-build-inputs.mjs && tsc -p tsconfig.json'
    )
      refuse('Reference build omits its real input verifier');
    regularBytes(root, resolve(root, member.root, compilerConfig));
    selected.push({
      name,
      root: member.root,
      manifestSha256: member.manifestSha256,
      dependencyNames,
      buildScript,
      nestedScripts,
      compilerConfig,
    });
    active.delete(name);
    visited.add(name);
  };
  visit(entry.name);
  return {
    schemaVersion: 1,
    workspaceConfigSha256: digest(workspaceBytes),
    workspaces: [...byName.values()]
      .map(({ name, root: path, manifestSha256 }) => ({ name, root: path, manifestSha256 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    selected,
    topologicalScriptOrder: selected.map((member) => member.name),
    readinessPromoting: false,
  };
}

/** Compare independently obtained actual pnpm selector output to this graph. */
export function reconcileHttpWorkspaceSelector(checkoutRoot, selectorOutput) {
  const root = realpathSync(checkoutRoot);
  const graph = deriveHttpWorkspaceGraph(root);
  if (typeof selectorOutput !== 'string' || selectorOutput.length > 16 * 1024 * 1024)
    refuse('Actual pnpm selector must be bounded primitive JSON text');
  const rows = JSON.parse(selectorOutput);
  if (!Array.isArray(rows)) refuse('Actual pnpm selector is not an array');
  const selected = new Map(graph.selected.map((member) => [member.name, member]));
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !Object.hasOwn(row, 'name') ||
      !Object.hasOwn(row, 'path') ||
      typeof row.name !== 'string' ||
      typeof row.path !== 'string' ||
      !isAbsolute(row.path) ||
      seen.has(row.name)
    )
      refuse('Malformed or duplicate actual pnpm selector row');
    const member = selected.get(row.name);
    if (!member || row.path !== resolve(root, member.root) || realpathSync(row.path) !== row.path)
      refuse('Actual pnpm selector differs from the full manifest closure');
    seen.add(row.name);
  }
  if (seen.size !== selected.size) refuse('Actual pnpm selector omits a workspace build member');
  return graph;
}
