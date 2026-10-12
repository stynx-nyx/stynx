import assert from 'node:assert/strict';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  createFixtureFailureArchive,
  snapshotFixtureFailureArchive,
  verifyFixtureFailureArchive,
  writeFixtureFailureArchive,
} from '../../../scripts/lib/http-fixture-failure-archive.mjs';

// INV-PERF-001: separate real process/OS-limit and ancestor fault boundary.
const handle = createFixtureFailureArchive();
const initial = snapshotFixtureFailureArchive(handle);
const nextDescriptor = () => {
  const fd = openSync('/dev/null', 'r');
  closeSync(fd);
  return fd;
};
if (process.argv[2] === 'file-size') process.on('SIGXFSZ', () => {});
const before = nextDescriptor();
if (process.argv[2] === 'file-size') {
  assert.throws(() => writeFixtureFailureArchive(handle, 'postgres.log', Buffer.alloc(4096, 42)), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_FAULT',
  });
  const result = snapshotFixtureFailureArchive(handle);
  assert.equal(result.failureCode, 'HTTP_FIXTURE_FAILURE_ARCHIVE_IO');
  assert.deepEqual(result.partialFiles, ['postgres.log']);
  assert.deepEqual(result.files, []);
  assert.equal(result.directoryOutcome, 'RETAINED');
  const actual = readFileSync(join(result.directory, 'postgres.log'));
  assert.equal(actual.length, 1024);
  assert.equal(
    actual.every((byte) => byte === 42),
    true,
  );
  assert.throws(() => verifyFixtureFailureArchive(handle), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_STICKY_FAULT',
  });
  assert.equal(nextDescriptor(), before);
  console.log(JSON.stringify({ ...result, actualPartialBytes: actual.length }));
} else if (process.argv[2] === 'descriptors') {
  const bytes = Buffer.from('historical complete body');
  writeFixtureFailureArchive(handle, 'postgres.log', bytes);
  const descriptors = [];
  try {
    for (;;) descriptors.push(openSync('/dev/null', 'r'));
  } catch (error) {
    assert.equal(error.code, 'EMFILE');
  }
  // Leave two slots, so actual ancestor acquisition succeeds partially and then
  // fails. The production finally must close both acquired directory FDs.
  for (let index = 0; index < 2; index++) closeSync(descriptors.pop());
  try {
    assert.throws(() => writeFixtureFailureArchive(handle, 'cleanup.json', Buffer.from('later')), {
      code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_FAULT',
    });
  } finally {
    for (const fd of descriptors) closeSync(fd);
  }
  const result = snapshotFixtureFailureArchive(handle);
  assert.equal(result.failureCode, 'HTTP_FIXTURE_FAILURE_ARCHIVE_IO');
  assert.deepEqual(result.partialFiles, []);
  assert.deepEqual(
    result.files.map(({ path }) => path),
    ['postgres.log'],
  );
  assert.deepEqual(readFileSync(join(result.directory, 'postgres.log')), bytes);
  assert.throws(() => verifyFixtureFailureArchive(handle), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_STICKY_FAULT',
  });
  assert.equal(nextDescriptor(), before);
  console.log(JSON.stringify(result));
} else if (process.argv[2] === 'ancestor') {
  writeFixtureFailureArchive(handle, 'postgres.log', Buffer.from('retained original bytes'));
  const parent = dirname(initial.directory);
  const saved = `${parent}-saved`;
  renameSync(parent, saved);
  mkdirSync(parent, { mode: 0o700 });
  const replacement = join(parent, basename(initial.directory));
  mkdirSync(replacement, { mode: 0o700 });
  writeFileSync(join(replacement, 'postgres.log'), 'retained original bytes', { mode: 0o600 });
  try {
    assert.throws(() => verifyFixtureFailureArchive(handle), {
      code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_FAULT',
    });
    assert.equal(snapshotFixtureFailureArchive(handle).directoryOutcome, 'UNKNOWN');
  } finally {
    rmSync(parent, { recursive: true });
    renameSync(saved, parent);
  }
  const result = snapshotFixtureFailureArchive(handle);
  assert.equal(result.directoryOutcome, 'RETAINED');
  assert.equal(result.failureCode, 'HTTP_FIXTURE_FAILURE_ARCHIVE_IDENTITY');
  assert.deepEqual(
    readFileSync(join(result.directory, 'postgres.log')),
    Buffer.from('retained original bytes'),
  );
  assert.throws(() => verifyFixtureFailureArchive(handle), {
    code: 'HTTP_FIXTURE_FAILURE_ARCHIVE_STICKY_FAULT',
  });
  assert.equal(nextDescriptor(), before);
  console.log(JSON.stringify(result));
} else {
  throw new Error('Unknown finite archive fault boundary');
}
