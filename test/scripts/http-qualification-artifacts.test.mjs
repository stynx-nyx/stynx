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
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { after, test } from 'node:test';
import { readHttpQualificationArtifact } from '../../scripts/lib/http-qualification-artifacts.mjs';

// INV-PERF-001: actual bounded byte acquisition only. These private file bodies
// are sensor inputs, never application/native measurements or admission facts.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx artifact espaço 日本語 ')));
const maximumBytes = 64 * 1024 * 1024;
const invalid = { code: 'HTTP_QUALIFICATION_ARTIFACT_INVALID' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let ordinal = 0;
after(() => rmSync(root, { recursive: true, force: true }));
function file(bytes = Buffer.from('actual private artifact\n')) {
  const path = join(root, `artifact-${++ordinal}.bin`);
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  chownSync(path, process.getuid(), process.getgid());
  return path;
}
function sized(size) {
  const path = file(Buffer.alloc(0));
  const fd = openSync(path, 'r+');
  try {
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
  return path;
}

test('real private bytes, digest, size and relative identity are acquired without changing the file', () => {
  const bytes = Buffer.from([0, 255, 123, 10, 128, 34]);
  const path = file(bytes);
  const before = lstatSync(path, { bigint: true });
  const result = readHttpQualificationArtifact(root, path);
  assert.deepEqual(result.bytes, bytes);
  assert.deepEqual(result.row, {
    path: path.slice(root.length + 1),
    sha256: hash(bytes),
    byteLength: bytes.length,
    permissions: 0o600,
  });
  const final = lstatSync(path, { bigint: true });
  for (const field of ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    assert.equal(final[field], before[field], field);
  assert.deepEqual(readFileSync(path), bytes);
  result.bytes.fill(17);
  assert.deepEqual(readFileSync(path), bytes);
});

test('zero-length and exact64MiB real files retain their complete bodies', () => {
  const empty = readHttpQualificationArtifact(root, sized(0));
  assert.equal(empty.bytes.length, 0);
  assert.equal(empty.row.sha256, hash(Buffer.alloc(0)));
  const path = sized(maximumBytes);
  const result = readHttpQualificationArtifact(root, path);
  assert.equal(result.bytes.length, maximumBytes);
  assert.equal(result.row.byteLength, maximumBytes);
  assert.equal(
    result.bytes.every((byte) => byte === 0),
    true,
  );
  assert.equal(result.row.sha256, hash(result.bytes));
});

for (const size of [maximumBytes + 1, 4 * 1024 * 1024 * 1024])
  test(`real oversized sparse artifact ${size} refuses with the size guard`, () => {
    const path = sized(size);
    assert.equal(lstatSync(path).size, size);
    assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
    assert.equal(lstatSync(path).size, size);
  });

for (const mode of [0o400, 0o640, 0o644, 0o660, 0o700, 0o1600, 0o2600])
  test(`actual file mode ${mode.toString(8)} refuses before reading`, () => {
    const path = file();
    chmodSync(path, mode);
    assert.equal(lstatSync(path).mode & 0o7777, mode);
    assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
  });

test('actual final and ancestor symlinks refuse canonical path substitution', () => {
  const path = file();
  const alias = join(root, `alias-${++ordinal}`);
  symlinkSync(path, alias);
  assert.throws(() => readHttpQualificationArtifact(root, alias), invalid);
  const directory = join(root, `directory-${++ordinal}`);
  mkdirSync(directory, { mode: 0o700 });
  const child = join(directory, 'child');
  writeFileSync(child, 'child', { mode: 0o600 });
  const directoryAlias = join(root, `directory-alias-${++ordinal}`);
  symlinkSync(directory, directoryAlias);
  assert.throws(() => readHttpQualificationArtifact(root, join(directoryAlias, 'child')), invalid);
  assert.throws(() => readHttpQualificationArtifact(directoryAlias, child), invalid);
});

test('actual hardlinks refuse both names and do not consume a linked body', () => {
  const path = file();
  const alias = join(root, `hardlink-${++ordinal}`);
  linkSync(path, alias);
  assert.equal(lstatSync(path).nlink, 2);
  assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
  assert.throws(() => readHttpQualificationArtifact(root, alias), invalid);
});

test('actual directory and FIFO refuse without waiting for a writer', () => {
  const directory = join(root, `not-file-${++ordinal}`);
  mkdirSync(directory, { mode: 0o700 });
  assert.throws(() => readHttpQualificationArtifact(root, directory), invalid);
  const fifo = join(root, `fifo-${++ordinal}`);
  const made = spawnSync('mkfifo', ['-m', '600', fifo], { encoding: 'utf8' });
  assert.equal(made.error, undefined);
  assert.equal(made.status, 0, made.stderr);
  assert.equal(lstatSync(fifo).isFIFO(), true);
  const start = process.hrtime.bigint();
  assert.throws(() => readHttpQualificationArtifact(root, fifo), invalid);
  assert.ok(process.hrtime.bigint() - start < 1_000_000_000n);
});

test('actual Unix socket refuses while its owned server is still listening', async () => {
  // Keep the socket pathname within the actual Darwin sockaddr_un limit.
  const socketRoot = realpathSync(mkdtempSync(join(tmpdir(), 'hqa-')));
  const path = join(socketRoot, 's');
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, resolve);
    });
    assert.equal(lstatSync(path).isSocket(), true);
    assert.throws(() => readHttpQualificationArtifact(socketRoot, path), invalid);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(socketRoot, { recursive: true, force: true });
  }
  assert.equal(server.listening, false);
});

