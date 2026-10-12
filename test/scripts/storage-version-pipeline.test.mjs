import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { normalizePublicApiDeclaration } from '../../scripts/verify-public-api-declaration.mjs';
import { classifyReleaseContext, ReleaseContextError } from '../../scripts/lib/release-context.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const templates = [
  { directory: 'offline-sync', exportName: 'OFFLINE_STORAGE_TEMPLATE' },
  { directory: 'outbox', exportName: 'OUTBOX_STORAGE_TEMPLATE' },
];
const templatePath = (directory) => `packages/${directory}/src/storage-template.generated.ts`;
const baseCommit = 'a'.repeat(40);
const headCommit = 'b'.repeat(40);

function put(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}
function copy(root, path) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  cpSync(join(repoRoot, path), join(root, path), { recursive: true });
}
function run(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
function packageVersion(body, version) {
  const matches = [...body.toString('utf8').matchAll(/^ {2}packageVersion: '([^'\r\n]+)',$/gmu)];
  assert.equal(matches.length, 1);
  if (version === undefined) return matches[0][1];
  return Buffer.from(
    body.toString('utf8').replace(matches[0][0], `  packageVersion: '${version}',`),
  );
}
function emittedDeclaration(bytes) {
  const result = ts.transpileDeclaration(bytes.toString('utf8'), {
    fileName: 'storage-template.generated.ts',
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext },
  });
  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}
function declarationHash(directory, version, source) {
  return createHash('sha256')
    .update(
      normalizePublicApiDeclaration({
        packageName: `@stynx-nyx/${directory}`,
        declarationPath: `${directory}/src/storage-template.generated.d.ts`,
        packageVersion: version,
        source,
      }),
    )
    .digest('hex');
}
function artifacts() {
  return templates.map(({ directory }) => {
    const path = templatePath(directory);
    const before = packageVersion(readFileSync(join(repoRoot, path)), '1.5.7');
    return {
      path,
      before,
      after: packageVersion(before, '1.6.0'),
      baseVersion: '1.5.7',
      version: '1.6.0',
    };
  });
}
function context() {
  return {
    baseCommit,
    headCommit,
    commits: [{ sha: headCommit, subject: 'ci: version packages' }],
    versionParent: baseCommit,
    versionChanges: [
      { status: 'D', path: '.changeset/storage-version.md' },
      ...templates.flatMap(({ directory }) => [
        { status: 'M', path: `packages/${directory}/package.json` },
        { status: 'M', path: `packages/${directory}/CHANGELOG.md` },
        { status: 'M', path: templatePath(directory) },
      ]),
    ],
    followUpChanges: [],
    storageVersionArtifacts: artifacts(),
  };
}
function refuses(value, code = 'RELEASE_CONTEXT_STORAGE_VERSION') {
  assert.throws(
    () => classifyReleaseContext(value),
    (error) => error instanceof ReleaseContextError && error.code === code,
  );
}

