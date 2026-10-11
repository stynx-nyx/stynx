import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createHttpBuildSupportArchive as create,
  exportHttpBuildSupportArchive as capture,
  snapshotHttpBuildSupportArchive as snapshot,
} from '../../scripts/lib/http-build-support.mjs';

// INV-PERF-001, ADR-SCR-0027: actual structural custody only. These files do
// not attest source approval, native lifetime, protected admission or cleanup.
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cap = 64 * 1024 * 1024;
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx custody espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'),
    raw = join(root, 'raw');
  for (const path of [source, raw]) mkdirSync(path, { mode: 0o700 });
  return { root, source, raw, handle: create(raw) };
}
function member(path) {
  const canonical = realpathSync(path),
    stat = lstatSync(canonical);
  return {
    path,
    canonical,
    sha256: sha(readFileSync(canonical)),
    byteLength: stat.size,
    permissions: stat.mode & 0o7777,
  };
}
function retained(result) {
  const indexBytes = readFileSync(join(result.root, 'index.json'));
  assert.equal(sha(indexBytes), result.receipt.sha256);
  assert.equal(indexBytes.length, result.receipt.byteLength);
  const index = JSON.parse(indexBytes);
  assert.equal(JSON.stringify(index), indexBytes.toString());
  const rows = [];
  for (const [pageNumber, page] of index.pages.entries()) {
    assert.equal(page.name, `page-${String(pageNumber).padStart(8, '0')}.json`);
    const bytes = readFileSync(join(result.root, page.name));
    assert.equal(bytes.length, page.byteLength);
    assert.equal(sha(bytes), page.sha256);
    const entries = JSON.parse(bytes);
    assert.equal(JSON.stringify(entries), bytes.toString());
    assert.ok(entries.length > 0 && entries.length <= 256);
    rows.push(...entries);
  }
  let total = 0;
  for (const row of rows.filter((entry) => ['file', 'external-file'].includes(entry.kind))) {
    const bodies = row.chunks.map((chunk, ordinal) => {
      assert.equal(Number(chunk.name.slice(9, 17)), ordinal);
      const bytes = readFileSync(join(result.root, chunk.name));
      assert.ok(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024);
      assert.equal(bytes.length, chunk.byteLength);
      assert.equal(sha(bytes), chunk.sha256);
      assert.equal(lstatSync(join(result.root, chunk.name)).mode & 0o7777, 0o600);
      return bytes;
    });
    const bytes = Buffer.concat(bodies);
    assert.equal(bytes.length, row.byteLength);
    assert.equal(sha(bytes), row.sha256);
    assert.equal(row.completeDescriptorEof, true);
    total += bytes.length;
  }
  assert.equal(rows.length, index.sourceEntries + index.externalEntries);
  assert.equal(total, index.totalBytes);
  for (const key of [
    'sourceOriginVerified',
    'runtimeCustodyComplete',
    'cleanupComplete',
    'readinessPromoting',
  ])
    assert.equal(index[key], false);
  return rows;
}
function refused(f, external = []) {
  assert.throws(() => capture(f.handle, f.source, external));
  const observed = snapshot(f.handle);
  assert.equal(observed.completeSourcePopulation, false);
  assert.equal(observed.readinessPromoting, false);
  assert.ok(observed.failure);
  assert.ok(existsSync(f.source));
  assert.throws(() => capture(f.handle, f.source, []), /closed|replayed/u);
  return observed;
}

test('actual paged census retains Unicode, empty directories, relative links, hardlinks, modes and complete chunk bodies', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.source, 'empty 日本語'));
  writeFileSync(join(f.source, 'zero'), '');
  const body = Buffer.alloc(8 * 1024 * 1024 + 17, 0x73);
  writeFileSync(join(f.source, 'espaço'), body, { mode: 0o640 });
  linkSync(join(f.source, 'espaço'), join(f.source, 'hard'));
  symlinkSync('espaço', join(f.source, 'relative'));
  for (let i = 0; i < 260; i++) writeFileSync(join(f.source, `entry-${i}`), String(i));
  const before = lstatSync(join(f.source, 'espaço'), { bigint: true });
  const result = capture(f.handle, f.source, []),
    rows = retained(result);
  assert.equal(result.pages.length, 2);
  assert.equal(result.sourceEntries, 266);
  assert.equal(rows.find((row) => row.path === 'empty 日本語').kind, 'directory');
  assert.deepEqual(rows.find((row) => row.path === 'zero').chunks, []);
  const original = rows.find((row) => row.path === 'espaço'),
    hard = rows.find((row) => row.path === 'hard');
  assert.equal(original.chunks.length, 2);
  assert.equal(original.permissions, 0o640);
  assert.equal(original.identity.ino, hard.identity.ino);
  assert.equal(original.identity.nlink, '2');
  assert.equal(rows.find((row) => row.path === 'relative').target, 'espaço');
  assert.equal(readlinkSync(join(f.source, 'relative')), 'espaço');
  const after = lstatSync(join(f.source, 'espaço'), { bigint: true });
  for (const key of ['dev', 'ino', 'mode', 'size', 'ctimeNs', 'mtimeNs', 'nlink'])
    assert.equal(after[key], before[key]);
  assert.deepEqual(readFileSync(join(f.source, 'espaço')), body);
  assert.equal(snapshot(f.handle).completeSourcePopulation, true);
});

