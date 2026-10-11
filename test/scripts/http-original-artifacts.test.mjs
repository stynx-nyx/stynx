import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import {
  archiveHttpOriginalArtifact,
  readHttpOriginalExecutable,
} from '../../scripts/lib/http-original-artifacts.mjs';
import {
  createHttpQualificationStore,
  publishHttpQualificationBytes,
  snapshotHttpQualificationStore,
} from '../../scripts/lib/http-qualification-store.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MiB = 1024 * 1024;
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx original archive inspector '));
  chmodSync(root, 0o700);
  const store = createHttpQualificationStore();
  const destination = snapshotHttpQualificationStore(store).root;
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  });
  return { root, store, destination, path: join(root, 'input') };
}
function sparse(path, size, mode = 0o600) {
  const fd = openSync(path, 'wx', mode);
  try {
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
}
function standing(row) {
  assert.equal(row.completeDescriptorEof, true);
  for (const key of ['runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'])
    assert.equal(row[key], false);
}

// INV-PERF-001: complete byte custody is structural; it never admits a workload.
test('actual full512MiB metrics retain64 ordered durable8MiB chunks and independently computed full EOF/hash', (t) => {
  const f = fixture(t),
    size = 512 * MiB;
  sparse(f.path, size);
  const expected = createHash('sha256');
  const block = Buffer.alloc(8 * MiB);
  for (let n = 0; n < 64; n++) expected.update(block);
  const row = archiveHttpOriginalArtifact(f.store, f.root, f.path, 'metrics/full', 'metrics');
  standing(row);
  assert.equal(row.byteLength, size);
  assert.equal(row.chunkCount, 64);
  assert.equal(row.chunks.length, 64);
  assert.equal(row.sha256, expected.digest('hex'));
  const reconstructed = createHash('sha256');
  for (let n = 0; n < 64; n++) {
    const part = row.chunks[n];
    assert.equal(part.path, `metrics/full/${String(n).padStart(8, '0')}.part`);
    const path = join(f.destination, part.path),
      bytes = readFileSync(path);
    assert.equal(bytes.length, 8 * MiB);
    assert.equal(part.sha256, hash(bytes));
    assert.equal(lstatSync(path).mode & 0o7777, 0o600);
    reconstructed.update(bytes);
  }
  assert.equal(reconstructed.digest('hex'), row.sha256);
  assert.deepEqual(
    JSON.parse(readFileSync(join(f.destination, row.receipt.path))),
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'receipt')),
  );
  assert.deepEqual(
    readdirSync(join(f.destination, 'metrics/full')).sort(),
    [
      ...Array.from({ length: 64 }, (_, n) => `${String(n).padStart(8, '0')}.part`),
      'index.json',
    ].sort(),
  );
});

