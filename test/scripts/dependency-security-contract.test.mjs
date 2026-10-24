import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { resolveTestImport, resolveTestImportPath } from './support/esm-test-imports.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
// Resolve the installed workspace dependency graph, rather than importing the fork source directly.
const installedAnchor = join(root, 'node_modules/.pnpm/node_modules/package.json');
const micromatchPath = resolveTestImportPath('micromatch', installedAnchor);
const bracesPath = resolveTestImportPath('braces', micromatchPath);
const { default: braces } = await import(resolveTestImport('braces', micromatchPath));
const { default: CachePolicy } = await import(resolveTestImport('http-cache-semantics', installedAnchor));

function bounded(program) {
  const result = spawnSync(process.execPath, ['-e', program, bracesPath], {
    cwd: root,
    encoding: 'utf8',
    timeout: 3000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
}
const childPrelude = `
const assert = require('node:assert/strict');
const braces = require(process.argv[1]);
const path = require('node:path');
const lib = name => require(path.join(path.dirname(process.argv[1]), 'lib', name));
const refused = fn => assert.throws(fn, error => error instanceof RangeError &&
  /structural safety limits/.test(error.message) && !/call stack/i.test(error.message));
`;

test('workspace consumers resolve the real braces fork and exact supported cache/TOML packages', () => {
  assert.equal(realpathSync(bracesPath), realpathSync(join(root, 'tools/braces-safe/index.js')));
  assert.equal(JSON.parse(readFileSync(resolveTestImportPath('braces/package.json', micromatchPath), 'utf8')).version, '3.0.4-stynx.1');
  assert.equal(JSON.parse(readFileSync(resolveTestImportPath('http-cache-semantics/package.json', installedAnchor), 'utf8')).version, '4.3.1-stynx.1');
  assert.equal(
    realpathSync(resolveTestImportPath('http-cache-semantics', installedAnchor)),
    realpathSync(join(root, 'tools/http-cache-semantics-safe/index.js')),
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(root, 'node_modules/.pnpm/node_modules/smol-toml/package.json'), 'utf8'),
    ).version,
    '1.9.0',
  );
  assert.deepEqual(Object.keys(braces).sort(), [
    'compile',
    'create',
    'expand',
    'parse',
    'stringify',
  ]);
});

// Golden outputs measured from upstream braces 3.0.3 before replacing its dependency link.
const parity = [
  ['a/{b,c}/d', 'a/(b|c)/d', ['a/b/d', 'a/c/d'], 'a/{b,c}/d'],
  ['{1..5}', '([1-5])', ['1', '2', '3', '4', '5'], '{1..5}'],
  ['{05..01..2}', '(01|03|05)', ['05', '03', '01'], '{05..01..2}'],
  ['{a..e..2}', '(a|c|e)', ['a', 'c', 'e'], '{a..e..2}'],
  ['a/\\{b,c\\}/d', 'a/{b,c}/d', ['a/{b,c}/d'], 'a/{b,c}/d'],
  ['{"a,b",c}', '(a,b|c)', ['a,b', 'c'], '{a,b,c}'],
  ['{a,{b,c}}', '(a|(b|c))', ['a', 'b', 'c'], '{a,{b,c}}'],
  ['{a,a,,b}', '(a|a|b)', ['a', 'a', '', 'b'], '{a,a,,b}'],
  ['${a,b}', '${a,b}', ['${a,b}'], '${a,b}'],
  ['{foo}', '{foo}', ['{foo}'], '{foo}'],
  ['(a|b)/{x,y}', '(a|b)/(x|y)', ['(a|b)/x', '(a|b)/y'], '(a|b)/{x,y}'],
  ['{a,b}{1,2}', '(a|b)(1|2)', ['a1', 'a2', 'b1', 'b2'], '{a,b}{1,2}'],
  ['{}', '{}', ['{}'], '{}'],
];
for (const [pattern, compiled, expanded, stringified] of parity) {
  test(`installed braces preserves upstream public API for ${JSON.stringify(pattern)}`, async () => {
    assert.deepEqual(braces(pattern), [compiled]);
    assert.equal(braces.compile(pattern), compiled);
    assert.deepEqual(braces.create(pattern), pattern.length < 3 ? [pattern] : compiled);
    assert.deepEqual(braces(pattern, { expand: true }), expanded);
    assert.deepEqual(braces.expand(pattern), expanded);
    assert.equal(braces.stringify(braces.parse(pattern)), stringified);
    for (const method of ['compile', 'expand', 'stringify']) {
      const { default: direct } = await import(resolveTestImport(`braces/lib/${method}.js`, micromatchPath));
      assert.deepEqual(
        direct(braces.parse(pattern)),
        method === 'compile' ? compiled : method === 'expand' ? expanded : stringified,
      );
    }
  });
}

