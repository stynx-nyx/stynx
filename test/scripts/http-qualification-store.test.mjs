import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  createHttpQualificationStore,
  publishHttpQualificationBytes,
  snapshotHttpQualificationStore,
} from '../../scripts/lib/http-qualification-store.mjs';
import {
  archiveFreshHttpQualificationAttempt,
  runFreshHttpQualificationBatch,
} from '../../scripts/lib/http-fresh-build.mjs';

// INV-PERF-001: these are real archive byte/custody component tests. No file,
// opaque store or structural result supplies a private runtime/build admission.
const roots = [];
const invalid = { code: 'HTTP_QUALIFICATION_STORE_INVALID' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function store() {
  const handle = createHttpQualificationStore();
  const { root, readinessPromoting } = snapshotHttpQualificationStore(handle);
  roots.push(root);
  assert.equal(readinessPromoting, false);
  assert.equal(lstatSync(root).mode & 0o7777, 0o700);
  assert.equal(lstatSync(root).uid, process.getuid());
  return { handle, root };
}
function publish(handle, name = 'attempts/owned/artifact', bytes = Buffer.from('owned bytes')) {
  return publishHttpQualificationBytes(handle, name, bytes);
}

for (const size of [0, 257, 64 * 1024 * 1024])
  test(`actual ${size}-byte publication and exact retry preserve one owned file identity`, () => {
    const { handle, root } = store();
    const bytes = Buffer.alloc(size, 173);
    const row = publish(handle, 'attempts/owned/artifact', bytes);
    assert.deepEqual(row, {
      path: 'attempts/owned/artifact',
      sha256: hash(bytes),
      byteLength: size,
      permissions: 0o600,
    });
    const path = join(root, row.path);
    const before = lstatSync(path, { bigint: true });
    assert.equal(before.nlink, 1n);
    assert.equal(Number(before.mode & 0o7777n), 0o600);
    assert.deepEqual(readFileSync(path), bytes);
    assert.deepEqual(publish(handle, row.path, Buffer.from(bytes)), row);
    const final = lstatSync(path, { bigint: true });
    for (const field of ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'])
      assert.equal(final[field], before[field], field);
    assert.deepEqual(readdirSync(join(root, 'attempts/owned')), ['artifact']);
    bytes.fill(0);
    assert.equal(hash(readFileSync(path)), row.sha256);
  });

test('a retry with changed bytes cannot overwrite its prior publication or poison an exact retry', () => {
  const { handle, root } = store();
  const row = publish(handle);
  const path = join(root, row.path);
  const before = lstatSync(path, { bigint: true });
  for (const bytes of [Buffer.from('other bytes'), Buffer.alloc(0)])
    assert.throws(() => publish(handle, row.path, bytes), invalid);
  assert.deepEqual(readFileSync(path), Buffer.from('owned bytes'));
  assert.equal(lstatSync(path, { bigint: true }).ino, before.ino);
  assert.deepEqual(publish(handle), row);
});

for (const existing of ['same bytes', 'different bytes', 'directory', 'symlink', 'hardlink'])
  test(`initial existing ${existing} is refused without adoption or overwrite`, () => {
    const { handle, root } = store();
    const path = join(root, 'artifact');
    const bytes = Buffer.from('owned bytes');
    if (existing === 'directory') mkdirSync(path, { mode: 0o700 });
    else if (existing === 'symlink') {
      writeFileSync(join(root, 'target'), bytes, { mode: 0o600 });
      symlinkSync('target', path);
    } else if (existing === 'hardlink') {
      writeFileSync(join(root, 'target'), bytes, { mode: 0o600 });
      linkSync(join(root, 'target'), path);
    } else writeFileSync(path, existing === 'same bytes' ? bytes : 'different', { mode: 0o600 });
    const before = lstatSync(path, { bigint: true });
    assert.throws(() => publish(handle, 'artifact', bytes), invalid);
    assert.equal(lstatSync(path, { bigint: true }).ino, before.ino);
    if (before.isFile())
      assert.deepEqual(
        readFileSync(path),
        existing === 'different bytes' ? Buffer.from('different') : bytes,
      );
    // Removing an alien destination permits a new actual publication; the
    // previous body was never accepted merely because its hash happened to match.
    rmSync(path, { recursive: true });
    assert.equal(publish(handle, 'artifact', bytes).sha256, hash(bytes));
  });

for (const mode of [0o400, 0o644, 0o660, 0o1600])
  test(`a settled publication changed to mode ${mode.toString(8)} refuses without rewriting`, () => {
    const { handle, root } = store();
    const row = publish(handle);
    const path = join(root, row.path);
    chmodSync(path, mode);
    assert.throws(() => publish(handle), invalid);
    assert.equal(lstatSync(path).mode & 0o7777, mode);
    assert.deepEqual(readFileSync(path), Buffer.from('owned bytes'));
  });

test('same-byte file replacement and extra hardlink refuse the saved publication identity', () => {
  for (const mutation of ['replacement', 'hardlink']) {
    const { handle, root } = store();
    const row = publish(handle);
    const path = join(root, row.path);
    const original = lstatSync(path, { bigint: true });
    if (mutation === 'replacement') {
      renameSync(path, `${path}.original`);
      writeFileSync(path, 'owned bytes', { mode: 0o600 });
      assert.notEqual(lstatSync(path, { bigint: true }).ino, original.ino);
    } else linkSync(path, `${path}.alias`);
    assert.throws(() => publish(handle), invalid);
    assert.deepEqual(readFileSync(path), Buffer.from('owned bytes'));
  }
});

for (const ancestor of ['', 'a', 'a/b', 'a/b/c'])
  test(`saved ancestor ${ancestor || 'root'} replacement refuses and restoration cannot clear custody refusal`, () => {
    const { handle, root } = store();
    const bytes = Buffer.from('deep bytes');
    publish(handle, 'a/b/c/artifact', bytes);
    const path = ancestor ? join(root, ancestor) : root;
    const moved = `${path}.retained`;
    if (!ancestor) roots.push(moved);
    const before = lstatSync(path, { bigint: true });
    renameSync(path, moved);
    mkdirSync(path, { mode: 0o700 });
    assert.notEqual(lstatSync(path, { bigint: true }).ino, before.ino);
    assert.throws(() => snapshotHttpQualificationStore(handle), invalid);
    rmSync(path, { recursive: true });
    renameSync(moved, path);
    assert.equal(lstatSync(path, { bigint: true }).ino, before.ino);
    assert.throws(() => publish(handle, 'a/b/c/artifact', bytes), invalid);
    assert.throws(() => snapshotHttpQualificationStore(handle), invalid);
    assert.deepEqual(readFileSync(join(root, 'a/b/c/artifact')), bytes);
  });

test('custody of an unrelated previously used branch is checked before each publication', () => {
  const { handle, root } = store();
  publish(handle, 'left/deep/artifact');
  publish(handle, 'right/deep/artifact');
  chmodSync(join(root, 'left/deep'), 0o755);
  assert.throws(() => publish(handle, 'right/new', Buffer.from('new')), invalid);
  chmodSync(join(root, 'left/deep'), 0o700);
  assert.throws(() => publish(handle, 'right/new', Buffer.from('new')), invalid);
  assert.deepEqual(readdirSync(join(root, 'right')), ['deep']);
});

test('missing saved directories retain their earlier bodies and poison subsequent publication', () => {
  const { handle, root } = store();
  publish(handle, 'a/b/artifact');
  renameSync(join(root, 'a'), join(root, 'retained-a'));
  assert.throws(() => publish(handle, 'new'), { code: 'ENOENT' });
  renameSync(join(root, 'retained-a'), join(root, 'a'));
  assert.throws(() => publish(handle, 'new'), invalid);
  assert.deepEqual(readFileSync(join(root, 'a/b/artifact')), Buffer.from('owned bytes'));
});

for (const name of [
  '',
  '../escape',
  '/absolute',
  'a//b',
  'a/../b',
  'a/./b',
  'a\\b',
  'a b',
  'é',
  'a/'.repeat(8) + 'z',
  'a'.repeat(513),
])
  test(`closed portable member name refuses ${JSON.stringify(name)}`, () => {
    const { handle, root } = store();
    assert.throws(() => publish(handle, name), invalid);
    assert.deepEqual(readdirSync(root), []);
  });

test('closed store APIs refuse caller roots/profiles, unknown handles and supplied archive authority', async () => {
  const { handle, root } = store();
  assert.throws(() => createHttpQualificationStore(root), invalid);
  assert.throws(() => snapshotHttpQualificationStore(handle, {}), invalid);
  assert.throws(() => publishHttpQualificationBytes(handle, 'x', Buffer.from('x'), {}), invalid);
  for (const unknown of [{}, Object.create(null), null, root]) {
    assert.throws(() => snapshotHttpQualificationStore(unknown), invalid);
    await assert.rejects(archiveFreshHttpQualificationAttempt(unknown), {
      code: 'HTTP_FRESH_BUILD_INVALID',
    });
  }
  await assert.rejects(
    runFreshHttpQualificationBatch({ state: 'RUNNING', archiveSha256: 'a'.repeat(64) }),
    {
      code: 'HTTP_FRESH_BUILD_INVALID',
    },
  );
  await assert.rejects(archiveFreshHttpQualificationAttempt(handle, { cleanup: 'ABSENT' }), {
    code: 'HTTP_FRESH_BUILD_INVALID',
  });
  assert.deepEqual(readdirSync(root), []);
});

test('caller proxies, shared buffers, subclassed buffers and oversized bodies cannot select publication bytes', () => {
  const { handle, root } = store();
  let traps = 0;
  const proxy = new Proxy(Buffer.from('x'), {
    get() {
      traps++;
      throw new Error('caller proxy must remain unobserved');
    },
  });
  const subclass = Buffer.from('x');
  Object.setPrototypeOf(subclass, Object.create(Buffer.prototype));
  for (const bytes of [
    proxy,
    subclass,
    Buffer.from(new SharedArrayBuffer(4)),
    Buffer.alloc(64 * 1024 * 1024 + 1),
    new Uint8Array(4),
  ])
    assert.throws(() => publish(handle, 'x', bytes), invalid);
  assert.equal(traps, 0);
  assert.deepEqual(readdirSync(root), []);
});

test('actual pending-inode acquisition failure retains full bytes and exact private retry completes after the external hardlink is removed', async () => {
  const { handle, root } = store();
  publish(handle, 'attempts/owned/seed');
  const directory = join(root, 'attempts/owned');
  const alias = join(root, 'external-hardlink');
  const signal = new SharedArrayBuffer(4);
  const state = new Int32Array(signal);
  const worker = new Worker(
    new URL('./support/http-qualification-store-mutator.mjs', import.meta.url),
    {
      workerData: { directory, alias, signal },
    },
  );
  const exited = new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', resolve);
  });
  try {
    assert.notEqual(Atomics.wait(state, 0, 0, 10000), 'timed-out');
    assert.equal(Atomics.load(state, 0), 1);
    const bytes = Buffer.alloc(64 * 1024 * 1024, 181);
    assert.throws(() => publish(handle, 'attempts/owned/partial', bytes), {
      code: 'HTTP_QUALIFICATION_ARTIFACT_INVALID',
    });
    assert.equal(await exited, 0);
    assert.equal(Atomics.load(state, 0), 2);
    const path = join(directory, 'partial');
    const before = lstatSync(path, { bigint: true });
    assert.equal(before.nlink, 2n);
    assert.equal(lstatSync(alias, { bigint: true }).ino, before.ino);
    assert.deepEqual(readFileSync(path), bytes);
    assert.throws(
      () => publish(handle, 'attempts/owned/partial', Buffer.from('replacement')),
      invalid,
    );
    rmSync(alias);
    const row = publish(handle, 'attempts/owned/partial', bytes);
    assert.equal(row.sha256, hash(bytes));
    assert.equal(lstatSync(path, { bigint: true }).ino, before.ino);
    assert.equal(lstatSync(path).nlink, 1);
    assert.deepEqual(readFileSync(path), bytes);
    assert.deepEqual(publish(handle, 'attempts/owned/partial', bytes), row);
    assert.deepEqual(readdirSync(directory).sort(), ['partial', 'seed']);
  } finally {
    await worker.terminate();
  }
});

