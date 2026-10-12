import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
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
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import {
  createFixtureFailureArchive,
  snapshotFixtureFailureArchive,
  verifyFixtureFailureArchive,
  writeFixtureFailureArchive,
} from '../../scripts/lib/http-fixture-failure-archive.mjs';

// INV-PERF-001: actual private failure bytes and immutable identity only. These
// files cannot attest application cleanup, workload origin or release readiness.
const owned = new Set();
const fault = { code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_FAULT' };
const sticky = { code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_STICKY_FAULT' };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const names = [
  'postgres.log',
  'object-expected.zip',
  'object-received.body',
  'capture.json',
  'cleanup.json',
];
function archive() {
  const handle = createFixtureFailureArchive();
  owned.add(snapshotFixtureFailureArchive(handle).directory);
  return handle;
}
function path(handle, name = 'postgres.log') {
  return join(snapshotFixtureFailureArchive(handle).directory, name);
}
function retainedFault(handle, operation) {
  assert.throws(operation, fault);
  const result = snapshotFixtureFailureArchive(handle);
  assert.equal(result.directoryOutcome, 'RETAINED');
  assert.match(result.failureCode, /^HTTP_FIXTURE_FAILURE_ARCHIVE_/);
  assert.throws(() => verifyFixtureFailureArchive(handle), sticky);
  assert.throws(
    () => writeFixtureFailureArchive(handle, 'cleanup.json', Buffer.from('later')),
    sticky,
  );
  return result;
}
after(() => {
  for (const directory of owned) rmSync(directory, { recursive: true, force: true });
});

test('generated opaque archive has actual owned0700 identity, an empty exact roster and no authority', () => {
  const handle = archive();
  assert.equal(Object.getPrototypeOf(handle), null);
  assert.equal(Object.isFrozen(handle), true);
  assert.deepEqual(Reflect.ownKeys(handle), []);
  const result = snapshotFixtureFailureArchive(handle);
  assert.equal(realpathSync(result.directory), result.directory);
  const stat = lstatSync(result.directory);
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o7777, 0o700);
  assert.equal(result.directoryOutcome, 'RETAINED');
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.partialFiles, []);
  assert.equal(result.failureCode, null);
  for (const field of ['runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'])
    assert.equal(result[field], false);
  assert.equal(verifyFixtureFailureArchive(handle), undefined);
});

test('all five fixed members preserve independent exact binary bodies, hashes and0600 identities', () => {
  const handle = archive();
  const rows = [];
  for (const [index, name] of names.entries()) {
    const bytes = Buffer.from([0, 255, index, 128, 10]);
    const expected = {
      path: name,
      sha256: sha(bytes),
      byteLength: bytes.length,
      permissions: 0o600,
    };
    const row = writeFixtureFailureArchive(handle, name, bytes);
    assert.deepEqual(row, expected);
    rows.push(expected);
    bytes.fill(17);
    row.sha256 = 'caller mutation';
    assert.deepEqual(readFileSync(path(handle, name)), Buffer.from([0, 255, index, 128, 10]));
    const stat = lstatSync(path(handle, name));
    assert.equal(stat.mode & 0o7777, 0o600);
    assert.equal(stat.uid, process.getuid());
    assert.equal(stat.nlink, 1);
  }
  verifyFixtureFailureArchive(handle);
  const first = snapshotFixtureFailureArchive(handle);
  assert.deepEqual(first.files, rows);
  assert.deepEqual(first.partialFiles, []);
  first.files[0].sha256 = 'caller mutation';
  assert.deepEqual(snapshotFixtureFailureArchive(handle).files, rows);
  assert.deepEqual(readdirSync(dirname(path(handle))).sort(), [...names].sort());
});

test('empty and exact64MiB bodies are complete, while64MiB+1 is refused before publication', () => {
  const handle = archive();
  assert.equal(writeFixtureFailureArchive(handle, 'capture.json', Buffer.alloc(0)).byteLength, 0);
  const bytes = Buffer.alloc(64 * 1024 * 1024, 53);
  const row = writeFixtureFailureArchive(handle, 'object-received.body', bytes);
  assert.equal(row.byteLength, bytes.length);
  assert.equal(row.sha256, sha(bytes));
  assert.deepEqual(readFileSync(path(handle, 'object-received.body')), bytes);
  const rejected = archive();
  const result = retainedFault(rejected, () =>
    writeFixtureFailureArchive(rejected, 'object-received.body', Buffer.alloc(bytes.length + 1)),
  );
  assert.deepEqual(result.files, []);
  assert.deepEqual(readdirSync(result.directory), []);
});

