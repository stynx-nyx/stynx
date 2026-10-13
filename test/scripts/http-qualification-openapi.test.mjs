import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  closeSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  readHttpQualificationArtifact,
  readHttpQualificationDeclaration,
  readHttpQualificationOpenApi,
} from '../../scripts/lib/http-qualification-artifacts.mjs';

// INV-PERF-001: the fixed generated OpenAPI profile grants byte custody only.
const paths = [
  'docs/framework/contracts/openapi.json',
  'docs/framework/api/openapi.json',
  'docs/framework/contracts/openapi-compositions/offline-ctg9.json',
  'docs/framework/contracts/openapi-compositions/offline-e6.json',
];
const actualSizes = [1_187_817, 1_187_817, 1_132_828, 1_092_971];
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const invalid = { code: 'HTTP_QUALIFICATION_ARTIFACT_INVALID' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t, relative = paths[0], mode = 0o644, size = 31) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx OpenAPI espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
  const fd = openSync(path, 'r+');
  try {
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
  chownSync(path, process.getuid(), process.getgid());
  chmodSync(path, mode);
  return { root, path };
}
for (const relative of paths)
  for (const mode of [0o644, 0o444]) {
    test(`fixed ${relative} mode${mode.toString(8)} accepts empty/exact2MiB without changing the file`, (t) => {
      for (const size of [0, 2 * 1024 * 1024]) {
        const { root, path } = fixture(t, relative, mode, size);
        const before = lstatSync(path, { bigint: true });
        const acquired = readHttpQualificationOpenApi(root, path);
        assert.deepEqual(acquired.row, {
          path: relative,
          sha256: hash(Buffer.alloc(size)),
          byteLength: size,
          permissions: mode,
        });
        assert.deepEqual(acquired.bytes, Buffer.alloc(size));
        const final = lstatSync(path, { bigint: true });
        for (const key of [
          'dev',
          'ino',
          'mode',
          'uid',
          'gid',
          'nlink',
          'size',
          'mtimeNs',
          'ctimeNs',
        ])
          assert.equal(final[key], before[key], key);
        acquired.bytes.fill(19);
        assert.deepEqual(readFileSync(path), Buffer.alloc(size));
        if (size) assert.throws(() => readHttpQualificationDeclaration(root, path), invalid);
        assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
      }
    });
    test(`fixed ${relative} mode${mode.toString(8)} refuses2MiB+1 without changing the sparse body`, (t) => {
      const { root, path } = fixture(t, relative, mode, 2 * 1024 * 1024 + 1);
      assert.throws(() => readHttpQualificationOpenApi(root, path), invalid);
      assert.equal(lstatSync(path).size, 2 * 1024 * 1024 + 1);
    });
  }
for (const relative of paths)
  test(`actual generated ${relative} is acquired under the fixed profile`, () => {
    const path = join(repository, relative);
    const bytes = readFileSync(path);
    assert.equal(bytes.length, actualSizes[paths.indexOf(relative)]);
    const before = lstatSync(path, { bigint: true });
    const result = readHttpQualificationOpenApi(repository, path);
    assert.deepEqual(result.bytes, bytes);
    assert.equal(result.row.sha256, hash(bytes));
    assert.throws(() => readHttpQualificationDeclaration(repository, path), invalid);
    assert.equal(lstatSync(path, { bigint: true }).ino, before.ino);
  });
for (const mode of [0o600, 0o400, 0o640, 0o664, 0o666, 0o755, 0o1644, 0o2644])
  test(`OpenAPI fixed profile refuses mode${mode.toString(8)}`, (t) => {
    const { root, path } = fixture(t, paths[0], mode);
    assert.throws(() => readHttpQualificationOpenApi(root, path), invalid);
    assert.equal(lstatSync(path).mode & 0o7777, mode);
  });

test('fixed paths cannot be broadened by basename, caller profile, limit or root alias', (t) => {
  const { root, path } = fixture(t);
  for (const relative of [
    'openapi.json',
    'docs/openapi.json',
    'docs/framework/api/other.json',
    'docs/framework/contracts/openapi.json.extra',
  ]) {
    const other = join(root, relative);
    mkdirSync(dirname(other), { recursive: true });
    writeFileSync(other, '{}', { mode: 0o644 });
    assert.throws(() => readHttpQualificationOpenApi(root, other), invalid);
  }
  for (const args of [
    [],
    [root],
    [root, path, undefined],
    [root, path, { maximumBytes: 64 * 1024 * 1024 }],
    [root, path, { permissions: [0o600] }],
  ])
    assert.throws(() => readHttpQualificationOpenApi(...args), invalid);
  for (const value of [null, 19, {}, [], new URL(`file://${path}`)]) {
    assert.throws(() => readHttpQualificationOpenApi(value, path), invalid);
    assert.throws(() => readHttpQualificationOpenApi(root, value), invalid);
  }
  const alias = `${root}.alias`;
  t.after(() => rmSync(alias, { force: true }));
  symlinkSync(root, alias);
  assert.throws(() => readHttpQualificationOpenApi(alias, join(alias, paths[0])), invalid);
  assert.throws(
    () =>
      readHttpQualificationOpenApi(
        root,
        `${root}/docs/framework/contracts/../contracts/openapi.json`,
      ),
    invalid,
  );
});

test('real hardlink, final symlink and ancestor symlink refuse without consuming external bodies', (t) => {
  for (const mutation of ['hardlink', 'final', 'ancestor']) {
    const { root, path } = fixture(t);
    const retained = join(root, 'retained');
    if (mutation === 'hardlink') linkSync(path, retained);
    if (mutation === 'final') {
      renameSync(path, retained);
      symlinkSync(retained, path);
    }
    if (mutation === 'ancestor') {
      renameSync(join(root, 'docs'), retained);
      symlinkSync(retained, join(root, 'docs'));
    }
    assert.throws(() => readHttpQualificationOpenApi(root, path), invalid);
    assert.equal(readFileSync(path).length, 31);
  }
});

test('byte tampering produces a new honest digest and no cached old body or supplied hash authority', (t) => {
  const { root, path } = fixture(t);
  const prior = readHttpQualificationOpenApi(root, path);
  writeFileSync(path, 'tampered generated body');
  const actual = readHttpQualificationOpenApi(root, path);
  assert.notEqual(actual.row.sha256, prior.row.sha256);
  assert.equal(actual.row.sha256, hash(Buffer.from('tampered generated body')));
  assert.deepEqual(actual.bytes, Buffer.from('tampered generated body'));
  assert.throws(() => readHttpQualificationOpenApi(root, path, prior.row.sha256), invalid);
});

test('200 real descriptor-stage refusals close every opened file descriptor', (t) => {
  const { root, path } = fixture(t, paths[0], 0o600);
  const before = readdirSync('/dev/fd').sort();
  for (let i = 0; i < 200; i++)
    assert.throws(() => readHttpQualificationOpenApi(root, path), invalid);
  assert.deepEqual(readdirSync('/dev/fd').sort(), before);
});