for (const ancestor of ['', 'a', 'a/b', 'a/b/c'])
  test(`actual ancestor ${ancestor || 'root'} swap while a pending body exists retains the body and makes refusal sticky`, async () => {
    const { handle, root } = store();
    publish(handle, 'a/b/c/seed');
    const path = ancestor ? join(root, ancestor) : root;
    const retained = `${path}.retained`;
    if (!ancestor) roots.push(retained);
    const signal = new SharedArrayBuffer(4);
    const state = new Int32Array(signal);
    const worker = new Worker(
      new URL('./support/http-qualification-store-mutator.mjs', import.meta.url),
      {
        workerData: {
          directory: join(root, 'a/b/c'),
          ancestor: path,
          retained,
          mutation: 'swap-directory',
          signal,
        },
      },
    );
    const exited = new Promise((resolve, reject) => {
      worker.once('error', reject);
      worker.once('exit', resolve);
    });
    try {
      assert.notEqual(Atomics.wait(state, 0, 0, 10000), 'timed-out');
      assert.equal(Atomics.load(state, 0), 1);
      const bytes = Buffer.alloc(64 * 1024 * 1024, 211);
      assert.throws(() => publish(handle, 'a/b/c/partial', bytes), invalid);
      assert.equal(await exited, 0);
      assert.equal(Atomics.load(state, 0), 2);
      const suffix = ancestor ? 'a/b/c'.slice(ancestor.length) : '/a/b/c';
      const actualDirectory = retained + suffix;
      const pending = readdirSync(actualDirectory).filter((name) => name.startsWith('pending-'));
      assert.equal(pending.length, 1);
      assert.deepEqual(readFileSync(join(actualDirectory, pending[0])), bytes);
      assert.deepEqual(readdirSync(path), []);
      rmSync(path, { recursive: true });
      renameSync(retained, path);
      assert.throws(() => publish(handle, 'a/b/c/partial', bytes), invalid);
      assert.throws(() => snapshotHttpQualificationStore(handle), invalid);
      assert.deepEqual(readFileSync(join(root, 'a/b/c', pending[0])), bytes);
      assert.equal(readdirSync(join(root, 'a/b/c')).includes('partial'), false);
    } finally {
      await worker.terminate();
    }
  });