test('installed braces preserves arrays, noempty, nodupes, escaping, and configurable rangeLimit', () => {
  assert.deepEqual(braces(['{a,a,,b}', '{b,c}'], { expand: true, noempty: true, nodupes: true }), [
    'a',
    'b',
    'c',
  ]);
  assert.deepEqual(braces.expand('{a,a,,b}', { noempty: true, nodupes: true }), ['a', 'b']);
  assert.equal(
    braces.stringify(braces.parse('a/\\{b,c\\}', { keepEscaping: true })),
    'a/\\{b,c\\}',
  );
  assert.throws(() => braces.expand('{1..1001}'), /range limit/u);
  assert.throws(() => braces.expand('{1..4}', { rangeLimit: 3 }), /range limit/u);
  assert.deepEqual(braces.expand('{1..4}', { rangeLimit: 4 }), ['1', '2', '3', '4']);
  assert.equal(braces.expand('{1..1001}', { rangeLimit: 1001 }).length, 1001);
  assert.equal(braces.expand('{1..1001}', { rangeLimit: false }).length, 1001);
  assert.throws(() => braces.parse('abcd', { maxLength: 3 }), /length/u);
});

for (const shape of ['braces', 'parentheses', 'mixed']) {
  test(`installed parser bounds deep ${shape} strings below maxLength in a child process`, () => {
    bounded(
      childPrelude +
        `
const opening = ${JSON.stringify(shape)} === 'braces' ? '{' : ${JSON.stringify(shape)} === 'parentheses' ? '(' : '{(';
const closing = ${JSON.stringify(shape)} === 'braces' ? '}' : ${JSON.stringify(shape)} === 'parentheses' ? ')' : ')}';
const input = opening.repeat(2000) + 'x' + closing.repeat(2000);
assert.ok(input.length < 10000);
for (const run of [() => braces(input), () => braces.parse(input), () => lib('parse')(input),
  () => braces.expand(input, {rangeLimit:false, maxLength:65536}), () => braces.stringify(input)]) refused(run);
`,
    );
  });
}

for (const shape of [
  'child-cycle',
  'parent-cycle',
  'deep-child',
  'deep-parent',
  'nested-value',
  'cyclic-value',
]) {
  test(`installed public and direct walkers refuse ${shape} ASTs without stack overflow`, () => {
    bounded(
      childPrelude +
        `
function make() {
  const node = {type:'root', nodes:[]};
  switch (${JSON.stringify(shape)}) {
    case 'child-cycle': node.nodes.push(node); break;
    case 'parent-cycle': node.parent=node; break;
    case 'deep-child': {let cursor=node; for(let i=0;i<4000;i++){const next={type:'root',nodes:[]};cursor.nodes.push(next);cursor=next;} break;}
    case 'deep-parent': {let cursor=node; for(let i=0;i<4000;i++){cursor.parent={};cursor=cursor.parent;} break;}
    case 'nested-value': {let value='x';for(let i=0;i<4000;i++)value=[value];node.nodes=[{type:'text',value}];break;}
    case 'cyclic-value': {const value=[];value.push(value);node.nodes=[{type:'text',value}];break;}
  }
  return node;
}
for(const name of ['compile','expand','stringify']) {
  refused(() => braces[name](make(), {rangeLimit:false}));
  refused(() => lib(name)(make(), {rangeLimit:false}));
}
`,
    );
  });
}

for (const shape of ['nested', 'cyclic']) {
  test(`installed expansion bounds an external ${shape} parent queue`, () => {
    bounded(
      childPrelude +
        `
function make(){let value=[];if(${JSON.stringify(shape)}==='cyclic')value.push(value);
  else {value='prefix';for(let i=0;i<4000;i++)value=[value];}
  return {type:'text',parent:{type:'root',queue:[value]},nodes:[{type:'text',value:'x'}]};}
refused(() => braces.expand(make()));
refused(() => lib('expand')(make()));
`,
    );
  });
}