// This fixture executes the real Changesets CLI, canonical wrapper, both real
// generators and the real SBOM writer. Its two-package fixed group is a small
// supported workspace; it does not claim 44-package release qualification.
test('canonical version pipeline updates both generated storage versions and preserves SQL, catalogs and source digests', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stynx storage version ação-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    'scripts/version-packages.mjs',
    'scripts/lib/fixed-group-version.mjs',
    'scripts/lib/release-version-policy.mjs',
    'scripts/lib/publishable-packages.mjs',
    'scripts/lib/private-workspace-version.mjs',
    'scripts/offline-storage-generate.mjs',
    'scripts/outbox-storage-generate.mjs',
    'scripts/generate-sbom.mjs',
    'tools/migration-linter/src/sql.ts',
    'tools/image-size-safe',
    'packages/offline-sync/migrations',
    'packages/data/migrations/platform',
    'pnpm-lock.yaml',
  ])
    copy(root, path);
  mkdirSync(join(root, 'packages-web'));
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  const packageNames = templates.map(({ directory }) => `@stynx-nyx/${directory}`);
  const manifest = (value) => `${JSON.stringify(value, null, 2)}\n`;
  put(
    root,
    'package.json',
    manifest({
      name: 'storage-version-fixture',
      private: true,
      version: '1.5.7',
      packageManager: 'pnpm@9.15.0',
      scripts: { 'security:sbom': 'node scripts/generate-sbom.mjs --write' },
    }),
  );
  put(
    root,
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'packages-web/*'\n  - 'tools/image-size-safe'\n",
  );
  const changesetConfig = JSON.parse(
    readFileSync(join(repoRoot, '.changeset/config.json'), 'utf8'),
  );
  changesetConfig.fixed = [packageNames];
  put(root, '.changeset/config.json', manifest(changesetConfig));
  put(
    root,
    '.changeset/storage-version.md',
    '---\n"@stynx-nyx/offline-sync": minor\n---\n\nExercise canonical storage version synchronization.\n',
  );
  put(
    root,
    'tools/create-stynx-app/template/package.json',
    manifest({ private: true, dependencies: { '@stynx-nyx/offline-sync': '^1.5.7' } }),
  );
  for (const { directory } of templates) {
    put(
      root,
      `packages/${directory}/package.json`,
      manifest({
        name: `@stynx-nyx/${directory}`,
        version: '1.5.7',
        type: 'module',
        license: 'MIT',
      }),
    );
    put(root, `packages/${directory}/CHANGELOG.md`, '# Prior release\n');
    copy(root, `packages/${directory}/src/storage-catalog.generated.ts`);
    put(root, templatePath(directory), readFileSync(join(repoRoot, templatePath(directory))));
  }
  // Compile the genuine local fork used by the actual SBOM safety checks.
  run(root, [
    join(repoRoot, 'node_modules/.pnpm/node_modules/esbuild/bin/esbuild'),
    ...['heif', 'icns', 'jxl'].map((name) => `tools/image-size-safe/lib/types/${name}.ts`),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--outdir=tools/image-size-safe/dist/types',
    '--out-extension:.js=.mjs',
  ]);
  const before = new Map();
  const catalogs = new Map();
  const declarationHashes = new Map();
  for (const { directory } of templates) {
    run(root, [
      `scripts/${directory === 'offline-sync' ? 'offline' : 'outbox'}-storage-generate.mjs`,
      '--write',
    ]);
    const path = templatePath(directory);
    before.set(path, readFileSync(join(root, path)));
    assert.equal(packageVersion(before.get(path)), '1.5.7');
    declarationHashes.set(
      path,
      declarationHash(directory, '1.5.7', emittedDeclaration(before.get(path))),
    );
    const catalog = `packages/${directory}/src/storage-catalog.generated.ts`;
    catalogs.set(catalog, readFileSync(join(root, catalog)));
  }
  const privateManifest = readFileSync(join(root, 'tools/image-size-safe/package.json'));
  const result = run(root, ['scripts/version-packages.mjs']);
  assert.match(result.stdout, /1\.5\.7 -> 1\.6\.0/u);
  assert.match(result.stdout, /synchronized root and 2 public packages at 1\.6\.0/u);
  assert.match(result.stdout, /\[sbom\] wrote/u);
  assert.deepEqual(readFileSync(join(root, 'tools/image-size-safe/package.json')), privateManifest);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.6.0');
  for (const { directory, exportName } of templates) {
    const path = templatePath(directory);
    const after = readFileSync(join(root, path));
    assert.equal(
      JSON.parse(readFileSync(join(root, `packages/${directory}/package.json`), 'utf8')).version,
      '1.6.0',
    );
    assert.equal(packageVersion(after), '1.6.0', path);
    assert.deepEqual(
      after,
      packageVersion(before.get(path), '1.6.0'),
      'only packageVersion changes',
    );
    assert.equal(
      declarationHash(directory, '1.6.0', emittedDeclaration(after)),
      declarationHashes.get(path),
      'actual emitted API retains the same structural hash',
    );
    const generated = (await import(join(root, path)))[exportName];
    assert.ok(generated.objects.length > 0);
    assert.ok(generated.bindings.length > 0);
    for (const source of generated.sources)
      assert.equal(
        source.sha256,
        createHash('sha256')
          .update(readFileSync(join(root, source.path)))
          .digest('hex'),
        source.path,
      );
    const catalog = `packages/${directory}/src/storage-catalog.generated.ts`;
    assert.deepEqual(readFileSync(join(root, catalog)), catalogs.get(catalog));
    run(root, [
      `scripts/${directory === 'offline-sync' ? 'offline' : 'outbox'}-storage-generate.mjs`,
      '--check',
    ]);
  }
  const sbom = JSON.parse(readFileSync(join(root, 'docs/meta/security/sbom.cdx.json'), 'utf8'));
  for (const name of packageNames)
    assert.equal(sbom.components.find((component) => component.name === name).version, '1.6.0');
});

test('version admission accepts exactly both complete generated artifacts with packageVersion-only changes', () => {
  assert.deepEqual(classifyReleaseContext(context()), {
    kind: 'version-pr',
    baseCommit,
    headCommit,
    versionCommit: headCommit,
    changesetCount: 1,
    packageCount: 2,
    rebaseline: false,
  });
});

