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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  readHttpQualificationArtifact,
  readHttpQualificationDeclaration,
} from '../../scripts/lib/http-qualification-artifacts.mjs';

// INV-PERF-001: fixed declaration bytes grant no measurement or runtime authority.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx declaration espaço 日本語 ')));
const maximumBytes = 1024 * 1024;
const invalid = { code: 'HTTP_QUALIFICATION_ARTIFACT_INVALID' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let ordinal = 0;
after(() => rmSync(root, { recursive: true, force: true }));
function file(mode, size = 23) {
  const path = join(root, `declaration-${++ordinal}.json`);
  writeFileSync(path, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
  const fd = openSync(path, 'r+');
  try {
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
  chownSync(path, process.getuid(), process.getgid());
  chmodSync(path, mode);
  return path;
}

for (const mode of [0o644, 0o444]) {
  test(`fixed declaration mode${mode.toString(8)} acquires empty and exact1MiB bytes without changing ownership or identity`, () => {
    for (const size of [0, maximumBytes]) {
      const path = file(mode, size);
      const before = lstatSync(path, { bigint: true });
      const result = readHttpQualificationDeclaration(root, path);
      assert.equal(result.bytes.length, size);
      assert.deepEqual(Object.keys(result).sort(), ['bytes', 'row']);
      assert.deepEqual(result.row, {
        path: path.slice(root.length + 1),
        sha256: hash(result.bytes),
        byteLength: size,
        permissions: mode,
      });
      assert.equal(
        result.bytes.every((byte) => byte === 0),
        true,
      );
      const final = lstatSync(path, { bigint: true });
      for (const field of [
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
        assert.equal(final[field], before[field], field);
      result.bytes.fill(37);
      assert.equal(
        readFileSync(path).every((byte) => byte === 0),
        true,
      );
      assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
    }
  });
  test(`fixed declaration mode${mode.toString(8)} refuses actual1MiB+1 bytes before acquiring a body`, () => {
    const path = file(mode, maximumBytes + 1);
    assert.equal(lstatSync(path).size, maximumBytes + 1);
    assert.throws(() => readHttpQualificationDeclaration(root, path), invalid);
    assert.equal(lstatSync(path).size, maximumBytes + 1);
  });
}

for (const mode of [0o600, 0o664, 0o400, 0o640, 0o666, 0o755, 0o1644, 0o2644])
  test(`fixed declaration rejects actual unapproved mode${mode.toString(8)}`, () => {
    const path = file(mode);
    assert.equal(lstatSync(path).mode & 0o7777, mode);
    assert.throws(() => readHttpQualificationDeclaration(root, path), invalid);
  });

test('declaration and private profiles cannot be selected or overridden by caller arguments', () => {
  const privatePath = file(0o600, maximumBytes + 1);
  assert.equal(readHttpQualificationArtifact(root, privatePath).row.byteLength, maximumBytes + 1);
  const declaredPath = file(0o644);
  for (const args of [
    [],
    [root],
    [root, declaredPath, undefined],
    [root, declaredPath, {}],
    [root, privatePath, { permissions: [0o600], maximumBytes: 64 * 1024 * 1024 }],
    [root, declaredPath, 'privateArtifact'],
    [root, declaredPath, { profile: 'declaration' }],
  ])
    assert.throws(() => readHttpQualificationDeclaration(...args), invalid);
  assert.throws(() => readHttpQualificationDeclaration(root, privatePath), invalid);
  assert.throws(
    () => readHttpQualificationArtifact(root, declaredPath, { permissions: [0o644] }),
    invalid,
  );
  for (const value of [null, undefined, 123, {}, []]) {
    assert.throws(() => readHttpQualificationDeclaration(value, declaredPath), invalid);
    assert.throws(() => readHttpQualificationDeclaration(root, value), invalid);
  }
});

test('declaration real final/ancestor links and hardlinks refuse even with exact allowed permissions', () => {
  const path = file(0o644);
  const alias = join(root, `symlink-${++ordinal}`);
  symlinkSync(path, alias);
  assert.throws(() => readHttpQualificationDeclaration(root, alias), invalid);
  const directory = join(root, `directory-${++ordinal}`);
  mkdirSync(directory, { mode: 0o700 });
  const child = join(directory, 'actual-declaration');
  writeFileSync(child, 'actual declaration', { mode: 0o644 });
  const directoryAlias = join(root, `directory-alias-${++ordinal}`);
  symlinkSync(directory, directoryAlias);
  assert.throws(
    () => readHttpQualificationDeclaration(root, join(directoryAlias, 'actual-declaration')),
    invalid,
  );
  assert.throws(() => readHttpQualificationDeclaration(directoryAlias, child), invalid);
  const hardlink = join(root, `hardlink-${++ordinal}`);
  linkSync(path, hardlink);
  assert.equal(lstatSync(path).nlink, 2);
  assert.throws(() => readHttpQualificationDeclaration(root, path), invalid);
  assert.throws(() => readHttpQualificationDeclaration(root, hardlink), invalid);
});

test('declaration canonical and containment checks reject root, relative and lexical escape identities', () => {
  const path = file(0o444);
  assert.throws(() => readHttpQualificationDeclaration(root, root), invalid);
  assert.throws(() => readHttpQualificationDeclaration('.', path), invalid);
  assert.throws(() => readHttpQualificationDeclaration(root, 'relative'), invalid);
  assert.throws(
    () => readHttpQualificationDeclaration(root, `${root}/./${path.slice(root.length + 1)}`),
    invalid,
  );
  assert.throws(() => readHttpQualificationDeclaration(root, join(root, '..', 'outside')), invalid);
});

test('repeated actual declaration descriptor-stage refusals close every native FD', () => {
  const path = file(0o600);
  const oversized = file(0o644, maximumBytes + 1);
  const before = readdirSync('/dev/fd').sort();
  for (let index = 0; index < 100; index++) {
    assert.throws(() => readHttpQualificationDeclaration(root, path), invalid);
    assert.throws(() => readHttpQualificationDeclaration(root, oversized), invalid);
  }
  assert.deepEqual(readdirSync('/dev/fd').sort(), before);
});