for (const [label, args] of [
  ['unknown name', ['unknown.log', Buffer.from('x')]],
  ['path escape', ['../postgres.log', Buffer.from('x')]],
  ['caller destination', ['/private/tmp/postgres.log', Buffer.from('x')]],
  ['extra profile', ['postgres.log', Buffer.from('x'), { maximumBytes: 1 }]],
  ['missing body', ['postgres.log']],
  ['Uint8Array body', ['postgres.log', new Uint8Array([1])]],
  ['shared body', ['postgres.log', Buffer.from(new SharedArrayBuffer(2))]],
  ['proxied body', ['postgres.log', new Proxy(Buffer.from('x'), {})]],
])
  test(`closed publication refuses ${label}, retains empty bytes and stays faulty`, () => {
    const handle = archive();
    const result = retainedFault(handle, () => writeFixtureFailureArchive(handle, ...args));
    assert.equal(result.failureCode, 'HTTP_FIXTURE_FAILURE_ARCHIVE_REQUEST');
    assert.deepEqual(readdirSync(result.directory), []);
  });

test('opaque handles and exact API arity cannot be manufactured or broadened', () => {
  assert.throws(() => createFixtureFailureArchive('/private/tmp'), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_REQUEST',
  });
  for (const handle of [{}, Object.freeze(Object.create(null)), null, new Proxy({}, {})]) {
    assert.throws(() => writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('x')), {
      code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_HANDLE',
    });
    assert.throws(() => verifyFixtureFailureArchive(handle), {
      code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_HANDLE',
    });
    assert.throws(() => snapshotFixtureFailureArchive(handle), {
      code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_HANDLE',
    });
  }
  const handle = archive();
  assert.throws(() => snapshotFixtureFailureArchive(handle, {}), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_REQUEST',
  });
  assert.equal(snapshotFixtureFailureArchive(handle).failureCode, null);
  retainedFault(handle, () => verifyFixtureFailureArchive(handle, {}));
});

test('duplicate publication cannot replace even identical own known bytes', () => {
  const handle = archive();
  const bytes = Buffer.from('exact original bytes');
  writeFixtureFailureArchive(handle, 'postgres.log', bytes);
  const before = lstatSync(path(handle), { bigint: true });
  retainedFault(handle, () =>
    writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from(bytes)),
  );
  assert.deepEqual(lstatSync(path(handle), { bigint: true }), before);
  assert.deepEqual(readFileSync(path(handle)), bytes);
});

test('an initial preexisting identical body is never adopted, removed or overwritten', () => {
  const handle = archive();
  const bytes = Buffer.from('same bytes do not establish provenance');
  writeFileSync(path(handle), bytes, { mode: 0o600, flag: 'wx' });
  const before = lstatSync(path(handle), { bigint: true });
  const result = retainedFault(handle, () =>
    writeFixtureFailureArchive(handle, 'postgres.log', bytes),
  );
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.partialFiles, []);
  assert.deepEqual(lstatSync(path(handle), { bigint: true }), before);
  assert.deepEqual(readFileSync(path(handle)), bytes);
});

for (const mode of [0o400, 0o640, 0o644, 0o1600])
  test(`a published member changed to actual mode${mode.toString(8)} is refused permanently`, () => {
    const handle = archive();
    writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('original'));
    chmodSync(path(handle), mode);
    retainedFault(handle, () => verifyFixtureFailureArchive(handle));
    chmodSync(path(handle), 0o600);
    assert.throws(() => verifyFixtureFailureArchive(handle), sticky);
  });

for (const [label, change] of [
  [
    'same-size changed bytes with restored mtime',
    (file) => {
      const old = lstatSync(file);
      writeFileSync(file, 'changed!');
      utimesSync(file, old.atime, old.mtime);
    },
  ],
  [
    'identical replacement inode',
    (file) => {
      const next = `${file}.replacement`;
      writeFileSync(next, 'original', { mode: 0o600 });
      renameSync(next, file);
    },
  ],
  ['hardlink', (file) => linkSync(file, `${file}.link`)],
  [
    'symlink replacement',
    (file) => {
      renameSync(file, `${file}.saved`);
      symlinkSync(`${file}.saved`, file);
    },
  ],
  ['missing member', (file) => rmSync(file)],
  ['unexpected file', (file) => writeFileSync(`${file}.extra`, 'extra', { mode: 0o600 })],
  ['unexpected directory', (file) => mkdirSync(`${file}.extra`, { mode: 0o700 })],
])
  test(`actual ${label} is refused with historical sealed rows preserved`, () => {
    const handle = archive();
    const row = writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('original'));
    change(path(handle));
    const result = retainedFault(handle, () => verifyFixtureFailureArchive(handle));
    assert.deepEqual(result.files, [row]);
    assert.deepEqual(result.partialFiles, []);
  });

