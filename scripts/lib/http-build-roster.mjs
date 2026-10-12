import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { deriveHttpWorkspaceGraph } from './http-workspace-graph.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshots = new WeakMap();

function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_BUILD_ROSTER_INVALID';
  throw error;
}

function local(root, path) {
  const name = relative(root, path);
  if (name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name))
    refuse('Build member escapes the owned checkout');
  return name.split(sep).join('/');
}

function regularFile(root, path) {
  local(root, path);
  if (!lstatSync(path).isFile() || realpathSync(path) !== path)
    refuse('Build input must be an unlinked owned regular file');
  return readFileSync(path);
}

function git(root, args) {
  // This read-only helper never invokes a shell, repository hooks, configured
  // filters, credential helpers, or caller Git overrides. The lifecycle owner
  // must additionally bind this fixed executable in its toolchain receipt.
  return execFileSync(
    '/usr/bin/git',
    [
      '--no-pager',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      root,
      ...args,
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        HOME: root,
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_NO_LAZY_FETCH: '1',
      },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function nulRecords(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    refuse('Non-UTF-8 Git path is unsupported');
  }
  if (!text.endsWith('\0')) refuse('Incomplete Git roster');
  return text.slice(0, -1).split('\0');
}

function portablePath(name) {
  if (
    !name ||
    isAbsolute(name) ||
    name.includes('\\') ||
    name.split('/').some((part) => !part || part === '.' || part === '..')
  )
    refuse('Unsupported Git path');
  return name;
}

function checkedRoot(checkoutRoot) {
  if (typeof checkoutRoot !== 'string' || !isAbsolute(checkoutRoot))
    refuse('Build checkout root must be absolute');
  const root = realpathSync(checkoutRoot);
  if (!lstatSync(root).isDirectory()) refuse('Build checkout is not a directory');
  return root;
}

function freezeReport(report) {
  const fingerprint = createHash('sha256');
  const add = (key, value) => {
    const typed = `${typeof value}:${String(value)}`;
    fingerprint.update(`${Buffer.byteLength(key)}:${key}${Buffer.byteLength(typed)}:${typed}`);
  };
  for (const key of Object.keys(report)
    .filter((key) => key !== 'files')
    .sort())
    add(key, report[key]);
  add('files.length', report.files.length);
  for (const row of report.files) {
    add('row.fields', Object.keys(row).length);
    for (const key of Object.keys(row).sort()) add(key, row[key]);
  }
  for (const row of report.files) Object.freeze(row);
  Object.freeze(report.files);
  Object.freeze(report);
  snapshots.set(report, fingerprint.digest('hex'));
  return report;
}

/**
 * Independently bind the actual index and checkout bytes to an immutable Git
 * object. This is an input snapshot, never a successful-build receipt.
 */
export function snapshotHttpTrackedInputs(checkoutRoot, candidateCommit) {
  const root = checkedRoot(checkoutRoot);
  if (typeof candidateCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(candidateCommit))
    refuse('Build candidate must be a full immutable SHA');
  const head = git(root, ['rev-parse', '--verify', 'HEAD']).toString('ascii').trim();
  if (head !== candidateCommit) refuse('Build candidate changed');
  const tree = git(root, ['rev-parse', '--verify', `${candidateCommit}^{tree}`])
    .toString('ascii')
    .trim();
  if (!/^[a-f0-9]{40}$/u.test(tree)) refuse('Invalid build candidate tree');
  const expected = new Map();
  const folded = new Set();
  for (const record of nulRecords(
    git(root, ['ls-tree', '-r', '-z', '--full-tree', candidateCommit]),
  )) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/u.exec(record);
    if (!match) refuse('Unsupported tracked mode, submodule, or symlink');
    const [, mode, blob, rawName] = match;
    const name = portablePath(rawName);
    if (expected.has(name) || folded.has(name.toLowerCase()))
      refuse('Duplicate or case-colliding tracked input');
    folded.add(name.toLowerCase());
    expected.set(name, { path: name, mode, blob });
  }
  if (expected.size === 0) refuse('Empty build candidate');
  const index = new Map();
  for (const record of nulRecords(git(root, ['ls-files', '--stage', '-z']))) {
    const match = /^(100644|100755) ([a-f0-9]{40}) 0\t([\s\S]+)$/u.exec(record);
    if (!match) refuse('Unmerged or unsupported build index');
    const [, mode, blob, rawName] = match;
    const name = portablePath(rawName);
    if (index.has(name)) refuse('Duplicate build index input');
    index.set(name, { mode, blob });
  }
  if (index.size !== expected.size) refuse('Build index roster changed');
  const files = [];
  for (const row of [...expected.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    const entry = index.get(row.path);
    if (!entry || entry.mode !== row.mode || entry.blob !== row.blob)
      refuse('Build index does not match the candidate');
    const path = resolve(root, row.path);
    const bytes = regularFile(root, path);
    const permissions = lstatSync(path).mode & 0o7777;
    const executable = Boolean(permissions & 0o100);
    if (executable !== (row.mode === '100755')) refuse('Tracked executable mode changed');
    const actualBlob = createHash('sha1')
      .update(Buffer.from(`blob ${bytes.length}\0`))
      .update(bytes)
      .digest('hex');
    if (actualBlob !== row.blob) refuse('Tracked checkout bytes differ from the candidate');
    files.push({ ...row, permissions, sha256: sha256(bytes), byteLength: bytes.length });
  }
  return freezeReport({ schemaVersion: 1, candidateCommit, tree, files });
}

/**
 * Bind the complete physical private installation, including data, launchers,
 * empty directories and link targets. Workspace links are recorded, not
 * followed into source or treated as emitted modules. External links refuse.
 */
export function snapshotHttpDependencyBytes(checkoutRoot) {
  const root = checkedRoot(checkoutRoot);
  const candidateCommit = git(root, ['rev-parse', '--verify', 'HEAD']).toString('ascii').trim();
  const tracked = snapshotHttpTrackedInputs(root, candidateCommit);
  const trackedFiles = new Map(tracked.files.map((row) => [row.path, row]));
  const workspaceRoots = new Map(
    deriveHttpWorkspaceGraph(root).workspaces.map((member) => [member.root, member]),
  );
  for (const workspace of workspaceRoots.values()) {
    const manifest = trackedFiles.get(`${workspace.root}/package.json`);
    if (!manifest || manifest.sha256 !== workspace.manifestSha256)
      refuse('Dependency workspace manifest is not a candidate-bound input');
  }
  const installation = resolve(root, 'node_modules');
  if (!lstatSync(installation).isDirectory() || realpathSync(installation) !== installation)
    refuse('Private dependency installation must be an owned unlinked directory');
  const files = [];
  const folded = new Set();
  const visit = (path) => {
    const name = local(root, path);
    if (folded.has(name.toLowerCase())) refuse('Case-colliding private dependency member');
    folded.add(name.toLowerCase());
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path);
      const canonical = realpathSync(path);
      const targetPath = local(root, canonical);
      if (!targetPath || isAbsolute(target))
        refuse('Dependency link must have an owned relative target');
      files.push({
        path: name,
        kind: 'link',
        permissions: stat.mode & 0o7777,
        target,
        canonicalTarget: targetPath,
      });
      return;
    }
    if (realpathSync(path) !== path) refuse('Dependency member has a linked ancestor');
    if (stat.isDirectory()) {
      files.push({ path: name, kind: 'directory', permissions: stat.mode & 0o7777 });
      for (const entry of readdirSync(path).sort()) visit(resolve(path, entry));
      return;
    }
    if (!stat.isFile()) refuse('Unsupported private dependency file kind');
    const bytes = readFileSync(path);
    files.push({
      path: name,
      kind: 'file',
      permissions: stat.mode & 0o7777,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    });
  };
  const discover = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      if (entry.name === '.git') continue;
      const path = resolve(directory, entry.name);
      if (entry.name === 'node_modules') {
        if (!entry.isDirectory() || entry.isSymbolicLink())
          refuse('Workspace dependency installation must be an unlinked directory');
        visit(path);
      } else if (entry.isDirectory()) discover(path);
    }
  };
  discover(root);
  const physical = new Map(
    files.filter((row) => row.kind !== 'link').map((row) => [row.path, row]),
  );
  for (const row of files) {
    if (row.kind !== 'link') continue;
    if (physical.has(row.canonicalTarget)) continue;
    const workspace = workspaceRoots.get(row.canonicalTarget);
    if (!workspace)
      refuse('Dependency target is neither a bound installation member nor workspace');
    row.kind = 'workspace-link';
    row.workspaceName = workspace.name;
    row.manifestSha256 = workspace.manifestSha256;
  }
  // Workspace inputs and emitted outputs must additionally be verified by the
  // lifecycle owner. These explicit links are never dependency file rows and
  // cannot themselves authorize source fallback or module evaluation.
  return freezeReport({
    schemaVersion: 1,
    candidateCommit,
    tree: tracked.tree,
    workspaceLinksRequireOutputCustody: true,
    files,
  });
}

/** Compare only snapshots produced and held privately by the lifecycle owner. */
export function assertHttpBuildRosterUnchanged(before, after) {
  if (!snapshots.has(before) || !snapshots.has(after))
    refuse('Roster comparison requires privately held actual snapshots');
  // These helpers do not construct build handles, import modules, record
  // evidence, or qualify a build. Serialized reports cannot become snapshots.
  if (snapshots.get(before) !== snapshots.get(after)) refuse('Build byte roster changed');
}
