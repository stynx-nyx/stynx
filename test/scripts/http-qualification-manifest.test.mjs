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
import {
  loadHttpQualificationCase,
  loadHttpQualificationRoster,
} from '../../scripts/lib/http-qualification-manifest.mjs';
import {
  snapshotFreshHttpQualificationCase,
  snapshotFreshHttpQualificationRoster,
} from '../../scripts/lib/http-fresh-build.mjs';
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
    [...members.keys()].sort().map((path) => ({
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

test('declaration loader refuses changed candidate source rather than adopting mutable source bytes', (t) => {
  const { root } = declarationFixture(t);
  const path = join(root, 'reference/api/src/performance/offline-e6.module.ts');
  writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('\n// changed candidate\n')]));
  assert.throws(
    () => loadHttpQualificationCase(root, firstCase),
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
    assert.throws(() => loadHttpQualificationRoster(root), invalid);
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

test('complete roster follows declared composition then case order and retains the entire independent cross-product', (t) => {
  const { root, members, snapshot } = declarationFixture(t);
  const before = snapshot();
  const roster = loadHttpQualificationRoster(root);
  assert.deepEqual(
    Object.keys(roster).sort(),
    [
      'schemaVersion',
      'scope',
      'manifestSha256',
      'schemaSha256',
      'compositionOrder',
      'cases',
      'files',
      'requiredCases',
      'qualificationProfile',
      'runtimeAdmission',
      'performanceQualified',
      'readinessPromoting',
    ].sort(),
  );
  assert.equal(roster.schemaVersion, 1);
  assert.equal(roster.scope, 'source-bound-http-qualification-roster-component');
  assert.deepEqual(roster.compositionOrder, [
    'reference',
    'offlineE6',
    'offlineCTG9',
    'i18n',
    'privacy',
    'domain',
  ]);
  const expectedRows = manifest.compositions.flatMap(({ id }) =>
    manifest.cases.filter(({ compositionId }) => compositionId === id),
  );
  assert.deepEqual(roster.cases, expectedRows);
  assert.notEqual(
    roster.cases[0].caseId,
    manifest.cases[0].caseId,
    'manifest begins domain; public roster must begin declared reference composition',
  );
  const crossProduct = manifest.operations.flatMap((operation) =>
    operation.compositionIds.flatMap((compositionId) =>
      operation.semanticCases.map(({ id }) => `${compositionId}.${operation.originId}.${id}`),
    ),
  );
  assert.equal(crossProduct.length, 1167);
  assert.equal(new Set(crossProduct).size, 1167);
  assert.deepEqual(roster.cases.map(({ caseId }) => caseId).sort(), crossProduct.sort());
  assert.equal(roster.requiredCases, 1167);
  assert.equal(roster.cases.length, roster.requiredCases);
  for (const row of roster.cases) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ['caseId', 'compositionId', 'originId', 'semanticCaseId', 'caseSha256'].sort(),
    );
    assert.equal(row.caseId, `${row.compositionId}.${row.originId}.${row.semanticCaseId}`);
    assert.match(row.caseSha256, /^[a-f0-9]{64}$/u);
  }
  assert.equal(
    roster.manifestSha256,
    '8227b805976e5a99d2f39a4b8f2d1012bbf66f75f8b7a9231b0718fbede11891',
  );
  assert.equal(
    roster.schemaSha256,
    '5ad6409d91dbfedf57b6e8bd2f0b55ea31b857ea248932cdd187c5c4bbd587f0',
  );
  assert.deepEqual(roster.qualificationProfile, manifest.qualificationProfile);
  assert.equal(roster.files.length, members.size);
  assert.deepEqual(
    roster.files.map(({ path }) => path),
    [...members.keys()].sort((a, b) => a.localeCompare(b)),
  );
  for (const row of roster.files) {
    assert.deepEqual(Object.keys(row).sort(), ['path', 'sha256', 'byteLength'].sort());
    const actual = readFileSync(join(root, row.path));
    assert.equal(row.sha256, sha256(actual));
    assert.equal(row.byteLength, actual.byteLength);
  }
  for (const key of ['runtimeAdmission', 'performanceQualified', 'readinessPromoting'])
    assert.equal(roster[key], false);
  assert.deepEqual(snapshot(), before);
});

test('roster and unchanged case projection agree at both ends of every declared composition without sharing mutable results', (t) => {
  const { root } = declarationFixture(t);
  const roster = loadHttpQualificationRoster(root);
  for (const compositionId of roster.compositionOrder) {
    const rows = roster.cases.filter((row) => row.compositionId === compositionId);
    assert.ok(rows.length > 0);
    for (const row of [rows[0], rows.at(-1)]) {
      const result = loadHttpQualificationCase(root, row.caseId);
      assert.equal(result.scope, 'source-bound-http-qualification-declaration-component');
      assert.equal(result.caseSha256, row.caseSha256);
      assert.equal(result.binding.case.caseId, row.caseId);
      assert.equal(result.binding.composition.id, compositionId);
      assert.deepEqual(result.files, roster.files);
      assert.equal(result.requiredCases, roster.requiredCases);
      assert.deepEqual(result.binding.qualificationProfile, roster.qualificationProfile);
      for (const key of ['runtimeAdmission', 'performanceQualified', 'readinessPromoting'])
        assert.equal(result[key], false);
    }
  }
  roster.cases.length = 0;
  roster.compositionOrder.reverse();
  roster.files[0].sha256 = '0'.repeat(64);
  roster.qualificationProfile.scheduledTargets = 1;
  const again = loadHttpQualificationRoster(root);
  assert.equal(again.cases.length, 1167);
  assert.equal(again.compositionOrder[0], 'reference');
  assert.equal(again.qualificationProfile.scheduledTargets, 600);
  assert.notEqual(again.files[0].sha256, '0'.repeat(64));
});

test('roster refuses caller selection, supplied data, noncanonical roots and changed declared source', (t) => {
  const { root } = declarationFixture(t);
  for (const args of [
    [],
    [undefined],
    [manifest],
    ['.'],
    [root, firstCase],
    [root, {}],
    [root, manifest.cases],
    [root, undefined],
  ])
    assert.throws(() => loadHttpQualificationRoster(...args), invalid);
  assert.throws(() => loadHttpQualificationRoster(`${root}/.`), invalid);
  const alias = `${root}-roster-alias`;
  t.after(() => rmSync(alias, { force: true }));
  symlinkSync(root, alias);
  assert.throws(() => loadHttpQualificationRoster(alias), invalid);
  const path = join(root, manifest.compositions.at(-1).rootModule);
  writeFileSync(
    path,
    Buffer.concat([readFileSync(path), Buffer.from('\n// actual stale composition witness\n')]),
  );
  assert.throws(() => loadHttpQualificationRoster(root), invalid);
});

test('actual current checkout refuses a stale manifest rather than making its roster ready', () => {
  assert.throws(() => loadHttpQualificationRoster(repository), invalid);
});

test('complete copied rosters, roots and forged handles cannot access the private retained-build selector', (t) => {
  const { root } = declarationFixture(t);
  const roster = loadHttpQualificationRoster(root);
  let invoked = 0;
  const accessor = Object.defineProperty({}, 'checkout', {
    get() {
      invoked++;
      return root;
    },
  });
  const proxy = new Proxy(
    {},
    {
      get() {
        invoked++;
        return root;
      },
      getPrototypeOf() {
        invoked++;
        return null;
      },
    },
  );
  for (const handle of [
    undefined,
    {},
    Object.freeze(Object.create(null)),
    roster,
    root,
    {
      checkout: root,
      candidateCommit: manifest.sourceCheckpoint.commit,
      rootId: 'reference',
      actualPrivateBuildSelection: true,
    },
    accessor,
    proxy,
  ])
    assert.throws(() => snapshotFreshHttpQualificationRoster(handle), {
      code: 'HTTP_FRESH_BUILD_INVALID',
    });
  assert.equal(invoked, 0);
  for (const args of [[], [roster, root], [roster, undefined], [roster, { cases: roster.cases }]])
    assert.throws(() => snapshotFreshHttpQualificationRoster(...args), {
      code: 'HTTP_FRESH_BUILD_INVALID',
    });
  assert.equal(invoked, 0);
  for (const key of ['runtimeAdmission', 'performanceQualified', 'readinessPromoting'])
    assert.equal(roster[key], false);
});