test('actual root replacement cannot acquire prior authority after exact path restoration', () => {
  const handle = archive();
  const directory = snapshotFixtureFailureArchive(handle).directory;
  const saved = `${directory}.saved`;
  writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('original'));
  renameSync(directory, saved);
  mkdirSync(directory, { mode: 0o700 });
  try {
    assert.throws(() => verifyFixtureFailureArchive(handle), fault);
    assert.equal(snapshotFixtureFailureArchive(handle).directoryOutcome, 'UNKNOWN');
  } finally {
    rmSync(directory, { recursive: true });
    renameSync(saved, directory);
  }
  assert.equal(snapshotFixtureFailureArchive(handle).directoryOutcome, 'RETAINED');
  assert.throws(() => verifyFixtureFailureArchive(handle), sticky);
  assert.deepEqual(readFileSync(path(handle)), Buffer.from('original'));
});

test('actual root mode restoration retains the fault and cannot authorize successor publication', () => {
  const handle = archive();
  const directory = snapshotFixtureFailureArchive(handle).directory;
  chmodSync(directory, 0o750);
  try {
    assert.throws(() => verifyFixtureFailureArchive(handle), fault);
    assert.equal(snapshotFixtureFailureArchive(handle).directoryOutcome, 'UNKNOWN');
  } finally {
    chmodSync(directory, 0o700);
  }
  assert.equal(snapshotFixtureFailureArchive(handle).directoryOutcome, 'RETAINED');
  assert.throws(() => writeFixtureFailureArchive(handle, 'cleanup.json', Buffer.from('x')), sticky);
});

const childPath = fileURLToPath(
  new URL('./support/http-fixture-failure-archive-child.mjs', import.meta.url),
);
for (const kind of ['file-size', 'ancestor', 'descriptors'])
  test(`actual separate process ${kind} fault retains bytes and closes acquired descriptors`, () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'stynx archive child ')));
    owned.add(parent);
    const environment = { ...process.env, TMPDIR: parent };
    const options = { env: environment, encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 };
    const child =
      kind === 'ancestor'
        ? spawnSync(process.execPath, [childPath, kind], options)
        : spawnSync(
            '/bin/zsh',
            [
              '-c',
              kind === 'file-size'
                ? 'ulimit -f 2; exec "$1" "$2" file-size'
                : 'ulimit -n 64; exec "$1" "$2" descriptors',
              'archive-fault',
              process.execPath,
              childPath,
            ],
            options,
          );
    assert.equal(child.error, undefined);
    assert.equal(child.signal, null, child.stderr);
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.directoryOutcome, 'RETAINED');
    assert.equal(result.runtimeCustodyComplete, false);
    assert.equal(result.performanceQualified, false);
    assert.equal(result.readinessPromoting, false);
    assert.equal(realpathSync(result.directory).startsWith(`${parent}/`), true);
    if (kind === 'file-size') {
      assert.equal(result.actualPartialBytes, 1024);
      assert.equal(readFileSync(join(result.directory, 'postgres.log')).length, 1024);
      assert.deepEqual(result.partialFiles, ['postgres.log']);
    }
  });

test('repeated real verification closes all native descriptors and leaves file metadata unchanged', () => {
  const handle = archive();
  writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('original'));
  const probe = () => {
    const fd = openSync('/dev/null', 'r');
    closeSync(fd);
    return fd;
  };
  const before = probe();
  const identity = lstatSync(path(handle), { bigint: true });
  for (let index = 0; index < 100; index++) verifyFixtureFailureArchive(handle);
  assert.equal(probe(), before);
  const final = lstatSync(path(handle), { bigint: true });
  for (const key of ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    assert.equal(final[key], identity[key], key);
});

test('actual archive deletion is reported UNKNOWN without inventing private cleanup authority', () => {
  const handle = archive();
  const row = writeFixtureFailureArchive(handle, 'capture.json', Buffer.from('historical body'));
  const directory = snapshotFixtureFailureArchive(handle).directory;
  rmSync(directory, { recursive: true });
  const before = snapshotFixtureFailureArchive(handle);
  assert.equal(before.directoryOutcome, 'UNKNOWN');
  assert.deepEqual(before.files, [row]);
  assert.equal(before.failureCode, null);
  assert.throws(() => verifyFixtureFailureArchive(handle), fault);
  const after = snapshotFixtureFailureArchive(handle);
  assert.equal(after.directoryOutcome, 'UNKNOWN');
  assert.deepEqual(after.files, [row]);
  assert.equal(after.failureCode, 'HTTP_FIXTURE_FAILURE_ARCHIVE_IO');
  assert.throws(() => verifyFixtureFailureArchive(handle), sticky);
});
