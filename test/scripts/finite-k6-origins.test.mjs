import assert from 'node:assert/strict';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  consumeFiniteK6ArchiveResponse,
  verifyFiniteK6Source,
} from '../../scripts/lib/finite-k6-origins.mjs';

// INV-PERF-001: real component refusals never admit an origin/native profile.
const archive = 'k6-b5328aa782832a80451ea430075af8845dffb7cd.tar.gz';
const archiveBytes = 9777400;
function directory(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx finite origem espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('streamed actual directory census permits10000 entries and refuses10001 before a manifest claim', (t) => {
  const root = directory(t);
  for (let index = 0; index < 10000; index++)
    mkdirSync(join(root, `entry-${String(index).padStart(5, '0')}`));
  assert.throws(() => verifyFiniteK6Source(root), /complete source\/vendor manifest differs/u);
  mkdirSync(join(root, 'entry-10000'));
  assert.throws(() => verifyFiniteK6Source(root), /source entry count exceeds bound/u);
  assert.equal(readdirSync(root).length, 10001);
});

test('actual directory depth32 is scanned and depth33 refuses with every native handle closed', (t) => {
  const root = directory(t);
  let deepest = root;
  for (let depth = 1; depth <= 32; depth++) {
    deepest = join(deepest, `nível-${depth}`);
    mkdirSync(deepest);
  }
  assert.throws(() => verifyFiniteK6Source(root), /complete source\/vendor manifest differs/u);
  mkdirSync(join(deepest, 'depth33'));
  const descriptors = readdirSync('/dev/fd').length;
  for (let index = 0; index < 20; index++)
    assert.throws(() => verifyFiniteK6Source(root), /source directory depth exceeds bound/u);
  assert.equal(readdirSync('/dev/fd').length, descriptors);
});

test('actual symlink and hardlink members remain refused during streamed traversal', (t) => {
  const root = directory(t);
  const target = join(root, 'actual-bytes');
  writeFileSync(target, 'immutable component-negative bytes');
  symlinkSync(target, join(root, 'symlink'));
  assert.throws(
    () => verifyFiniteK6Source(root),
    /source contains a symlink or unsupported entry/u,
  );
  rmSync(join(root, 'symlink'));
  linkSync(target, join(root, 'hardlink'));
  assert.throws(
    () => verifyFiniteK6Source(root),
    /file kind, hard-link count or byte bound differs/u,
  );
});

async function actualResponse(
  t,
  { status = 200, headers = {}, bytes = Buffer.from('x'), hold = false } = {},
) {
  let requests = 0;
  let actualServerResponse;
  let closed;
  const disconnected = new Promise((resolve) => {
    closed = resolve;
  });
  const server = createServer((_request, response) => {
    requests++;
    actualServerResponse = response;
    response.once('close', closed);
    response.writeHead(status, headers);
    if (hold) response.write(bytes);
    else response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/component-only`);
  return {
    response,
    disconnected,
    requests: () => requests,
    finish: () => actualServerResponse.end(),
  };
}

async function requireDisconnect(disconnected) {
  let timer;
  try {
    await Promise.race([
      disconnected,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('actual refused HTTP stream remained open')),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

for (const [name, options, refusal] of [
  ['status', { status: 503, hold: true }, /archive HTTP response differs/u],
  [
    'declared byte count',
    { headers: { 'content-length': '123' }, hold: true },
    /archive declared byte count differs/u,
  ],
  [
    'encoding',
    { headers: { 'content-encoding': 'identity' }, hold: true },
    /encoded archive response refused/u,
  ],
])
  test(`actual HTTP ${name} refusal cancels the still-open body before any partial file exists`, async (t) => {
    const root = directory(t);
    const part = join(root, `${archive}.part`);
    const fixture = await actualResponse(t, options);
    await assert.rejects(consumeFiniteK6ArchiveResponse(fixture.response, archive, part), refusal);
    await requireDisconnect(fixture.disconnected);
    assert.equal(fixture.requests(), 1);
    assert.equal(existsSync(part), false);
    assert.deepEqual(readdirSync(root), []);
  });

test('actual Response own getters cannot replace captured status/body/header access or prevent refusal cleanup', async (t) => {
  const root = directory(t);
  const fixture = await actualResponse(t, { status: 503, hold: true });
  let invoked = 0;
  for (const name of ['body', 'status', 'headers'])
    Object.defineProperty(fixture.response, name, {
      get() {
        invoked++;
        throw new Error('caller getter must not execute');
      },
    });
  await assert.rejects(
    consumeFiniteK6ArchiveResponse(fixture.response, archive, join(root, `${archive}.part`)),
    /archive HTTP response differs/u,
  );
  await requireDisconnect(fixture.disconnected);
  assert.equal(invoked, 0);
  assert.equal(fixture.requests(), 1);
  assert.deepEqual(readdirSync(root), []);
});

test('real truncated and wrong-digest streams remove the actual exclusive partial file', async (t) => {
  const root = directory(t);
  for (const bytes of [Buffer.from('short actual response'), Buffer.alloc(archiveBytes, 0)]) {
    const fixture = await actualResponse(t, {
      bytes,
      hold: true,
      headers: { 'transfer-encoding': 'chunked' },
    });
    const part = join(root, `${archive}.part`);
    const consuming = consumeFiniteK6ArchiveResponse(fixture.response, archive, part);
    const deadline = Date.now() + 5000;
    while (!existsSync(part) && Date.now() < deadline)
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      existsSync(part),
      true,
      'real exclusive partial file exists before the controlled response ends',
    );
    fixture.finish();
    await assert.rejects(consuming, /archive digest\/byte count differs/u);
    assert.equal(existsSync(part), false);
    assert.deepEqual(readdirSync(root), []);
    assert.equal(fixture.requests(), 1);
  }
});

test('actual chunked overflow refuses without publishing or retaining oversized archive bytes', async (t) => {
  const root = directory(t);
  const fixture = await actualResponse(t, {
    bytes: Buffer.alloc(archiveBytes + 1, 0),
    headers: { 'transfer-encoding': 'chunked' },
  });
  const part = join(root, `${archive}.part`);
  await assert.rejects(
    consumeFiniteK6ArchiveResponse(fixture.response, archive, part),
    /archive stream exceeds bound/u,
  );
  assert.equal(fixture.requests(), 1);
  assert.equal(existsSync(part), false);
  assert.deepEqual(readdirSync(root), []);
});

test('caller archive names and sink paths cannot replace an internal pin and still cancel actual bodies', async (t) => {
  const root = directory(t);
  for (const [name, sink, refusal] of [
    [
      'caller-supplied.tar.gz',
      join(root, 'caller-supplied.tar.gz.part'),
      /unknown internally pinned archive/u,
    ],
    [archive, join(root, 'unbound.part'), /archive sink name differs/u],
    [archive, './relative.part', /use a canonical absolute path/u],
  ]) {
    const fixture = await actualResponse(t, { hold: true });
    await assert.rejects(consumeFiniteK6ArchiveResponse(fixture.response, name, sink), refusal);
    await requireDisconnect(fixture.disconnected);
    assert.equal(fixture.requests(), 1);
    assert.deepEqual(readdirSync(root), []);
  }
});

test('actual locked native response makes cancellation failure sticky and never creates an admitted archive', async (t) => {
  const root = directory(t);
  const fixture = await actualResponse(t, { status: 503, hold: true });
  const reader = fixture.response.body.getReader();
  try {
    await assert.rejects(
      consumeFiniteK6ArchiveResponse(fixture.response, archive, join(root, `${archive}.part`)),
      (error) => {
        assert.equal(error instanceof AggregateError, true);
        assert.equal(error.errors.length, 2);
        assert.match(error.errors[0].message, /archive HTTP response differs/u);
        assert.equal(error.errors[1] instanceof TypeError, true);
        assert.match(error.message, /cancellation failed; archive remains refused/u);
        return true;
      },
    );
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  await requireDisconnect(fixture.disconnected);
  assert.equal(fixture.requests(), 1);
  assert.deepEqual(readdirSync(root), []);
});

test('actual exclusive sink collision preserves prior bytes while cancelling the refused body', async (t) => {
  const root = directory(t);
  const part = join(root, `${archive}.part`);
  writeFileSync(part, 'prior owner bytes');
  const fixture = await actualResponse(t, {
    hold: true,
    headers: { 'transfer-encoding': 'chunked' },
  });
  await assert.rejects(consumeFiniteK6ArchiveResponse(fixture.response, archive, part), {
    code: 'EEXIST',
  });
  await requireDisconnect(fixture.disconnected);
  assert.equal(fixture.requests(), 1);
  assert.equal(readFileSync(part, 'utf8'), 'prior owner bytes');
});
