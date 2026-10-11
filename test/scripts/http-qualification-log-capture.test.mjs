import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
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
import { captureHttpQualificationGeneratorLogs } from '../../scripts/lib/http-qualification-log-capture.mjs';

// INV-PERF-001: actual exclusive log files and failure preservation only. These
// buffers contain no native/application evidence and confer no cleanup authority.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx capture espaço 日本語 ')));
after(() => rmSync(root, { recursive: true, force: true }));
const invalid = { code: 'HTTP_QUALIFICATION_LOG_CAPTURE_INVALID' };
const incomplete = 'HTTP_QUALIFICATION_LOG_CAPTURE_INCOMPLETE';
const hash = (b) => createHash('sha256').update(b).digest('hex');
function directory() {
  const path = join(root, randomUUID());
  mkdirSync(path, { mode: 0o700 });
  return path;
}
function target(dir, id, stream) {
  return join(dir, `${id}.${stream}.log`);
}

test('actual log capture writes exact binary0600 files and keeps every admission flag false', () => {
  const dir = directory(),
    id = randomUUID();
  const stdout = [Buffer.from([0, 255]), Buffer.from('actual stdout\n')];
  const stderr = [Buffer.from('actual stderr\n')];
  const result = captureHttpQualificationGeneratorLogs(dir, id, stdout, stderr);
  assert.equal(result.scope, 'qualification-generator-log-byte-capture-component');
  assert.equal(result.captureComplete, true);
  for (const flag of [
    'complete',
    'runtimeCustodyComplete',
    'performanceQualified',
    'readinessPromoting',
  ])
    assert.equal(result[flag], false);
  for (const [stream, chunks] of [
    ['stdout', stdout],
    ['stderr', stderr],
  ]) {
    const bytes = Buffer.concat(chunks),
      path = target(dir, id, stream);
    assert.deepEqual(readFileSync(path), bytes);
    assert.equal(lstatSync(path).mode & 0o7777, 0o600);
    assert.equal(lstatSync(path).nlink, 1);
    assert.equal(lstatSync(path).uid, process.getuid());
    const row = result.captured.find((r) => r.stream === stream);
    assert.deepEqual(row, { stream, path, byteLength: bytes.length, sha256: hash(bytes) });
  }
  assert.deepEqual(stdout, [Buffer.from([0, 255]), Buffer.from('actual stdout\n')]);
  assert.deepEqual(stderr, [Buffer.from('actual stderr\n')]);
});

test('empty stdout/stderr are still independently persisted as real files', () => {
  const dir = directory(),
    id = randomUUID();
  const result = captureHttpQualificationGeneratorLogs(dir, id, [], []);
  assert.equal(result.captured.length, 2);
  for (const stream of ['stdout', 'stderr']) {
    assert.equal(readFileSync(target(dir, id, stream)).length, 0);
    assert.equal(lstatSync(target(dir, id, stream)).mode & 0o7777, 0o600);
  }
});

for (const first of ['stdout', 'stderr'])
  test(`actual ${first} collision cannot bypass capture of the other stream`, () => {
    const dir = directory(),
      id = randomUUID(),
      other = first === 'stdout' ? 'stderr' : 'stdout';
    writeFileSync(target(dir, id, first), 'original preserved', { mode: 0o600 });
    assert.throws(
      () =>
        captureHttpQualificationGeneratorLogs(
          dir,
          id,
          [Buffer.from('stdout failure retained')],
          [Buffer.from('stderr failure retained')],
        ),
      (error) => {
        assert.equal(error.code, incomplete);
        assert.deepEqual(error.failures, [{ stream: first, code: 'EEXIST' }]);
        assert.equal(error.captured.length, 1);
        assert.equal(error.captured[0].stream, other);
        return true;
      },
    );
    assert.equal(readFileSync(target(dir, id, first), 'utf8'), 'original preserved');
    assert.equal(readFileSync(target(dir, id, other), 'utf8'), `${other} failure retained`);
  });

test('two actual collisions retain both failures and every original byte', () => {
  const dir = directory(),
    id = randomUUID();
  for (const stream of ['stdout', 'stderr'])
    writeFileSync(target(dir, id, stream), stream, { mode: 0o600 });
  assert.throws(
    () => captureHttpQualificationGeneratorLogs(dir, id, [], []),
    (error) => {
      assert.equal(error.code, incomplete);
      assert.deepEqual(error.failures, [
        { stream: 'stdout', code: 'EEXIST' },
        { stream: 'stderr', code: 'EEXIST' },
      ]);
      assert.deepEqual(error.captured, []);
      return true;
    },
  );
  for (const stream of ['stdout', 'stderr'])
    assert.equal(readFileSync(target(dir, id, stream), 'utf8'), stream);
});