for (const [role, size] of [
  ['metrics', 512 * MiB],
  ['preparation', 64 * 1024],
  ['summary', 64 * MiB],
  ['dashboard', 64 * MiB],
  ['log', 64 * MiB],
  ['body', 64 * MiB],
  ['journal', 64 * MiB],
  ['executable', 64 * MiB],
]) {
  test(`actual ${role} rejects fixed bound+1 before publishing any chunk`, (t) => {
    const f = fixture(t);
    sparse(f.path, size + 1, role === 'executable' ? 0o700 : 0o600);
    assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'oversize', role), {
      code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
    });
    assert.deepEqual(readdirSync(f.destination), []);
    assert.equal(lstatSync(f.path).size, size + 1);
  });
}
for (const size of [0, 64 * 1024, 8 * MiB + 7]) {
  test(`actual ${size} byte artifact keeps exact tail/order/index without padding or substitution`, (t) => {
    const f = fixture(t),
      bytes = Buffer.alloc(size, 0x71);
    if (size) bytes[size - 1] = 0x19;
    writeFileSync(f.path, bytes, { mode: 0o600 });
    const row = archiveHttpOriginalArtifact(f.store, f.root, f.path, 'tail', 'metrics');
    standing(row);
    assert.equal(row.sha256, hash(bytes));
    assert.equal(row.byteLength, size);
    assert.equal(row.chunkCount, Math.ceil(size / (8 * MiB)));
    assert.deepEqual(
      Buffer.concat(row.chunks.map((part) => readFileSync(join(f.destination, part.path)))),
      bytes,
    );
  });
}
for (const fault of [
  'file-mode',
  'root-mode',
  'hardlink',
  'symlink',
  'ancestor-symlink',
  'outside',
  'directory',
]) {
  test(`real ${fault} cannot mint retained original bytes`, (t) => {
    const f = fixture(t);
    writeFileSync(f.path, 'original', { mode: 0o600 });
    let path = f.path,
      root = f.root;
    if (fault === 'file-mode') chmodSync(path, 0o644);
    if (fault === 'root-mode') chmodSync(root, 0o755);
    if (fault === 'hardlink') linkSync(path, join(root, 'other'));
    if (fault === 'symlink') {
      path = join(root, 'alias');
      symlinkSync(f.path, path);
    }
    if (fault === 'ancestor-symlink') {
      mkdirSync(join(root, 'real'));
      writeFileSync(join(root, 'real/input'), 'data', { mode: 0o600 });
      symlinkSync(join(root, 'real'), join(root, 'alias'));
      path = join(root, 'alias/input');
    }
    if (fault === 'outside') {
      mkdirSync(join(root, 'nested'), { mode: 0o700 });
      root = join(root, 'nested');
    }
    if (fault === 'directory') path = join(root, 'nested');
    if (fault === 'directory') mkdirSync(path);
    assert.throws(() => archiveHttpOriginalArtifact(f.store, root, path, 'fault', 'metrics'), {
      code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
    });
    assert.deepEqual(readdirSync(f.destination), []);
  });
}

test('actual second-chunk privately owned collision retains first durable bytes, original sandbox and collision; no complete index', (t) => {
  const f = fixture(t),
    original = Buffer.alloc(8 * MiB + 13, 0x52);
  writeFileSync(f.path, original, { mode: 0o600 });
  publishHttpQualificationBytes(
    f.store,
    'partial/00000001.part',
    Buffer.from('do not adopt or overwrite'),
  );
  const collision = join(f.destination, 'partial/00000001.part');
  const identity = lstatSync(collision);
  assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'partial', 'metrics'));
  assert.deepEqual(
    readFileSync(join(f.destination, 'partial/00000000.part')),
    original.subarray(0, 8 * MiB),
  );
  assert.equal(readFileSync(collision, 'utf8'), 'do not adopt or overwrite');
  assert.equal(lstatSync(collision).ino, identity.ino);
  assert.deepEqual(readFileSync(f.path), original);
  assert.throws(() => lstatSync(join(f.destination, 'partial/index.json')), { code: 'ENOENT' });
});

test('real executable reader retains exact700 bytes and refuses600, links, caller overrides', (t) => {
  const f = fixture(t),
    bytes = Buffer.from('structural executable bytes only');
  writeFileSync(f.path, bytes, { mode: 0o700 });
  const result = readHttpOriginalExecutable(f.root, f.path);
  standing(result.row);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.row.sha256, hash(bytes));
  assert.throws(() => readHttpOriginalExecutable(f.root, f.path, { maximum: Infinity }), {
    code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
  });
  chmodSync(f.path, 0o600);
  assert.throws(() => readHttpOriginalExecutable(f.root, f.path), {
    code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
  });
});

for (const prefix of ['', '../escape', 'a//b', '/absolute', 'UPPER', 'a'.repeat(202)]) {
  test(`closed artifact prefix ${JSON.stringify(prefix)} refuses before effects`, (t) => {
    const f = fixture(t);
    writeFileSync(f.path, 'data', { mode: 0o600 });
    assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, prefix, 'metrics'), {
      code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
    });
    assert.deepEqual(readdirSync(f.destination), []);
  });
}
test('caller role/arity and forged stores cannot override fixed archive custody', (t) => {
  const f = fixture(t);
  writeFileSync(f.path, 'data', { mode: 0o600 });
  for (const role of ['unknown', '__proto__', { maximum: Infinity }])
    assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'closed', role), {
      code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
    });
  assert.throws(
    () => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'closed', 'metrics', true),
    { code: 'HTTP_ORIGINAL_ARTIFACT_INVALID' },
  );
  assert.throws(() => archiveHttpOriginalArtifact({}, f.root, f.path, 'closed', 'metrics'));
  assert.deepEqual(readdirSync(f.destination), []);
});