test('actual micromatch and fast-glob consumers retain glob boundary behavior', async (t) => {
  const { default: micromatch } = await import(resolveTestImport('micromatch', installedAnchor));
  const { default: fastGlob } = await import(resolveTestImport('fast-glob', installedAnchor));
  assert.deepEqual(
    micromatch(['src/a.ts', 'src/b.js', 'src/c.json', 'src/.hidden.ts'], 'src/*.{ts,js}'),
    ['src/a.ts', 'src/b.js'],
  );
  assert.deepEqual(micromatch(['a1', 'a2', 'b1', 'c1'], '{a,b}{1..2}'), ['a1', 'a2', 'b1']);
  const directory = mkdtempSync(join(tmpdir(), 'stynx braces á-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'src'));
  for (const name of ['a.ts', 'b.js', 'c.json', '.hidden.ts'])
    writeFileSync(join(directory, 'src', name), '');
  assert.deepEqual(fastGlob.sync('src/*.{ts,js}', { cwd: directory }).sort(), [
    'src/a.ts',
    'src/b.js',
  ]);
});

function policy(cacheControl, { shared = true, headers = {} } = {}) {
  const request = {
    url: 'https://cache.invalid/resource',
    method: 'GET',
    headers: { host: 'cache.invalid', 'accept-language': 'en' },
  };
  const value = new CachePolicy(
    request,
    {
      status: 200,
      headers: { date: 'Sat, 10 Oct 2026 00:00:00 GMT', 'cache-control': cacheControl, ...headers },
    },
    { shared },
  );
  let elapsed = 0;
  value.now = () => Date.parse('2026-10-10T00:00:00Z') + elapsed;
  // Reconstruct through the public serialization API to set a deterministic cache insertion time.
  const snapshot = value.toObject();
  snapshot.t = Date.parse('2026-10-10T00:00:00Z');
  const restored = CachePolicy.fromObject(snapshot);
  restored.now = () => Date.parse('2026-10-10T00:00:00Z') + elapsed;
  return {
    value: restored,
    request,
    advance: (milliseconds) => {
      elapsed = milliseconds;
    },
  };
}
function staleRequest(request, directive = 'max-stale') {
  return { ...request, headers: { ...request.headers, 'cache-control': directive } };
}

test('cache maintains private/shared admission and request no-cache boundaries', () => {
  const shared = policy('private, max-age=60');
  assert.equal(shared.value.storable(), false);
  assert.equal(shared.value.satisfiesWithoutRevalidation(shared.request), false);
  const personal = policy('private, max-age=60', { shared: false });
  assert.equal(personal.value.storable(), true);
  assert.equal(personal.value.satisfiesWithoutRevalidation(personal.request), true);
  assert.equal(
    personal.value.satisfiesWithoutRevalidation(staleRequest(personal.request, 'no-cache')),
    false,
  );
});

for (const directive of ['private', 'no-cache', 'proxy-revalidate', 'must-revalidate']) {
  test(`cache max-stale cannot bypass response ${directive} restrictions`, () => {
    const { value, request, advance } = policy(`${directive}, max-age=1`);
    advance(120000);
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), false);
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'max-stale=300')), false);
  });
}

test('cache permits bounded max-stale only for an otherwise reusable response', () => {
  const { value, request, advance } = policy('public, max-age=60');
  advance(90000);
  assert.equal(value.satisfiesWithoutRevalidation(request), false);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'max-stale=10')), false);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'max-stale=31')), true);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), true);
});

test('cache respects Set-Cookie opt-in and Vary matching', () => {
  const implicit = policy('max-age=60', { headers: { 'set-cookie': 'session=fixture' } });
  assert.equal(implicit.value.satisfiesWithoutRevalidation(implicit.request), false);
  const explicit = policy('public, max-age=60', {
    headers: { 'set-cookie': 'session=fixture', vary: 'accept-language' },
  });
  assert.equal(explicit.value.satisfiesWithoutRevalidation(explicit.request), true);
  assert.equal(
    explicit.value.satisfiesWithoutRevalidation({
      ...explicit.request,
      headers: { ...explicit.request.headers, 'accept-language': 'it' },
    }),
    false,
  );
  const star = policy('public, max-age=60', { headers: { vary: '*' } });
  assert.equal(star.value.satisfiesWithoutRevalidation(star.request), false);
});

