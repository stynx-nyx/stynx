import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadHttpQualificationCase } from '../../scripts/lib/http-qualification-manifest.mjs';
import { snapshotFreshHttpQualificationCase } from '../../scripts/lib/http-fresh-build.mjs';
import { sha256 } from './support/http-qualification-fixture.mjs';

// INV-PERF-001: source declarations and caller paths never grant runtime authority.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = 'law/policy/http-qualification-manifest.json';
const schemaPath = 'law/schemas/http-qualification-manifest.schema.json';
const manifestBytes = readFileSync(join(repository, manifestPath));
const manifest = JSON.parse(manifestBytes);
const firstCase = manifest.cases[0].caseId;
const invalid = { code: 'HTTP_QUALIFICATION_MANIFEST_INVALID' };

function declarationFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx manifest espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const members = new Map([
    [manifestPath, sha256(manifestBytes)],
    [schemaPath, sha256(readFileSync(join(repository, schemaPath)))],
    [manifest.compositionPolicy.path, manifest.compositionPolicy.sha256],
    ...manifest.authoritySources.map((path) => [path, undefined]),
  ]);
  for (const operation of [...manifest.operations, ...manifest.publicExclusions]) {
    members.set(operation.file, operation.sourceSha256);
    for (const reference of operation.openapiOperations)
      members.set(reference.artifact, reference.artifactSha256);
  }
  for (const composition of manifest.compositions) {
    members.set(composition.factorySource, composition.factorySourceSha256);
    members.set(composition.rootModule, composition.rootModuleSha256);
  }
  for (const [path, expected] of members) {
    let bytes = readFileSync(join(repository, path));
    // Reconstruct the exact declared historical source, never rewrite current
    // producer bytes or use a mutable sibling worktree as test authority.
    if (expected && sha256(bytes) !== expected) {
      bytes = execFileSync('git', ['show', `${manifest.sourceCheckpoint.commit}:${path}`], {
        cwd: repository,
        maxBuffer: 8 * 1024 * 1024,
      });
    }
    if (expected) assert.equal(sha256(bytes), expected, `historical fixture member ${path}`);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  const snapshot = () =>
    [...members.keys()]
      .sort()
      .map((path) => ({
        path,
        sha256: sha256(readFileSync(join(root, path))),
        size: lstatSync(join(root, path)).size,
      }));
  return { root, members, snapshot };
}

test('exact pinned historical declaration reconstructs all 1167 cases without writing or granting admission', (t) => {
  const { root, members, snapshot } = declarationFixture(t);
  const before = snapshot();
  const result = loadHttpQualificationCase(root, firstCase);
  assert.equal(result.requiredCases, 1167);
  assert.equal(result.files.length, members.size);
  assert.equal(
    result.manifestSha256,
    '8227b805976e5a99d2f39a4b8f2d1012bbf66f75f8b7a9231b0718fbede11891',
  );
  assert.equal(
    result.schemaSha256,
    '5ad6409d91dbfedf57b6e8bd2f0b55ea31b857ea248932cdd187c5c4bbd587f0',
  );
  assert.equal(result.caseSha256, manifest.cases[0].caseSha256);
  assert.equal(result.binding.case.caseId, firstCase);
  assert.equal(result.binding.case.scheduledTargets, 600);
  assert.equal(result.binding.qualificationProfile.durationSeconds, 300);
  for (const key of ['runtimeAdmission', 'performanceQualified', 'readinessPromoting'])
    assert.equal(result[key], false);
  assert.deepEqual(snapshot(), before);
  result.binding.case.scheduledTargets = 1;
  assert.equal(loadHttpQualificationCase(root, firstCase).binding.case.scheduledTargets, 600);
});

test('declaration loader refuses changed candidate source rather than adopting mutable source bytes', () => {
  assert.throws(
    () => loadHttpQualificationCase(repository, firstCase),
    (error) => {
      assert.equal(error.code, invalid.code);
      assert.match(
        error.message,
        /Manifest member differs: reference\/api\/src\/performance\/offline-e6.module.ts/u,
      );
      return true;
    },
  );
});