test('actual external body, alias link and full ancestors reconcile without executing it', (t) => {
  const f = fixture(t),
    tool = join(f.root, 'tool'),
    alias = join(f.root, 'tool-alias');
  writeFileSync(tool, 'not an executable', { mode: 0o640 });
  symlinkSync('tool', alias);
  const row = retained(capture(f.handle, f.source, [member(alias)])).find(
    (entry) => entry.kind === 'external-file',
  );
  assert.equal(row.aliasTarget, 'tool');
  assert.equal(row.role, 'ordinary');
  assert.equal(row.path, alias);
  assert.equal(row.canonical, tool);
  assert.equal(row.aliasAncestors[0].path, f.root);
  assert.equal(row.sourceAncestors[0].path, f.root);
  assert.equal(row.permissions, 0o640);
});

test('64 MiB ordinary boundary is retained in eight chunks', (t) => {
  const f = fixture(t),
    path = join(f.source, 'boundary');
  writeFileSync(path, '');
  truncateSync(path, cap);
  const row = retained(capture(f.handle, f.source, [])).find((entry) => entry.path === 'boundary');
  assert.equal(row.role, 'ordinary');
  assert.equal(row.chunks.length, 8);
});
for (const name of ['ordinary', 'node', 'toolchain/bin/node'])
  test(`actual oversized ${name} cannot borrow metrics/interpreter role`, (t) => {
    const f = fixture(t),
      path = join(f.source, name);
    if (name.includes('/')) mkdirSync(join(f.source, 'toolchain/bin'), { recursive: true });
    writeFileSync(path, '');
    truncateSync(path, cap + 1);
    refused(f);
    assert.equal(lstatSync(path).size, cap + 1);
  });

test('actual exact interpreter and private-copy pair receives only the fixed nonattesting role', (t) => {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.arch, 'arm64');
  assert.equal(process.versions.node, '24.20.0');
  const f = fixture(t),
    directory = join(f.source, 'toolchain/bin');
  mkdirSync(directory, { recursive: true });
  copyFileSync(process.execPath, join(directory, 'node'));
  const actual = member(realpathSync(process.execPath));
  assert.equal(actual.byteLength, 121911744);
  assert.equal(actual.sha256, '9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a');
  const rows = retained(capture(f.handle, f.source, [actual]));
  const pair = rows.filter((row) => row.role === 'toolchain-interpreter-body');
  assert.equal(pair.length, 2);
  assert.deepEqual(
    pair.map((row) => row.sha256),
    [actual.sha256, actual.sha256],
  );
});
for (const direction of ['missing actual process', 'missing private copy'])
  test(`interpreter pair refuses ${direction} before retained bodies`, (t) => {
    const f = fixture(t);
    if (direction === 'missing actual process') {
      mkdirSync(join(f.source, 'toolchain/bin'), { recursive: true });
      copyFileSync(process.execPath, join(f.source, 'toolchain/bin/node'));
    }
    const result = refused(
      f,
      direction === 'missing private copy' ? [member(realpathSync(process.execPath))] : [],
    );
    assert.deepEqual(
      result.published.map((row) => row.name),
      ['failure.json'],
    );
  });

for (const [label, setup] of [
  ['absolute link', (f) => symlinkSync(f.root, join(f.source, 'bad'))],
  ['escaping relative link', (f) => symlinkSync('..', join(f.source, 'bad'))],
  ['dangling link', (f) => symlinkSync('absent', join(f.source, 'bad'))],
  [
    'over-depth tree',
    (f) => mkdirSync(join(f.source, ...Array(65).fill('x')), { recursive: true }),
  ],
  ['nonprivate source root', (f) => chmodSync(f.source, 0o755)],
])
  test(`actual ${label} refuses and retains the source`, (t) => {
    const f = fixture(t);
    setup(f);
    refused(f);
  });

test('a late wrong external hash preserves prior complete chunks and a noncomplete diagnostic prefix', (t) => {
  const f = fixture(t),
    path = join(f.root, 'external');
  writeFileSync(join(f.source, 'first'), 'source retained');
  writeFileSync(path, 'tool retained');
  const row = member(path);
  row.sha256 = 'f'.repeat(64);
  const observed = refused(f, [row]);
  assert.ok(observed.published.some((entry) => entry.name.endsWith('.part')));
  assert.ok(observed.published.some((entry) => entry.name === 'failure.json'));
  assert.equal(existsSync(join(observed.root, 'index.json')), false);
  assert.equal(readFileSync(join(f.source, 'first'), 'utf8'), 'source retained');
  assert.equal(readFileSync(path, 'utf8'), 'tool retained');
});