test('installed TOML preserves typed values and reports malformed input', async () => {
  const toml = await import(resolveTestImport('smol-toml', installedAnchor));
  const document = { title: 'tenant á', active: true, retries: 3, nested: { names: ['a', 'b'] } };
  const parsed = toml.parse(toml.stringify(document));
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), document);
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.getPrototypeOf(parsed.nested), null);
  assert.throws(() => toml.parse('duplicate = 1\nduplicate = 2'));
});

test('shared s-maxage remains fresh until expiry and then requires validation despite stale extensions', () => {
  const { value, request, advance } = policy(
    'public, s-maxage=60, max-age=600, stale-while-revalidate=300, stale-if-error=300',
  );
  assert.equal(value.satisfiesWithoutRevalidation(request), true);
  advance(90000);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), false);
  assert.equal(value.evaluateRequest(request).response, undefined);
  assert.equal(value.evaluateRequest(request).revalidation.synchronous, true);
  assert.equal(value.useStaleWhileRevalidate(), false);
  const failed = value.revalidatedPolicy(request, { status: 503, headers: {} });
  assert.equal(failed.modified, true);
  assert.equal(failed.matches, false);
  assert.notEqual(failed.policy, value);
});

for (const directive of ['private', 'no-cache', 'proxy-revalidate', 'must-revalidate']) {
  test(`response ${directive} cannot regain shared reuse through SWR or origin-error fallback`, () => {
    const { value, request, advance } = policy(
      `${directive}, max-age=1, stale-while-revalidate=300, stale-if-error=300`,
    );
    advance(90000);
    assert.equal(value.evaluateRequest(request).response, undefined);
    assert.equal(value.evaluateRequest(request).revalidation.synchronous, true);
    assert.equal(value.useStaleWhileRevalidate(), false);
    const failed = value.revalidatedPolicy(request, { status: 503, headers: {} });
    assert.equal(failed.modified, true);
    assert.equal(failed.matches, false);
    assert.notEqual(failed.policy, value);
    assert.throws(() => value.revalidatedPolicy(request, undefined), /Response headers missing/u);
  });
}

test('shared Set-Cookie without public opt-in cannot regain reuse through max-stale, SWR or errors', () => {
  const { value, request, advance } = policy(
    'max-age=60, stale-while-revalidate=300, stale-if-error=300',
    { headers: { 'set-cookie': 'session=fixture' } },
  );
  advance(90000);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), false);
  assert.equal(value.evaluateRequest(request).response, undefined);
  assert.equal(value.useStaleWhileRevalidate(), false);
  assert.equal(value.revalidatedPolicy(request, { status: 503, headers: {} }).modified, true);
});

test('public responses retain asynchronous stale-while-revalidate and bounded stale-if-error', () => {
  const { value, request, advance } = policy(
    'public, max-age=60, stale-while-revalidate=300, stale-if-error=300',
  );
  advance(90000);
  const served = value.evaluateRequest(request);
  assert.equal(served.response.status, 200);
  assert.equal(served.revalidation.synchronous, false);
  assert.equal(value.useStaleWhileRevalidate(), true);
  for (const response of [{ status: 503, headers: {} }, undefined]) {
    const failed = value.revalidatedPolicy(request, response);
    assert.equal(failed.policy, value);
    assert.equal(failed.modified, false);
    assert.equal(failed.matches, true);
  }
  advance(400000);
  assert.equal(value.evaluateRequest(request).response, undefined);
  assert.equal(value.useStaleWhileRevalidate(), false);
  assert.equal(value.revalidatedPolicy(request, { status: 503, headers: {} }).modified, true);
});

for (const directive of ['proxy-revalidate', 's-maxage=1']) {
  test(`personal caches preserve their max-age despite shared-only ${directive}`, () => {
    const { value, request, advance } = policy(
      `private, ${directive}, max-age=60, stale-while-revalidate=300, stale-if-error=300`,
      { shared: false },
    );
    advance(30000);
    assert.equal(value.satisfiesWithoutRevalidation(request), true);
    advance(90000);
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), true);
    assert.equal(value.evaluateRequest(request).revalidation.synchronous, false);
    assert.equal(value.revalidatedPolicy(request, { status: 503, headers: {} }).policy, value);
  });
}