test('declaration loader refuses unknown cases, supplied manifest objects and extra caller arguments', (t) => {
  const { root } = declarationFixture(t);
  assert.throws(() => loadHttpQualificationCase(root, 'reference.unlisted.nominal'), invalid);
  assert.throws(() => loadHttpQualificationCase(root, { ...manifest.cases[0] }), invalid);
  assert.throws(() => loadHttpQualificationCase(root, firstCase, manifest), invalid);
  assert.throws(() => loadHttpQualificationCase(root), invalid);
});

for (const [name, member, change] of [
  [
    'manifest whitespace tampering',
    manifestPath,
    (bytes) => Buffer.concat([bytes, Buffer.from('\n')]),
  ],
  [
    'ambiguous duplicate manifest key',
    manifestPath,
    (bytes) =>
      Buffer.from(
        bytes
          .toString()
          .replace(
            '"schemaVersion": "1.0.0"',
            '"schemaVersion": "1.0.0", "schemaVersion": "1.0.0"',
          ),
      ),
  ],
  ['schema tampering', schemaPath, (bytes) => Buffer.concat([bytes, Buffer.from('\n')])],
  [
    'composition policy tampering',
    manifest.compositionPolicy.path,
    (bytes) => Buffer.concat([bytes, Buffer.from('\n')]),
  ],
  [
    'handler source tampering',
    manifest.operations[0].file,
    (bytes) => Buffer.concat([bytes, Buffer.from('\n')]),
  ],
  [
    'root module tampering',
    manifest.compositions[0].rootModule,
    (bytes) => Buffer.concat([bytes, Buffer.from('\n')]),
  ],
])
  test(`declaration loader refuses ${name}`, (t) => {
    const { root } = declarationFixture(t);
    const path = join(root, member);
    const original = readFileSync(path);
    const changed = change(original);
    assert.notDeepEqual(changed, original);
    writeFileSync(path, changed);
    assert.throws(() => loadHttpQualificationCase(root, firstCase), invalid);
    assert.deepEqual(readFileSync(path), changed);
  });

test('declaration loader refuses relative, noncanonical and symlink roots', (t) => {
  const { root } = declarationFixture(t);
  assert.throws(() => loadHttpQualificationCase('.', firstCase), invalid);
  assert.throws(
    () => loadHttpQualificationCase(`${root}/../${root.split('/').at(-1)}`, firstCase),
    invalid,
  );
  const alias = `${root}-alias`;
  t.after(() => rmSync(alias, { force: true }));
  symlinkSync(root, alias);
  assert.throws(() => loadHttpQualificationCase(alias, firstCase), invalid);
});

test('declaration loader refuses a symlink member even when its bytes match the exact pin', (t) => {
  const { root } = declarationFixture(t);
  const path = join(root, manifestPath);
  const target = join(root, 'identical-manifest.json');
  writeFileSync(target, readFileSync(path));
  rmSync(path);
  symlinkSync(target, path);
  assert.throws(() => loadHttpQualificationCase(root, firstCase), invalid);
});

test('copied declaration and forged objects cannot become private fresh-build handles', (t) => {
  const { root } = declarationFixture(t);
  const declaration = loadHttpQualificationCase(root, firstCase);
  for (const handle of [
    undefined,
    {},
    Object.freeze(Object.create(null)),
    declaration,
    { checkout: root, candidateCommit: manifest.sourceCheckpoint.commit, rootId: 'domain' },
    new Proxy({}, {}),
  ]) {
    assert.throws(() => snapshotFreshHttpQualificationCase(handle, firstCase), {
      code: 'HTTP_FRESH_BUILD_INVALID',
    });
  }
  assert.throws(() => snapshotFreshHttpQualificationCase(declaration, firstCase, manifest), {
    code: 'HTTP_FRESH_BUILD_INVALID',
  });
});