for (const collision of ['00000000-00000000.part', 'page-00000000.json', 'index.json'])
  test(`actual publication cannot clobber existing ${collision}`, (t) => {
    const f = fixture(t),
      path = join(snapshot(f.handle).root, collision);
    writeFileSync(join(f.source, 'file'), 'new body');
    writeFileSync(path, 'existing body');
    refused(f);
    assert.equal(readFileSync(path, 'utf8'), 'existing body');
  });

test('completed opaque handle cannot replay or be adopted by another allocation', (t) => {
  const f = fixture(t);
  capture(f.handle, f.source, []);
  assert.throws(() => capture(f.handle, f.source, []), /closed/u);
  assert.throws(() => create(f.raw), /exist/u);
  assert.throws(() => snapshot(Object.freeze(Object.create(null))), /Unknown/u);
  const projection = snapshot(f.handle);
  projection.published.length = 0;
  assert.ok(snapshot(f.handle).published.length > 0);
});

for (const [label, external] of [
  ['hole', () => Array(1)],
  ['extra array property', () => Object.assign([], { extra: 1 })],
  ['proxy array', () => new Proxy([], {})],
  ['proxy row', () => [new Proxy({}, {})]],
  ['extra row field', (f) => [{ ...member(join(f.source, 'file')), role: 'metrics' }]],
  [
    'duplicate path',
    (f) => {
      const row = member(join(f.source, 'file'));
      return [row, row];
    },
  ],
  ['inherited row', () => [Object.create({ path: '/x' })]],
])
  test(`external ${label} is rejected as own-data input`, (t) => {
    const f = fixture(t);
    writeFileSync(join(f.source, 'file'), 'body');
    refused(f, external(f));
  });

test('external getter is rejected without calling attacker code', (t) => {
  const f = fixture(t);
  let invoked = 0;
  const row = { canonical: '/x', sha256: '1'.repeat(64), byteLength: 0, permissions: 0o600 };
  Object.defineProperty(row, 'path', {
    enumerable: true,
    get() {
      invoked++;
      throw new Error('getter');
    },
  });
  refused(f, [row]);
  assert.equal(invoked, 0);
});

test('exact arity and opaque identity are enforced before structural effects', (t) => {
  const f = fixture(t);
  assert.throws(() => create(f.raw, true), /one absolute/u);
  assert.throws(() => capture(f.handle, f.source, [], true), /one archive/u);
  assert.throws(() => snapshot(f.handle, true), /one actual/u);
  assert.throws(() => capture({}, f.source, []), /Unknown/u);
  assert.equal(snapshot(f.handle).published.length, 0);
  retained(capture(f.handle, f.source, []));
});

test('archive snapshot remains a nonattesting projection after post-export bytes are tampered', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, 'file'), 'before');
  const result = capture(f.handle, f.source, []);
  const row = result.pages[0];
  writeFileSync(join(result.root, row.name), 'tampered');
  assert.notEqual(sha(readFileSync(join(result.root, row.name))), row.sha256);
  const projected = snapshot(f.handle);
  assert.equal(projected.runtimeCustodyComplete, false);
  assert.equal(projected.sourceOriginVerified, false);
  assert.equal(projected.cleanupComplete, false);
  assert.equal(projected.readinessPromoting, false);
  assert.ok(existsSync(f.source));
  assert.ok(readdirSync(result.root).includes('index.json'));
});