for (const mismatch of ['url', 'host', 'vary', 'method']) {
  test(`stale-if-error never reuses a cached body for a different ${mismatch}`, () => {
    const { value, request, advance } = policy('public, max-age=60, stale-if-error=300', {
      headers: { vary: 'accept-language' },
    });
    advance(90000);
    const changed = { ...request, headers: { ...request.headers } };
    if (mismatch === 'url') changed.url = 'https://cache.invalid/other';
    if (mismatch === 'host') changed.headers.host = 'other.invalid';
    if (mismatch === 'vary') changed.headers['accept-language'] = 'it';
    if (mismatch === 'method') changed.method = 'POST';
    const failed = value.revalidatedPolicy(changed, { status: 503, headers: {} });
    assert.equal(failed.modified, true);
    assert.equal(failed.matches, false);
    assert.notEqual(failed.policy, value);
  });
}

test('ordinary ETag revalidation and serialization remain compatible', () => {
  const { value, request, advance } = policy('public, max-age=60', {
    headers: { etag: '"original"', 'content-length': '17' },
  });
  advance(90000);
  assert.equal(value.revalidationHeaders(request)['if-none-match'], '"original"');
  const result = value.revalidatedPolicy(request, {
    status: 304,
    headers: { etag: '"original"', 'cache-control': 'public, max-age=120', 'content-length': '0' },
  });
  assert.equal(result.modified, false);
  assert.equal(result.matches, true);
  assert.equal(result.policy.responseHeaders()['content-length'], '17');
  assert.equal(result.policy.maxAge(), 120);
  assert.deepEqual(
    CachePolicy.fromObject(result.policy.toObject()).toObject(),
    result.policy.toObject(),
  );
});

for (const directive of [
  'Private',
  'No-Store',
  'No-Cache',
  'Must-Revalidate',
  'Proxy-Revalidate',
  'S-Maxage=1',
]) {
  test(`mixed-case response ${directive} retains admission across max-stale, SWR and errors`, () => {
    const { value, request, advance } = policy(
      `${directive}, Max-Age=1, Stale-While-Revalidate=300, Stale-If-Error=300`,
    );
    advance(90000);
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'Max-Stale=300')), false);
    assert.equal(value.evaluateRequest(request).response, undefined);
    assert.equal(value.evaluateRequest(request).revalidation.synchronous, true);
    assert.equal(value.useStaleWhileRevalidate(), false);
    const failed = value.revalidatedPolicy(request, { status: 503, headers: {} });
    assert.equal(failed.modified, true);
    assert.equal(failed.matches, false);
    assert.notEqual(failed.policy, value);
  });
}

test('mixed-case request directives retain no-cache, max-age and min-fresh semantics', () => {
  const { value, request, advance } = policy('Public, Max-Age=60');
  advance(30000);
  assert.equal(value.satisfiesWithoutRevalidation(request), true);
  for (const directive of ['No-Cache', 'MAX-AGE=0', 'Min-Fresh=45']) {
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, directive)), false);
    assert.equal(value.evaluateRequest(staleRequest(request, directive)).response, undefined);
  }
  advance(90000);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'Max-Stale=31')), true);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request, 'MAX-STALE=10')), false);
});

// Public version-1 serialized shape emitted by the pre-fix upstream serializer:
// directive dictionary keys retain their HTTP spelling, unlike the new parser.
function legacyPolicy(responseDirective, requestDirective) {
  const snapshot = {
    v: 1,
    t: Date.parse('2026-10-10T00:00:00Z'),
    sh: true,
    ch: 0.1,
    imm: 86400000,
    icc: false,
    st: 200,
    resh: {
      date: 'Sat, 10 Oct 2026 00:00:00 GMT',
      'cache-control': `${responseDirective}, max-age=1, stale-if-error=300, stale-while-revalidate=300`,
    },
    rescc: {
      [responseDirective.split('=')[0]]: responseDirective.includes('=')
        ? responseDirective.split('=')[1]
        : true,
      'max-age': '1',
      'stale-if-error': '300',
      'stale-while-revalidate': '300',
    },
    m: 'GET',
    u: 'https://cache.invalid/resource',
    h: 'cache.invalid',
    a: true,
    reqh: null,
    reqcc: requestDirective ? { [requestDirective]: true } : {},
  };
  const value = CachePolicy.fromObject(JSON.parse(JSON.stringify(snapshot)));
  value.now = () => Date.parse('2026-10-10T00:01:30Z');
  const request = { url: snapshot.u, method: 'GET', headers: { host: snapshot.h } };
  return { value, request };
}