for (const [name, mutate] of [
  [
    'missing snapshots',
    (value) => {
      value.storageVersionArtifacts = [];
    },
  ],
  [
    'non-array snapshots',
    (value) => {
      value.storageVersionArtifacts = {};
    },
  ],
  [
    'one snapshot',
    (value) => {
      value.storageVersionArtifacts.pop();
    },
  ],
  [
    'duplicate snapshot',
    (value) => {
      value.storageVersionArtifacts[1] = value.storageVersionArtifacts[0];
    },
  ],
  [
    'unknown snapshot path',
    (value) => {
      value.storageVersionArtifacts[0].path = 'packages/core/src/storage-template.generated.ts';
    },
  ],
  [
    'one changed template',
    (value) => {
      value.versionChanges.pop();
    },
  ],
  [
    'duplicate changed template',
    (value) => {
      value.versionChanges.push(value.versionChanges.at(-1));
    },
  ],
  [
    'added template',
    (value) => {
      value.versionChanges.at(-1).status = 'A';
    },
  ],
  [
    'deleted template',
    (value) => {
      value.versionChanges.at(-1).status = 'D';
    },
  ],
  [
    'renamed template',
    (value) => {
      value.versionChanges.at(-1).status = 'R100';
    },
  ],
  [
    'string snapshot',
    (value) => {
      value.storageVersionArtifacts[0].before =
        value.storageVersionArtifacts[0].before.toString('utf8');
    },
  ],
  [
    'wrong base manifest version',
    (value) => {
      value.storageVersionArtifacts[0].baseVersion = '1.5.6';
    },
  ],
  [
    'wrong candidate manifest version',
    (value) => {
      value.storageVersionArtifacts[0].version = '1.6.1';
    },
  ],
  [
    'unchanged version',
    (value) => {
      value.storageVersionArtifacts[0].version = '1.5.7';
    },
  ],
  [
    'noncanonical base version',
    (value) => {
      value.storageVersionArtifacts[0].baseVersion = '01.5.7';
    },
  ],
  [
    'malformed candidate version',
    (value) => {
      value.storageVersionArtifacts[0].version = '1.6';
    },
  ],
  [
    'missing packageVersion row',
    (value) => {
      value.storageVersionArtifacts[0].before = Buffer.from(
        value.storageVersionArtifacts[0].before
          .toString('utf8')
          .replace(/^ {2}packageVersion:.*\n/mu, ''),
      );
    },
  ],
  [
    'duplicate packageVersion row',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.before = Buffer.concat([
        artifact.before,
        Buffer.from("  packageVersion: '1.5.7',\n"),
      ]);
      artifact.after = Buffer.concat([artifact.after, Buffer.from("  packageVersion: '1.6.0',\n")]);
    },
  ],
  [
    'wrong header',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.before = Buffer.from(
        artifact.before
          .toString('utf8')
          .replace('offline-storage-generate.mjs', 'outbox-storage-generate.mjs'),
      );
    },
  ],
  [
    'wrong export',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.before = Buffer.from(
        artifact.before
          .toString('utf8')
          .replace('OFFLINE_STORAGE_TEMPLATE', 'OUTBOX_STORAGE_TEMPLATE'),
      );
    },
  ],
  [
    'malformed UTF8',
    (value) => {
      value.storageVersionArtifacts[0].before = Buffer.concat([
        value.storageVersionArtifacts[0].before,
        Buffer.from([0xff]),
      ]);
    },
  ],
  [
    'changed SQL',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.after = Buffer.from(
        artifact.after
          .toString('utf8')
          .replace('FORCE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY'),
      );
    },
  ],
  [
    'changed digest',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.after = Buffer.from(
        artifact.after
          .toString('utf8')
          .replace(/sha256: '[0-9a-f]{64}'/u, `sha256: '${'0'.repeat(64)}'`),
      );
    },
  ],
  [
    'changed contract version',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.after = Buffer.from(
        artifact.after
          .toString('utf8')
          .replace("contractVersion: '1.0.0'", "contractVersion: '2.0.0'"),
      );
    },
  ],
  [
    'extra comment',
    (value) => {
      value.storageVersionArtifacts[0].after = Buffer.concat([
        value.storageVersionArtifacts[0].after,
        Buffer.from('// unreviewed\n'),
      ]);
    },
  ],
  [
    'changed spacing',
    (value) => {
      const artifact = value.storageVersionArtifacts[0];
      artifact.after = Buffer.from(
        artifact.after
          .toString('utf8')
          .replace("  packageVersion: '1.6.0',", " packageVersion: '1.6.0',"),
      );
    },
  ],
  [
    'unchanged template bytes',
    (value) => {
      value.storageVersionArtifacts[0].after = value.storageVersionArtifacts[0].before;
    },
  ],
])
  test(`storage version admission refuses ${name}`, () => {
    const value = context();
    mutate(value);
    refuses(value);
  });

for (const path of [
  'packages/core/src/storage-template.generated.ts',
  'packages/offline-sync/src/storage-catalog.generated.ts',
  'packages/outbox/migrations/0001.sql',
])
  test(`version admission refuses unrelated generated path ${path}`, () => {
    const value = context();
    value.versionChanges.push({ status: 'M', path });
    refuses(value, 'RELEASE_CONTEXT_VERSION_DIFF');
  });
for (const { directory } of templates)
  test(`storage template ${directory} cannot be introduced as a follow-up change`, () => {
    const value = context();
    value.followUpChanges.push({ status: 'M', path: templatePath(directory) });
    refuses(value, 'RELEASE_CONTEXT_FOLLOW_UP_DIFF');
  });
test('historical markers without storage artifacts retain their closed version classification', () => {
  const value = context();
  value.storageVersionArtifacts = [];
  value.versionChanges = value.versionChanges.filter(
    (change) => !change.path.endsWith('storage-template.generated.ts'),
  );
  assert.equal(classifyReleaseContext(value).kind, 'version-pr');
});