for (const change of ['truncate', 'append', 'new source member', 'replace archive ancestor'])
  test(`actual concurrent ${change} refuses complete export and preserves its written prefix`, async (t) => {
    const f = fixture(t);
    writeFileSync(join(f.source, 'a-large'), '');
    truncateSync(join(f.source, 'a-large'), cap);
    writeFileSync(join(f.source, 'z-target'), 'original');
    const archiveRoot = snapshot(f.handle).root;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { existsSync, writeFileSync, appendFileSync, truncateSync, renameSync, mkdirSync } from 'node:fs';
      const [archive, source, raw, change] = process.argv.slice(1);
      const deadline = process.hrtime.bigint() + 5_000_000_000n;
      const sleeper = new Int32Array(new SharedArrayBuffer(4));
      process.stdout.write('ready');
      while (!existsSync(archive + '/00000000-00000000.part')) {
        if (process.hrtime.bigint() >= deadline) process.exit(2);
        Atomics.wait(sleeper, 0, 0, 1);
      }
      if (change === 'truncate') truncateSync(source + '/z-target', 0);
      if (change === 'append') appendFileSync(source + '/z-target', 'changed');
      if (change === 'new source member') writeFileSync(source + '/new', 'changed');
      if (change === 'replace archive ancestor') {
        renameSync(raw, raw + '-retained'); mkdirSync(raw, { mode: 0o700 });
      }
      process.stdout.write('changed');
    `,
        archiveRoot,
        f.source,
        f.raw,
        change,
      ],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '',
      stderr = '';
    child.stdout.on('data', (bytes) => {
      output += bytes.toString();
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes.toString();
    });
    const closed = once(child, 'close');
    await once(child.stdout, 'data');
    assert.match(output, /ready/u);
    let failure;
    try {
      capture(f.handle, f.source, []);
    } catch (error) {
      failure = error;
    }
    const [code, signal] = await closed;
    assert.equal(code, 0, stderr);
    assert.equal(signal, null);
    assert.match(output, /changed/u);
    assert.ok(failure, 'concurrent mutation must refuse, rather than accept altered custody');
    const observed = snapshot(f.handle);
    assert.equal(observed.completeSourcePopulation, false);
    assert.equal(observed.readinessPromoting, false);
    const retainedRoot =
      change === 'replace archive ancestor' ? `${f.raw}-retained/build-support` : archiveRoot;
    assert.ok(readdirSync(retainedRoot).some((name) => name.endsWith('.part')));
    assert.equal(existsSync(join(retainedRoot, 'index.json')), false);
    assert.ok(existsSync(f.source));
  });

test('fixed-size wrong interpreter copy is refused after reading actual bytes; its failed prefix remains', (t) => {
  const f = fixture(t),
    directory = join(f.source, 'toolchain/bin');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'node'), '');
  truncateSync(join(directory, 'node'), 121911744);
  const observed = refused(f, [member(realpathSync(process.execPath))]);
  assert.ok(observed.published.some((entry) => entry.name.endsWith('.part')));
  assert.equal(existsSync(join(observed.root, 'index.json')), false);
});

test('actual sparse physical census over 16 GiB refuses before any body capture', (t) => {
  const f = fixture(t);
  for (let number = 0; number < 257; number++) {
    const path = join(f.source, String(number));
    writeFileSync(path, '');
    truncateSync(path, cap);
  }
  const observed = refused(f);
  assert.deepEqual(
    observed.published.map((row) => row.name),
    ['failure.json'],
  );
  assert.equal(readdirSync(f.source).length, 257);
});

test('external population over 10000 rows is refused without reading arbitrary paths', (t) => {
  const f = fixture(t);
  refused(f, Array(10001).fill(null));
});

test('host filesystem or actual exporter refuses an invalid UTF-8 name without replacement', (t) => {
  const f = fixture(t);
  let hostFailure;
  try {
    writeFileSync(Buffer.concat([Buffer.from(`${f.source}/`), Buffer.from([0xff])]), 'body');
  } catch (error) {
    hostFailure = error;
  }
  if (hostFailure) {
    assert.equal(hostFailure.code, 'EILSEQ');
    assert.deepEqual(readdirSync(f.source), []);
    const result = capture(f.handle, f.source, []);
    assert.equal(result.sourceEntries, 1);
    assert.equal(result.totalBytes, 0);
    assert.equal(result.sourceOriginVerified, false);
    t.diagnostic(
      'Actual host filesystem rejected invalid UTF-8 before exporter traversal; no invalid-name collector acceptance claimed.',
    );
    return;
  }
  const observed = refused(f);
  assert.equal(
    observed.published.some((row) => row.name.endsWith('.part')),
    false,
  );
});

test('raw link targets containing invalid UTF-8 are not silently replaced', (t) => {
  const f = fixture(t);
  symlinkSync(Buffer.from([0xff]), join(f.source, 'link'));
  refused(f);
});

test('archive allocation rejects a nonprivate or linked actual raw root', (t) => {
  const f = fixture(t),
    insecure = join(f.root, 'insecure'),
    alias = join(f.root, 'alias');
  mkdirSync(insecure, { mode: 0o755 });
  symlinkSync(f.raw, alias);
  assert.throws(() => create(insecure), /private owned/u);
  assert.throws(() => create(alias), /private owned/u);
  assert.equal(existsSync(join(insecure, 'build-support')), false);
  capture(f.handle, f.source, []);
});

test('archive and source cannot recursively contain each other', (t) => {
  const f = fixture(t);
  refused({ ...f, source: f.raw });
});

test('interpreter exception refuses a different claimed digest, without borrowing the larger limit', (t) => {
  const f = fixture(t),
    row = member(realpathSync(process.execPath));
  row.sha256 = '0'.repeat(64);
  const observed = refused(f, [row]);
  assert.equal(
    observed.published.some((entry) => entry.name.endsWith('.part')),
    false,
  );
});