for (const directive of [
  'Private',
  'No-Store',
  'No-Cache',
  'Must-Revalidate',
  'Proxy-Revalidate',
  'S-Maxage=1',
]) {
  test(`legacy serialized ${directive} retains restrictions after restoration`, () => {
    const { value, request } = legacyPolicy(directive);
    assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), false);
    assert.equal(value.evaluateRequest(request).response, undefined);
    assert.equal(value.useStaleWhileRevalidate(), false);
    assert.equal(value.revalidatedPolicy(request, { status: 503, headers: {} }).modified, true);
  });
}

test('legacy serialized request No-Store still prevents storage and all stale reuse', () => {
  const { value, request } = legacyPolicy('Public', 'No-Store');
  assert.equal(value.storable(), false);
  assert.equal(value.satisfiesWithoutRevalidation(staleRequest(request)), false);
  assert.equal(value.evaluateRequest(request).response, undefined);
  assert.equal(value.revalidatedPolicy(request, { status: 503, headers: {} }).modified, true);
});

for (const restriction of ['private', 'no-store', 'no-cache', 'vary-star']) {
  test(`matching 304 introduces previously absent ${restriction} restriction`, () => {
    const request = {
      url: 'https://cache.invalid/resource',
      method: 'GET',
      headers: { host: 'cache.invalid' },
    };
    const clock = Date.now();
    const original = new CachePolicy(request, {
      status: 200,
      headers: {
        date: new Date(clock).toUTCString(),
        expires: new Date(clock + 3600000).toUTCString(),
        etag: '"original"',
        'content-length': '17',
      },
    });
    assert.equal(original.satisfiesWithoutRevalidation(request), true);
    assert.equal(Object.hasOwn(original.toObject().resh, 'cache-control'), false);
    assert.equal(Object.hasOwn(original.toObject().resh, 'vary'), false);
    const headers = { etag: '"original"' };
    if (restriction === 'vary-star') headers.vary = '*';
    else headers['cache-control'] = restriction;
    const result = original.revalidatedPolicy(request, { status: 304, headers });
    assert.equal(result.matches, true);
    assert.equal(result.modified, false);
    assert.equal(result.policy.responseHeaders()['content-length'], '17');
    assert.equal(result.policy.satisfiesWithoutRevalidation(request), false);
    if (restriction === 'private' || restriction === 'no-store')
      assert.equal(result.policy.storable(), false);
    assert.equal(
      result.policy.toObject().resh[restriction === 'vary-star' ? 'vary' : 'cache-control'],
      restriction === 'vary-star' ? '*' : restriction,
    );
  });
}

for (const mismatch of ['url', 'host', 'vary', 'method']) {
  test(`matching ETag 304 cannot reuse the old body across a different ${mismatch}`, () => {
    const { value, request } = policy('public, max-age=60', {
      headers: { etag: '"original"', vary: 'accept-language' },
    });
    const changed = { ...request, headers: { ...request.headers } };
    if (mismatch === 'url') changed.url = 'https://cache.invalid/other';
    if (mismatch === 'host') changed.headers.host = 'other.invalid';
    if (mismatch === 'vary') changed.headers['accept-language'] = 'it';
    if (mismatch === 'method') changed.method = 'POST';
    const result = value.revalidatedPolicy(changed, {
      status: 304,
      headers: { etag: '"original"' },
    });
    assert.equal(result.matches, false);
    assert.equal(result.modified, true);
    assert.notEqual(result.policy, value);
  });
}

test('same-resource HEAD with matching ETag may validate the existing GET representation', () => {
  const { value, request } = policy('public, max-age=60', {
    headers: { etag: '"original"', vary: 'accept-language', 'content-length': '17' },
  });
  const head = { ...request, method: 'HEAD' };
  assert.equal(value.revalidationHeaders(head)['if-none-match'], '"original"');
  const result = value.revalidatedPolicy(head, { status: 304, headers: { etag: '"original"' } });
  assert.equal(result.matches, true);
  assert.equal(result.modified, false);
  assert.equal(result.policy.responseHeaders()['content-length'], '17');
});
