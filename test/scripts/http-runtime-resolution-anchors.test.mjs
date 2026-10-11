import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { createHttpRuntimeProtocol } from '../../scripts/lib/http-runtime-protocol.mjs';
import { createProtocolFixture, moduleFacts } from './support/http-runtime-protocol-fixture.mjs';

const repository = resolve(import.meta.dirname, '../..');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx anchor parser espaço 日本語 ')));
const fixture = createProtocolFixture(repository, root);
const invalid = { code: 'HTTP_RUNTIME_PROTOCOL_INVALID' };
const cleanExit = { code: 0, signal: null };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const targets = ['reflect-metadata', '@nestjs/core'].map((request, index) => {
  const manifest = index ? 'packages/flow/package.json' : 'reference/api/package.json';
  const installed = createRequire(join(repository, manifest)).resolve(request);
  const bytes = readFileSync(installed);
  const file = join(root, 'node_modules/anchor-targets', `${index}.js`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return {
    url: pathToFileURL(file).href,
    sha256: digest(bytes),
    byteLength: bytes.length,
    moduleKind: 'commonjs',
  };
});
after(() => rmSync(root, { recursive: true, force: true }));

// Parser facts only: copied installed targets and exact source/manifests do not
// prove a worker evaluated anything, a resolver used this copy, or a live handle.
function context() {
  const expected = fixture.context();
  expected.bindings.roster.push(...structuredClone(targets));
  return expected;
}
function frame(expected, kind, result) {
  return {
    schemaVersion: 1,
    kind,
    nonce: expected.nonce,
    candidateCommit: expected.candidateCommit,
    pid: expected.pid,
    result,
  };
}
function start(expected) {
  return frame(expected, 'start', {
    mode: expected.mode,
    resolutionAnchors: structuredClone(expected.bindings.resolutionAnchors),
  });
}
function terminal(expected) {
  const modules = moduleFacts(expected);
  // Reference origin can precede census. The flow row requires a real-shaped
  // exact caller byte evaluation predecessor; manifests never enter this list.
  for (const row of modules.evaluations) row.sequence += 3;
  modules.resolutions = expected.bindings.resolutionAnchors.map((anchor, index) => ({
    sequence: index ? 22 : 1,
    specifier: index ? '@nestjs/core' : 'reflect-metadata',
    parentURL: anchor.manifest.url,
    conditions: structuredClone(anchor.conditions),
    url: targets[index].url,
    canonicalURL: targets[index].url,
    builtin: false,
  }));
  return frame(expected, 'terminal', {
    observation: structuredClone(expected.bindings.observation),
    modules,
    trustedBootstrap: structuredClone(expected.bindings.trustedBootstrap),
    readinessPromoting: false,
    runtimeCustodyComplete: false,
  });
}
function refused(expected, bad, first = start(expected)) {
  const protocol = createHttpRuntimeProtocol(expected);
  assert.equal(protocol.receive(first), true);
  assert.equal(protocol.receive(bad), false);
  assert.equal(protocol.receive(terminal(expected)), false);
  assert.throws(() => protocol.finish(cleanExit), invalid);
  assert.equal(protocol.snapshot().refused, true);
  assert.equal(protocol.snapshot().readinessPromoting, false);
  assert.equal(protocol.snapshot().processCustodyQualified, false);
}

test('both exact non-evaluated anchors permit finite parser rows without inventing manifest evaluations', () => {
  const expected = context(),
    value = terminal(expected),
    protocol = createHttpRuntimeProtocol(expected);
  assert.equal(protocol.receive(start(expected)), true);
  assert.equal(protocol.receive(value), true);
  assert.deepEqual(protocol.finish(cleanExit), value.result);
  for (const anchor of expected.bindings.resolutionAnchors) {
    assert.match(anchor.manifest.url, /espa%C3%A7o%20%E6%97%A5%E6%9C%AC%E8%AA%9E/u);
    assert.equal(
      value.result.modules.evaluations.some((row) => row.url === anchor.manifest.url),
      false,
    );
    assert.equal(
      expected.bindings.roster.some((row) => row.url === anchor.manifest.url),
      false,
    );
    assert.equal(anchor.caller.callsite.kind, 'DECLARED_REVIEWED_CALLSITE');
    const text = readFileSync(new URL(anchor.caller.url), 'utf8');
    assert.equal(
      text.slice(anchor.caller.callsite.start, anchor.caller.callsite.end),
      anchor.caller.callsite.literal,
    );
    assert.equal(digest(readFileSync(new URL(anchor.manifest.url))), anchor.manifest.sha256);
  }
  assert.equal(protocol.snapshot().processCustodyQualified, false);
  assert.equal(protocol.snapshot().readinessPromoting, false);
});

const contextMutations = [
  ['missing anchor population', (b) => delete b.resolutionAnchors],
  ['missing one anchor', (b) => b.resolutionAnchors.pop()],
  ['extra anchor', (b) => b.resolutionAnchors.push(structuredClone(b.resolutionAnchors[0]))],
  ['duplicate anchor', (b) => (b.resolutionAnchors[1] = structuredClone(b.resolutionAnchors[0]))],
  ['swapped anchors', (b) => b.resolutionAnchors.reverse()],
  ['unknown anchor field', (b) => (b.resolutionAnchors[0].unreviewed = true)],
  ['wrong classification', (b) => (b.resolutionAnchors[0].classification = 'evaluated')],
  ['foreign candidate', (b) => (b.resolutionAnchors[0].candidateCommit = 'f'.repeat(40))],
  ['foreign tree', (b) => (b.resolutionAnchors[0].tree = 'f'.repeat(40))],
  ['foreign nonce', (b) => (b.resolutionAnchors[0].nonce = '00000000-0000-4000-8000-000000000000')],
  ['wrong manifest SHA', (b) => (b.resolutionAnchors[0].manifest.sha256 = '0'.repeat(64))],
  ['wrong manifest blob', (b) => (b.resolutionAnchors[0].manifest.blob = '0'.repeat(40))],
  ['wrong manifest length', (b) => b.resolutionAnchors[0].manifest.byteLength++],
  ['wrong manifest mode', (b) => (b.resolutionAnchors[0].manifest.mode = '100755')],
  ['wrong manifest permissions', (b) => (b.resolutionAnchors[0].manifest.permissions = 0o755)],
  ['foreign manifest path', (b) => (b.resolutionAnchors[0].manifest.path = '../package.json')],
  [
    'escaped manifest URL',
    (b) => (b.resolutionAnchors[0].manifest.url = pathToFileURL('/foreign/package.json').href),
  ],
  ['URL query alias', (b) => (b.resolutionAnchors[0].manifest.url += '?alias=1')],
  ['malformed manifest URL', (b) => (b.resolutionAnchors[0].manifest.url = 'file://[invalid')],
  ['invalid physical device', (b) => (b.resolutionAnchors[0].manifest.device = -1)],
  ['coerced physical inode', (b) => (b.resolutionAnchors[0].manifest.inode = '1')],
  ['unknown manifest field', (b) => (b.resolutionAnchors[0].manifest.linkTarget = 'elsewhere')],
  ['wrong caller path', (b) => (b.resolutionAnchors[1].caller.path = 'scripts/foreign.mjs')],
  ['wrong caller SHA', (b) => (b.resolutionAnchors[1].caller.sha256 = '0'.repeat(64))],
  ['wrong caller length', (b) => b.resolutionAnchors[1].caller.byteLength++],
  ['wrong trusted caller blob', (b) => (b.resolutionAnchors[0].caller.blob = '0'.repeat(40))],
  ['wrong trusted caller permissions', (b) => (b.resolutionAnchors[0].caller.permissions = 0o600)],
  ['unknown caller field', (b) => (b.resolutionAnchors[0].caller.executed = true)],
  ['wrong literal', (b) => (b.resolutionAnchors[0].caller.callsite.literal += ' ')],
  ['span width drift', (b) => b.resolutionAnchors[0].caller.callsite.end++],
  [
    'span beyond source bytes',
    (b) => {
      const c = b.resolutionAnchors[0].caller;
      c.callsite.start = c.byteLength;
      c.callsite.end = c.byteLength + c.callsite.literal.length;
    },
  ],
  ['unknown callsite field', (b) => (b.resolutionAnchors[0].caller.callsite.dynamic = true)],
  [
    'fabricated dynamic attribution',
    (b) => (b.resolutionAnchors[0].caller.callsite.kind = 'DYNAMICALLY_OBSERVED'),
  ],
  ['expanded allowed requests', (b) => b.resolutionAnchors[0].requests.push('fs')],
  ['reordered conditions', (b) => b.resolutionAnchors[0].conditions.reverse()],
  [
    'manifest falsely roster-evaluated',
    (b) =>
      b.roster.push({
        url: b.resolutionAnchors[0].manifest.url,
        sha256: b.resolutionAnchors[0].manifest.sha256,
        byteLength: b.resolutionAnchors[0].manifest.byteLength,
        moduleKind: 'json',
      }),
  ],
  ['missing trusted caller', (b) => b.trustedBootstrap.pop()],
];
for (const [name, mutate] of contextMutations)
  test(`closed anchor context refuses ${name}`, () => {
    const expected = context();
    mutate(expected.bindings);
    assert.throws(() => createHttpRuntimeProtocol(expected), invalid);
  });

const terminalMutations = [
  ['missing terminal anchors', (v) => delete v.result.modules.resolutionAnchors],
  ['terminal anchor substitution', (v) => v.result.modules.resolutionAnchors[0].manifest.inode++],
  [
    'terminal extra anchor',
    (v) =>
      v.result.modules.resolutionAnchors.push(
        structuredClone(v.result.modules.resolutionAnchors[0]),
      ),
  ],
  [
    'foreign parent URL',
    (v) =>
      (v.result.modules.resolutions[0].parentURL = pathToFileURL(
        join(root, 'other/package.json'),
      ).href),
  ],
  ['wrong reference request', (v) => (v.result.modules.resolutions[0].specifier = '@nestjs/core')],
  [
    'unknown flow request',
    (v) => (v.result.modules.resolutions[1].specifier = '@nestjs/core/package.json'),
  ],
  [
    'wrong flow conditions',
    (v) => (v.result.modules.resolutions[1].conditions = ['import', 'node']),
  ],
  [
    'wrong reference conditions',
    (v) => (v.result.modules.resolutions[0].conditions = ['require', 'node']),
  ],
  [
    'unknown target URL',
    (v) =>
      (v.result.modules.resolutions[1].canonicalURL = pathToFileURL(join(root, 'unbound.js')).href),
  ],
  [
    'missing census predecessor',
    (v, e) =>
      (v.result.modules.evaluations = v.result.modules.evaluations.filter(
        (row) => row.canonicalURL !== e.bindings.resolutionAnchors[1].caller.url,
      )),
  ],
  [
    'later census predecessor',
    (v, e) => {
      v.result.modules.evaluations.find(
        (row) => row.canonicalURL === e.bindings.resolutionAnchors[1].caller.url,
      ).sequence = 23;
      v.result.modules.evaluations.sort((a, b) => a.sequence - b.sequence);
    },
  ],
  [
    'wrong census predecessor bytes',
    (v, e) =>
      (v.result.modules.evaluations.find(
        (row) => row.canonicalURL === e.bindings.resolutionAnchors[1].caller.url,
      ).sha256 = '0'.repeat(64)),
  ],
  [
    'invented manifest evaluation',
    (v, e) => {
      const m = e.bindings.resolutionAnchors[0].manifest;
      v.result.modules.evaluations.push({
        sequence: 100,
        url: m.url,
        canonicalURL: m.url,
        sha256: m.sha256,
        byteLength: m.byteLength,
        observedFormat: 'json',
        moduleKind: 'json',
      });
    },
  ],
  ['anchor metric credit', (v) => (v.result.modules.resolutionAnchors[0].coverageCredit = 1)],
  [
    'changed terminal caller literal',
    (v) => (v.result.modules.resolutionAnchors[0].caller.callsite.literal = 'unreviewed()'),
  ],
];
for (const [name, mutate] of terminalMutations)
  test(`terminal anchor binding refuses ${name} irreversibly`, () => {
    const expected = context(),
      bad = terminal(expected);
    mutate(bad, expected);
    refused(expected, bad);
  });

for (const mutation of ['missing', 'changed', 'extra'])
  test(`START ${mutation} anchors refuse before terminal`, () => {
    const expected = context(),
      protocol = createHttpRuntimeProtocol(expected),
      first = start(expected);
    if (mutation === 'missing') delete first.result.resolutionAnchors;
    if (mutation === 'changed') first.result.resolutionAnchors[0].manifest.inode++;
    if (mutation === 'extra')
      first.result.resolutionAnchors.push(structuredClone(first.result.resolutionAnchors[0]));
    assert.equal(protocol.receive(first), false);
    assert.equal(protocol.receive(terminal(expected)), false);
    assert.throws(() => protocol.finish(cleanExit), invalid);
    assert.equal(protocol.snapshot().refused, true);
  });

test('repeated same anchored request events retain distinct actual-shaped sequences', () => {
  const expected = context(),
    value = terminal(expected),
    protocol = createHttpRuntimeProtocol(expected);
  value.result.modules.resolutions.push({
    ...structuredClone(value.result.modules.resolutions[1]),
    sequence: 1964,
  });
  assert.equal(protocol.receive(start(expected)), true);
  assert.equal(protocol.receive(value), true);
  assert.deepEqual(
    protocol.finish(cleanExit).modules.resolutions.map((row) => row.sequence),
    [1, 22, 1964],
  );
});
