import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
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
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  readHttpOriginalMetricStream,
  originalStreamLimits,
} from '../../scripts/lib/http-original-stream.mjs';

// INV-PERF-001: complete source-derived NDJSON/gzip byte acquisition grants no
// actual native process, scheduler, application or baseline custody.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t, bytes = gzipSync(Buffer.from('{"fixture":1}\n{"fixture":2}\n'))) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx stream espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'saved/deep/metrics.json.gz');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  return { root, path, bytes };
}
async function consume(root, path, ...extra) {
  const iterator = readHttpOriginalMetricStream(root, path, ...extra);
  const records = [];
  try {
    while (true) {
      const item = await iterator.next();
      if (item.done) return { records, artifact: item.value };
      records.push(item.value);
    }
  } finally {
    await iterator.return();
  }
}
test('actual gzip EOF/trailer, full descriptor hash and records are required before a completion artifact exists', async (t) => {
  const f = fixture(t);
  const before = lstatSync(f.path, { bigint: true });
  const result = await consume(f.root, f.path);
  assert.deepEqual(result.records, [Buffer.from('{"fixture":1}'), Buffer.from('{"fixture":2}')]);
  assert.deepEqual(result.artifact, {
    path: 'saved/deep/metrics.json.gz',
    sha256: hash(f.bytes),
    byteLength: f.bytes.length,
    permissions: 0o600,
    encoding: 'gzip',
    decodedBytes: 28,
    recordCount: 2,
    completeGzipAndDescriptorEof: true,
    originVerified: false,
    retainedInPlace: true,
  });
  const after = lstatSync(f.path, { bigint: true });
  for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    assert.equal(after[key], before[key], key);
  assert.deepEqual(readFileSync(f.path), f.bytes);
});
test('multiple gzip members are all consumed and hashed, with no ignored second population', async (t) => {
  const bytes = Buffer.concat([
    gzipSync(Buffer.from('first\n')),
    gzipSync(Buffer.from('second\n')),
  ]);
  const f = fixture(t, bytes);
  const result = await consume(f.root, f.path);
  assert.deepEqual(result.records, [Buffer.from('first'), Buffer.from('second')]);
  assert.equal(result.artifact.sha256, hash(bytes));
  assert.equal(result.artifact.recordCount, 2);
});
for (const [label, make] of [
  ['empty compressed file', () => Buffer.alloc(0)],
  ['plain uncompressed body', () => Buffer.from('{"fixture":1}\n')],
  ['truncated gzip footer', () => gzipSync(Buffer.from('first\n')).subarray(0, -4)],
  [
    'bad gzip CRC',
    () => {
      const bytes = gzipSync(Buffer.from('first\n'));
      bytes[bytes.length - 8] ^= 1;
      return bytes;
    },
  ],
  ['unterminated final record', () => gzipSync(Buffer.from('first'))],
  ['empty record', () => gzipSync(Buffer.from('first\n\n'))],
  [
    'trailing invalid member',
    () => Buffer.concat([gzipSync(Buffer.from('first\n')), Buffer.from('invalid gzip tail')]),
  ],
  ['empty decoded population', () => gzipSync(Buffer.alloc(0))],
])
  test(`actual ${label} refuses without modifying or deleting the raw file`, async (t) => {
    const f = fixture(t, make());
    await assert.rejects(consume(f.root, f.path));
    assert.deepEqual(readFileSync(f.path), f.bytes);
  });
for (const mode of [0o400, 0o644, 0o660, 0o1600])
  test(`stream refuses actual mode${mode.toString(8)} before granting byte custody`, async (t) => {
    const f = fixture(t);
    chmodSync(f.path, mode);
    await assert.rejects(consume(f.root, f.path), /private finite regular file/u);
    assert.equal(lstatSync(f.path).mode & 0o7777, mode);
  });
test('actual sparse compressed512MiB+1 file refuses before decoding or allocating its declared body', async (t) => {
  const f = fixture(t);
  const fd = openSync(f.path, 'r+');
  try {
    ftruncateSync(fd, originalStreamLimits.compressedBytes + 1);
  } finally {
    closeSync(fd);
  }
  await assert.rejects(consume(f.root, f.path), /private finite regular file/u);
  assert.equal(lstatSync(f.path).size, 512 * 1024 * 1024 + 1);
});
for (const size of [1024 * 1024, 1024 * 1024 + 1])
  test(`actual decoded record${size} is bounded without a caller override`, async (t) => {
    const f = fixture(t, gzipSync(Buffer.concat([Buffer.alloc(size, 120), Buffer.from('\n')])));
    if (size === originalStreamLimits.recordBytes) {
      const result = await consume(f.root, f.path);
      assert.equal(result.records[0].length, size);
      assert.equal(result.artifact.recordCount, 1);
    } else await assert.rejects(consume(f.root, f.path), /record byte limit/u);
  });