test('actual sibling paths, root aliases, lexical escapes and closed arguments refuse', () => {
  const path = file();
  assert.throws(() => readHttpQualificationArtifact(root, root), invalid);
  assert.throws(() => readHttpQualificationArtifact(join(root, 'absent'), path));
  assert.throws(() => readHttpQualificationArtifact(root, join(root, '..', 'outside')), invalid);
  assert.throws(
    () => readHttpQualificationArtifact(root, `${root}/./${path.slice(root.length + 1)}`),
    invalid,
  );
  assert.throws(() => readHttpQualificationArtifact('.', path), invalid);
  assert.throws(() => readHttpQualificationArtifact(root, 'relative'), invalid);
  assert.throws(() => readHttpQualificationArtifact(root, path, {}), invalid);
  assert.throws(() => readHttpQualificationArtifact(root), invalid);
  for (const value of [null, undefined, 123, {}, []]) {
    assert.throws(() => readHttpQualificationArtifact(value, path), invalid);
    assert.throws(() => readHttpQualificationArtifact(root, value), invalid);
  }
});

test('repeated descriptor-stage mode refusals release every actually opened FD', () => {
  const path = file();
  chmodSync(path, 0o644);
  const before = readdirSync('/dev/fd').sort();
  for (let index = 0; index < 100; index++)
    assert.throws(() => readHttpQualificationArtifact(root, path), invalid);
  assert.deepEqual(readdirSync('/dev/fd').sort(), before);
});

for (const kind of ['growth', 'short-read', 'replacement'])
  test(`bounded actual ${kind} mutation refuses a changed snapshot without filesystem substitutes`, async (t) => {
    const path = sized(maximumBytes);
    const control = new Int32Array(new SharedArrayBuffer(8 * Int32Array.BYTES_PER_ELEMENT));
    const worker = new Worker(new URL('./support/http-artifact-mutator.mjs', import.meta.url), {
      workerData: { path, kind, maximumBytes, control: control.buffer },
    });
    let exited = false;
    const exit = new Promise((resolve, reject) => {
      worker.once('error', reject);
      worker.once('exit', (code) => {
        exited = true;
        resolve(code);
      });
    });
    const deadline = Date.now() + 5_000;
    while (Atomics.load(control, 0) === 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    let refusals = 0,
      accepted = 0;
    try {
      assert.equal(Atomics.load(control, 0), 1, 'actual mutator must start');
      for (let index = 0; index < 16; index++) {
        const attempt = index + 1;
        if (kind === 'short-read') {
          Atomics.store(control, 3, attempt);
          Atomics.notify(control, 3);
          while (Atomics.load(control, 4) !== attempt && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 5));
          assert.equal(Atomics.load(control, 4), attempt, 'each mutator attempt must be ready');
          assert.equal(
            lstatSync(path).size,
            maximumBytes,
            'each actual read starts from a full file',
          );
          Atomics.store(control, 5, attempt);
          Atomics.notify(control, 5);
        }
        try {
          const observed = readHttpQualificationArtifact(root, path);
          assert.equal(observed.row.byteLength, observed.bytes.length);
          assert.equal(observed.row.sha256, hash(observed.bytes));
          accepted++;
        } catch (error) {
          assert.ok(
            ['HTTP_QUALIFICATION_ARTIFACT_INVALID', 'ENOENT'].includes(error.code),
            error.code,
          );
          refusals++;
        } finally {
          if (kind === 'short-read') {
            Atomics.store(control, 6, attempt);
            Atomics.notify(control, 6);
            while (Atomics.load(control, 7) !== attempt && Date.now() < deadline)
              await new Promise((resolve) => setTimeout(resolve, 5));
            assert.equal(Atomics.load(control, 7), attempt, 'each actual mutation must finish');
          }
        }
      }
      assert.ok(Atomics.load(control, 2) > 0, 'real filesystem mutation must occur');
      assert.ok(refusals > 0, 'at least one actual changed snapshot must be refused');
      t.diagnostic(
        JSON.stringify({
          kind,
          attempts: 16,
          refusals,
          stableSnapshots: accepted,
          physicalMutations: Atomics.load(control, 2),
          runtimeAdmission: false,
        }),
      );
    } finally {
      Atomics.store(control, 1, 1);
      for (const field of [3, 5, 6]) Atomics.notify(control, field);
      const timer = setTimeout(() => {
        void worker.terminate();
      }, 5_000);
      try {
        assert.equal(await exit, 0);
      } finally {
        clearTimeout(timer);
      }
      assert.equal(exited, true);
    }
  });