test('actual symlink at stdout preserves its target while stderr is durably captured', () => {
  const dir = directory(),
    id = randomUUID(),
    original = join(dir, 'original');
  writeFileSync(original, 'do not replace', { mode: 0o600 });
  symlinkSync(original, target(dir, id, 'stdout'));
  assert.throws(
    () =>
      captureHttpQualificationGeneratorLogs(dir, id, [Buffer.from('x')], [Buffer.from('stderr')]),
    { code: incomplete },
  );
  assert.equal(readFileSync(original, 'utf8'), 'do not replace');
  assert.equal(lstatSync(target(dir, id, 'stdout')).isSymbolicLink(), true);
  assert.equal(readFileSync(target(dir, id, 'stderr'), 'utf8'), 'stderr');
});

test('actual nonregular stdout collision still captures stderr', () => {
  const dir = directory(),
    id = randomUUID();
  mkdirSync(target(dir, id, 'stdout'), { mode: 0o700 });
  assert.throws(
    () => captureHttpQualificationGeneratorLogs(dir, id, [], [Buffer.from('retained')]),
    { code: incomplete },
  );
  assert.equal(lstatSync(target(dir, id, 'stdout')).isDirectory(), true);
  assert.equal(readFileSync(target(dir, id, 'stderr'), 'utf8'), 'retained');
});

test('unsafe actual directory mode refuses both streams without publishing files', () => {
  const dir = directory(),
    id = randomUUID();
  chmodSync(dir, 0o755);
  assert.throws(() => captureHttpQualificationGeneratorLogs(dir, id, [], []), { code: incomplete });
  assert.deepEqual(readdirSync(dir), []);
});

for (const id of ['', '../escape', '00000000-0000-0000-0000-000000000000', 'a'.repeat(36)])
  test(`unsafe fixed log identity ${JSON.stringify(id)} refuses before publication`, () => {
    const dir = directory();
    assert.throws(() => captureHttpQualificationGeneratorLogs(dir, id, [], []), invalid);
    assert.deepEqual(readdirSync(dir), []);
  });

test('chunk inputs refuse nonnative/shared/proxy/accessor/sparse buffers without publication or invocation', () => {
  const dir = directory();
  let calls = 0;
  const accessor = [];
  Object.defineProperty(accessor, 0, {
    get() {
      calls++;
      return Buffer.from('x');
    },
    enumerable: true,
  });
  const proxy = new Proxy([Buffer.from('x')], {
    ownKeys() {
      calls++;
      return ['0', 'length'];
    },
  });
  for (const chunks of [
    [new Uint8Array([1])],
    [Buffer.from(new SharedArrayBuffer(1))],
    accessor,
    proxy,
    new Array(1),
    null,
    {},
  ]) {
    assert.throws(
      () => captureHttpQualificationGeneratorLogs(dir, randomUUID(), chunks, []),
      invalid,
    );
    assert.deepEqual(readdirSync(dir), []);
  }
  assert.equal(calls, 0);
});

test('exact64MiB total is captured intact while limit+1 refuses before either file', () => {
  const dir = directory(),
    id = randomUUID(),
    bytes = Buffer.alloc(64 * 1024 * 1024, 7);
  const result = captureHttpQualificationGeneratorLogs(dir, id, [bytes], []);
  assert.equal(result.captured[0].byteLength, bytes.length);
  assert.equal(hash(readFileSync(target(dir, id, 'stdout'))), hash(bytes));
  const rejected = directory();
  assert.throws(
    () =>
      captureHttpQualificationGeneratorLogs(rejected, randomUUID(), [bytes], [Buffer.from([1])]),
    invalid,
  );
  assert.deepEqual(readdirSync(rejected), []);
});

test('closed invocation refuses missing/additional arguments', () => {
  const dir = directory(),
    id = randomUUID();
  assert.throws(() => captureHttpQualificationGeneratorLogs(dir, id, []), invalid);
  assert.throws(() => captureHttpQualificationGeneratorLogs(dir, id, [], [], {}), invalid);
  assert.deepEqual(readdirSync(dir), []);
});