test('closed arguments, suffix and genuine path escape cannot change acquisition limits', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    consume(f.root, f.path, { compressedBytes: Infinity }),
    /closed root\/path/u,
  );
  await assert.rejects(consume(f.root, join(f.root, '../outside.gz')), /containment/u);
  const other = join(f.root, 'metrics.json');
  writeFileSync(other, f.bytes, { mode: 0o600 });
  await assert.rejects(consume(f.root, other), /canonical gzip path/u);
  for (const value of [null, {}, [], 17])
    await assert.rejects(consume(value, f.path), /closed root\/path/u);
  assert.equal(Object.isFrozen(originalStreamLimits), true);
  assert.equal(originalStreamLimits.records, 10000000);
  assert.equal(originalStreamLimits.decodedBytes, 4 * 1024 * 1024 * 1024);
  assert.equal(originalStreamLimits.deadlineMs, 120000);
});
for (const mutation of ['hardlink', 'final-symlink', 'ancestor-symlink'])
  test(`actual initial ${mutation} refuses without following a replacement`, async (t) => {
    const f = fixture(t);
    const retained = join(f.root, 'retained');
    if (mutation === 'hardlink') linkSync(f.path, retained);
    if (mutation === 'final-symlink') {
      renameSync(f.path, retained);
      symlinkSync(retained, f.path);
    }
    if (mutation === 'ancestor-symlink') {
      renameSync(join(f.root, 'saved'), retained);
      symlinkSync(retained, join(f.root, 'saved'));
    }
    await assert.rejects(consume(f.root, f.path));
    assert.deepEqual(readFileSync(f.path), f.bytes);
  });
for (const mutation of ['replace', 'truncate', 'grow', 'mode', 'hardlink', 'ancestor', 'root'])
  test(`actual ${mutation} after first yielded record refuses final custody and preserves retained evidence`, async (t) => {
    const f = fixture(t);
    const iterator = readHttpOriginalMetricStream(f.root, f.path);
    const before = readdirSync('/dev/fd').sort();
    const first = await iterator.next();
    assert.equal(first.done, false);
    assert.deepEqual(first.value, Buffer.from('{"fixture":1}'));
    let retained = f.path;
    if (mutation === 'replace') {
      retained = `${f.path}.retained`;
      renameSync(f.path, retained);
      writeFileSync(f.path, f.bytes, { mode: 0o600 });
    }
    if (mutation === 'truncate') {
      const fd = openSync(f.path, 'r+');
      try {
        ftruncateSync(fd, 1);
      } finally {
        closeSync(fd);
      }
    }
    if (mutation === 'grow') appendFileSync(f.path, Buffer.from([0]));
    if (mutation === 'mode') chmodSync(f.path, 0o644);
    if (mutation === 'hardlink') linkSync(f.path, `${f.path}.alias`);
    if (mutation === 'ancestor') {
      const dir = join(f.root, 'saved');
      renameSync(dir, `${dir}.retained`);
      mkdirSync(dir, { mode: 0o700 });
      retained = join(f.root, 'saved.retained/deep/metrics.json.gz');
    }
    if (mutation === 'root') {
      const dir = `${f.root}.retained`;
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      renameSync(f.root, dir);
      mkdirSync(f.root, { mode: 0o700 });
      retained = join(dir, 'saved/deep/metrics.json.gz');
    }
    let completed = false;
    await assert.rejects(async () => {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          completed = true;
          break;
        }
      }
    });
    assert.equal(completed, false);
    await iterator.return();
    assert.deepEqual(readdirSync('/dev/fd').sort(), before);
    assert.equal(lstatSync(retained).isFile(), true);
    if (!['grow', 'truncate'].includes(mutation)) assert.deepEqual(readFileSync(retained), f.bytes);
  });
test('early consumer return yields no completion receipt and closes the actual file descriptor', async (t) => {
  const f = fixture(t);
  const before = readdirSync('/dev/fd').sort();
  const iterator = readHttpOriginalMetricStream(f.root, f.path);
  assert.equal((await iterator.next()).done, false);
  assert.deepEqual(await iterator.return(), { value: undefined, done: true });
  assert.deepEqual(readdirSync('/dev/fd').sort(), before);
  assert.deepEqual(readFileSync(f.path), f.bytes);
});
test('repeated real descriptor-stage failures release all opened descriptors', async (t) => {
  const f = fixture(t);
  chmodSync(f.path, 0o644);
  const before = readdirSync('/dev/fd').sort();
  for (let i = 0; i < 100; i++)
    await assert.rejects(consume(f.root, f.path), /private finite regular file/u);
  assert.deepEqual(readdirSync('/dev/fd').sort(), before);
});