test('caller-preexisting identical chunk is never adopted and causes refusal with original bytes retained', (t) => {
  const f = fixture(t),
    bytes = Buffer.from('existing identical bytes');
  writeFileSync(f.path, bytes, { mode: 0o600 });
  mkdirSync(join(f.destination, 'unowned'), { mode: 0o700 });
  const path = join(f.destination, 'unowned/00000000.part');
  writeFileSync(path, bytes, { mode: 0o600 });
  const identity = lstatSync(path);
  assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'unowned', 'body'));
  assert.equal(lstatSync(path).ino, identity.ino);
  assert.deepEqual(readFileSync(path), bytes);
  assert.deepEqual(readFileSync(f.path), bytes);
  assert.throws(() => lstatSync(join(f.destination, 'unowned/index.json')), { code: 'ENOENT' });
});
test('repeated real refusal after ancestor/file FD acquisition closes descriptors', (t) => {
  const f = fixture(t);
  writeFileSync(f.path, 'data', { mode: 0o644 });
  const directory = process.platform === 'darwin' ? '/dev/fd' : '/proc/self/fd';
  const before = readdirSync(directory).length;
  for (let n = 0; n < 32; n++)
    assert.throws(() => archiveHttpOriginalArtifact(f.store, f.root, f.path, 'closed', 'body'), {
      code: 'HTTP_ORIGINAL_ARTIFACT_INVALID',
    });
  assert.equal(readdirSync(directory).length, before);
  assert.deepEqual(readdirSync(f.destination), []);
});

for (const fault of ['truncate', 'identical-replacement', 'ancestor-replacement']) {
  test(`actual concurrent ${fault} after first durable chunk refuses full EOF receipt while preserving partial evidence`, async (t) => {
    const f = fixture(t);
    mkdirSync(join(f.root, 'source'), { mode: 0o700 });
    const path = join(f.root, 'source/input');
    sparse(path, 512 * MiB);
    const first = join(f.destination, 'race/00000000.part');
    // Real independent OS-file fault actor, synchronized by the actual published
    // first chunk. No source callback, substituted reader or acceptance receipt.
    const worker = new Worker(
      `
      const {parentPort,workerData:d}=require('node:worker_threads');
      const fs=require('node:fs');
      parentPort.postMessage('ready');
      const end=performance.now()+5000;
      while(!fs.existsSync(d.first)){if(performance.now()>=end)throw Error('actual first chunk never appeared');}
      if(d.fault==='truncate')fs.truncateSync(d.path,1);
      else {
        if(d.fault==='ancestor-replacement'){
          fs.renameSync(d.parent,d.parent+'-retained');fs.mkdirSync(d.parent,{mode:0o700});
        } else fs.renameSync(d.path,d.path+'-retained');
        const fd=fs.openSync(d.path,'wx',0o600);
        try{fs.ftruncateSync(fd,512*1024*1024);}finally{fs.closeSync(fd);}
      }
      parentPort.postMessage('fault-applied');
    `,
      { eval: true, workerData: { first, path, parent: join(f.root, 'source'), fault } },
    );
    t.after(async () => {
      await worker.terminate();
    });
    const exited = once(worker, 'exit');
    assert.deepEqual(await once(worker, 'message'), ['ready']);
    const applied = once(worker, 'message');
    assert.throws(
      () => archiveHttpOriginalArtifact(f.store, f.root, path, 'race', 'metrics'),
      (error) => ['HTTP_ORIGINAL_ARTIFACT_INVALID', 'ENOENT'].includes(error.code),
    );
    assert.deepEqual(await applied, ['fault-applied']);
    assert.deepEqual(await exited, [0]);
    assert.equal(readFileSync(first).length, 8 * MiB);
    assert.throws(() => lstatSync(join(f.destination, 'race/index.json')), { code: 'ENOENT' });
    assert.equal(lstatSync(path).size, fault === 'truncate' ? 1 : 512 * MiB);
    assert.ok(readdirSync(f.destination).includes('race'));
  });
}
