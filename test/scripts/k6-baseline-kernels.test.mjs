import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { inspectBaselineArchive } from '../../scripts/lib/k6-baseline-archive.mjs';
import { parseBaselineJson } from '../../scripts/lib/k6-baseline-json.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Conventional ZIP records, generated without the inspected parser or its CRC
// implementation. No archive path is extracted or executed by these tests.
function checksum(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zip(members, { prefix = Buffer.alloc(0), gap = Buffer.alloc(0) } = {}) {
  const locals = [prefix];
  const central = [];
  const records = [];
  let offset = prefix.length;
  for (const member of members) {
    const name = Buffer.from(member.name);
    const body = Buffer.from(member.body ?? '{"ok":true}');
    const method = member.method ?? 0;
    const descriptor = member.descriptor ?? false;
    const flags = (descriptor ? 8 : 0) | (member.utf8 ? 0x800 : 0);
    const required = member.required ?? (method === 8 ? 20 : 10);
    const payload = member.payload ?? (method === 8 ? deflateRawSync(body) : body);
    const crc = checksum(body);
    const size = member.size ?? body.length;
    const localExtra = member.localExtra ?? Buffer.alloc(0);
    const centralExtra = member.centralExtra ?? Buffer.alloc(0);
    const comment = member.comment ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(required, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (!descriptor) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(payload.length, 18);
      local.writeUInt32LE(size, 22);
    }
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const trailer = Buffer.alloc(descriptor ? 16 : 0);
    if (descriptor) {
      trailer.writeUInt32LE(0x08074b50);
      trailer.writeUInt32LE(crc, 4);
      trailer.writeUInt32LE(payload.length, 8);
      trailer.writeUInt32LE(size, 12);
    }
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(member.madeBy ?? 0x0314, 4);
    directory.writeUInt16LE(required, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(payload.length, 20);
    directory.writeUInt32LE(size, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(centralExtra.length, 30);
    directory.writeUInt16LE(comment.length, 32);
    directory.writeUInt32LE(member.external ?? 0x81a40020, 38);
    directory.writeUInt32LE(offset, 42);
    records.push({
      local: offset,
      payload: offset + 30 + name.length + localExtra.length,
      descriptor: offset + 30 + name.length + localExtra.length + payload.length,
      centralRelative: central.reduce((length, part) => length + part.length, 0),
    });
    locals.push(local, name, localExtra, payload, trailer);
    central.push(directory, name, centralExtra, comment);
    offset += local.length + name.length + localExtra.length + payload.length + trailer.length;
  }
  const directoryOffset = offset + gap.length;
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  return {
    bytes: Buffer.concat([...locals, gap, directory, end]),
    records: records.map((record) => ({
      ...record,
      central: directoryOffset + record.centralRelative,
    })),
  };
}

function inspect(bytes, roster = ['auth.summary.json']) {
  return inspectBaselineArchive({ bytes, sha256: sha256(bytes), roster });
}

function refused(bytes, roster) {
  assert.throws(() => inspect(bytes, roster), /BASELINE_ARCHIVE_REFUSED/u);
}

for (const [label, member] of [
  ['stored ZIP 1.0', {}],
  ['stored ZIP 2.0', { required: 20 }],
  ['deflated', { method: 8 }],
  ['deflated signed data descriptor', { method: 8, descriptor: true }],
  ['stored signed data descriptor and UTF-8 name flag', { descriptor: true, utf8: true }],
  ['DOS regular file with archive bit', { madeBy: 20, external: 0x20 }],
]) {
  test(`archive accepts conventional ${label} without promoting origin or completeness`, () => {
    assert.equal(checksum(Buffer.from('123456789')), 0xcbf43926);
    const body = Buffer.from('{"metrics":{"duration":{"p(95)":12.5}}}');
    const { bytes } = zip([{ name: 'auth.summary.json', body, ...member }]);
    const result = inspect(bytes);
    assert.equal(result.archiveSha256, sha256(bytes));
    assert.equal(result.archiveBytes, bytes.length);
    assert.equal(result.totalBytes, body.length);
    assert.equal(result.originVerified, false);
    assert.equal(result.measurementComplete, false);
    assert.deepEqual(
      result.files.map(({ name }) => name),
      ['auth.summary.json'],
    );
    assert.deepEqual(result.files[0].bytes, body);
    assert.equal(result.files[0].sha256, sha256(body));
  });
}

test('archive matches an exact multi-file roster independent of central order', () => {
  const { bytes } = zip([
    { name: 'upload.summary.html', body: '<html>upload</html>', method: 8, descriptor: true },
    { name: 'auth.summary.json', body: '{"value":1}' },
  ]);
  const result = inspect(bytes, ['auth.summary.json', 'upload.summary.html']);
  assert.deepEqual(
    result.files.map(({ name }) => name),
    ['auth.summary.json', 'upload.summary.html'],
  );
  refused(bytes, ['auth.summary.json']);
  refused(bytes, ['auth.summary.json', 'missing.summary.html']);
});

const structuralMutations = [
  ['corrupt local signature', ({ bytes, records }) => bytes.writeUInt32LE(0, records[0].local)],
  ['corrupt central signature', ({ bytes, records }) => bytes.writeUInt32LE(0, records[0].central)],
  ['corrupt end signature', ({ bytes }) => bytes.writeUInt32LE(0, bytes.length - 22)],
  ['split disk', ({ bytes }) => bytes.writeUInt16LE(1, bytes.length - 18)],
  ['central count disagreement', ({ bytes }) => bytes.writeUInt16LE(0, bytes.length - 14)],
  ['archive comment', ({ bytes }) => bytes.writeUInt16LE(1, bytes.length - 2)],
  [
    'central directory out of bounds',
    ({ bytes }) => bytes.writeUInt32LE(0xffffffff, bytes.length - 6),
  ],
  ['central directory gap', ({ bytes }) => bytes.writeUInt32LE(1, bytes.length - 10)],
  ['local/central version mismatch', ({ bytes }) => bytes.writeUInt16LE(20, 4)],
  [
    'unsupported central version',
    ({ bytes, records }) => bytes.writeUInt16LE(45, records[0].central + 6),
  ],
  ['local/central method mismatch', ({ bytes }) => bytes.writeUInt16LE(8, 8)],
  ['local/central flags mismatch', ({ bytes }) => bytes.writeUInt16LE(8, 6)],
  ['local/central clock mismatch', ({ bytes }) => bytes.writeUInt16LE(1, 10)],
  ['local/central name mismatch', ({ bytes }) => bytes.writeUInt8(120, 30)],
  ['local CRC mismatch', ({ bytes }) => bytes.writeUInt32LE(0, 14)],
  ['local size mismatch', ({ bytes }) => bytes.writeUInt32LE(1, 22)],
  [
    'body corruption with intact metadata',
    ({ bytes, records }) => (bytes[records[0].payload] ^= 1),
  ],
  ['encryption', ({ bytes, records }) => bytes.writeUInt16LE(1, records[0].central + 8)],
  [
    'unsupported compression method',
    ({ bytes, records }) => bytes.writeUInt16LE(99, records[0].central + 10),
  ],
  [
    'central member on another disk',
    ({ bytes, records }) => bytes.writeUInt16LE(1, records[0].central + 34),
  ],
  [
    'ZIP64 size sentinel',
    ({ bytes, records }) => bytes.writeUInt32LE(0xffffffff, records[0].central + 24),
  ],
  [
    'directory mode',
    ({ bytes, records }) => bytes.writeUInt32LE(0x41ed0010, records[0].central + 38),
  ],
  [
    'symlink mode',
    ({ bytes, records }) => bytes.writeUInt32LE(0xa1ff0020, records[0].central + 38),
  ],
  [
    'unsupported creator platform',
    ({ bytes, records }) => bytes.writeUInt16LE(0x0b14, records[0].central + 4),
  ],
  [
    'unexpected local offset',
    ({ bytes, records }) => bytes.writeUInt32LE(1, records[0].central + 42),
  ],
];
for (const [label, mutate] of structuralMutations) {
  test(`archive refuses ${label} even when the caller supplies its new digest`, () => {
    const generated = zip([{ name: 'auth.summary.json' }]);
    mutate(generated);
    refused(generated.bytes);
  });
}

test('archive refuses digest substitution, truncation, prepends, trailing records and overlap', () => {
  const one = zip([{ name: 'auth.summary.json' }]);
  assert.throws(
    () =>
      inspectBaselineArchive({
        bytes: one.bytes,
        sha256: '0'.repeat(64),
        roster: ['auth.summary.json'],
      }),
    /digest mismatch/u,
  );
  for (const length of [0, 21, one.bytes.length - 1, one.bytes.length - 22]) {
    refused(one.bytes.subarray(0, length));
  }
  refused(Buffer.concat([one.bytes, Buffer.from('trailing')]));
  refused(zip([{ name: 'auth.summary.json' }], { prefix: Buffer.from('prefix') }).bytes);
  refused(zip([{ name: 'auth.summary.json' }], { gap: Buffer.from('gap') }).bytes);
  const two = zip([{ name: 'a.json' }, { name: 'b.json' }]);
  two.bytes.writeUInt32LE(0, two.records[1].central + 42);
  refused(two.bytes, ['a.json', 'b.json']);
});

test('archive refuses descriptor ambiguity and unused or invalid deflate bytes', () => {
  for (const relative of [0, 4, 8, 12]) {
    const generated = zip([{ name: 'auth.summary.json', method: 8, descriptor: true }]);
    generated.bytes.writeUInt32LE(1, generated.records[0].descriptor + relative);
    refused(generated.bytes);
  }
  const generated = zip([{ name: 'auth.summary.json', method: 8, descriptor: true }]);
  generated.bytes.writeUInt32LE(1, 14);
  refused(generated.bytes);
  for (const payload of [
    Buffer.from([0xff, 0xff]),
    Buffer.concat([deflateRawSync(Buffer.from('valid')), Buffer.from([0])]),
  ]) {
    refused(zip([{ name: 'auth.summary.json', body: 'valid', method: 8, payload }]).bytes);
  }
});

test('archive refuses hidden local members and ZIP64 records outside the declared roster', () => {
  const generated = zip([{ name: 'a.json' }, { name: 'hidden.json' }]);
  const directoryStart = generated.records[0].central;
  const firstDirectoryEnd = generated.records[1].central;
  const end = Buffer.from(generated.bytes.subarray(-22));
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(firstDirectoryEnd - directoryStart, 12);
  const hidden = Buffer.concat([generated.bytes.subarray(0, firstDirectoryEnd), end]);
  refused(hidden, ['a.json']);

  const one = zip([{ name: 'auth.summary.json' }]);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50);
  refused(Buffer.concat([one.bytes.subarray(0, -22), locator, one.bytes.subarray(-22)]));
  refused(zip([{ name: 'auth.summary.json', method: 8, required: 10 }]).bytes);
});

test('archive refuses extras, comments, unsafe paths, duplicate names and undeclared marker files', () => {
  for (const metadata of [
    { localExtra: Buffer.from([1, 0, 0, 0]) },
    { centralExtra: Buffer.from([1, 0, 0, 0]) },
    { comment: Buffer.from('comment') },
  ]) {
    refused(zip([{ name: 'auth.summary.json', ...metadata }]).bytes);
  }
  for (const name of [
    '../auth.summary.json',
    '/auth.summary.json',
    'dir/auth.summary.json',
    'dir\\auth.summary.json',
    'ação.json',
  ]) {
    refused(zip([{ name }]).bytes);
    assert.throws(() => inspect(zip([{ name }]).bytes, [name]), /BASELINE_ARCHIVE_REFUSED/u);
  }
  refused(zip([{ name: 'a.json' }, { name: 'a.json' }]).bytes, ['a.json', 'b.json']);
  refused(zip([{ name: 'auth.summary.json' }, { name: 'complete.json' }]).bytes);
});

test('archive bounds allocation, expanded bodies, compression ratio, count and aggregate size', () => {
  refused(Buffer.alloc(32 * 1024 * 1024 + 1));
  refused(zip([{ name: 'auth.summary.json', body: '' }]).bytes);
  refused(zip([{ name: 'auth.summary.json', method: 8, size: 8 * 1024 * 1024 + 1 }]).bytes);
  refused(
    zip([{ name: 'auth.summary.json', method: 8, body: Buffer.alloc(4 * 1024 * 1024) }]).bytes,
  );
  refused(
    zip([{ name: 'auth.summary.json', method: 8, body: randomBytes(4096), size: 1024 }]).bytes,
  );
  const many = Array.from({ length: 65 }, (_, index) => ({ name: `file-${index}.json` }));
  refused(
    zip(many).bytes,
    many.map(({ name }) => name),
  );
  const large = Array.from({ length: 9 }, (_, index) => ({
    name: `file-${index}.json`,
    method: 8,
    size: 8 * 1024 * 1024,
    payload: Buffer.alloc(10_000),
  }));
  refused(
    zip(large).bytes,
    large.map(({ name }) => name),
  );
});

test('archive options and roster refuse proxies, getters, holes and caller-controlled iteration', () => {
  const { bytes } = zip([{ name: 'auth.summary.json' }]);
  const options = { bytes, sha256: sha256(bytes), roster: ['auth.summary.json'] };
  let accesses = 0;
  const getter = () => {
    accesses += 1;
    throw new Error('caller getter invoked');
  };
  for (const key of ['bytes', 'sha256', 'roster']) {
    const accessor = { ...options };
    Object.defineProperty(accessor, key, { get: getter });
    assert.throws(() => inspectBaselineArchive(accessor), /BASELINE_ARCHIVE_REFUSED/u);
    const missing = { ...options };
    delete missing[key];
    assert.throws(() => inspectBaselineArchive(missing), /BASELINE_ARCHIVE_REFUSED/u);
  }
  const proxy = new Proxy(options, { ownKeys: getter, get: getter, getPrototypeOf: getter });
  assert.throws(() => inspectBaselineArchive(proxy), /BASELINE_ARCHIVE_REFUSED/u);
  assert.throws(
    () => inspectBaselineArchive({ ...options, originVerified: true }),
    /BASELINE_ARCHIVE_REFUSED/u,
  );
  assert.throws(
    () => inspectBaselineArchive(Object.assign(Object.create(options), {})),
    /BASELINE_ARCHIVE_REFUSED/u,
  );
  const accessorRoster = ['auth.summary.json'];
  Object.defineProperty(accessorRoster, '0', { get: getter });
  const iteratorRoster = ['auth.summary.json'];
  Object.defineProperty(iteratorRoster, Symbol.iterator, { get: getter });
  for (const roster of [
    accessorRoster,
    iteratorRoster,
    new Array(1),
    [],
    ['a.json', 'a.json'],
    new Proxy(['auth.summary.json'], { get: getter, ownKeys: getter }),
    Object.assign(['auth.summary.json'], { includes: () => false }),
    ['a..json'],
    ['.hidden'],
    ['trailing.'],
    ['UPPER.json'],
    ['a'.repeat(81)],
  ]) {
    assert.throws(
      () => inspectBaselineArchive({ ...options, roster }),
      /BASELINE_ARCHIVE_REFUSED/u,
    );
  }
  assert.equal(accesses, 0);
  assert.equal(inspectBaselineArchive(Object.assign(Object.create(null), options)).files.length, 1);
});

test('archive snapshots native private bytes without invoking shadowed Buffer accessors', () => {
  const { bytes } = zip([{ name: 'auth.summary.json', body: '{"value":1}' }]);
  let accesses = 0;
  for (const key of ['length', 'buffer', 'subarray', Symbol.iterator]) {
    Object.defineProperty(bytes, key, {
      get() {
        accesses += 1;
        throw new Error('shadowed Buffer');
      },
    });
  }
  const result = inspect(bytes);
  assert.equal(accesses, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.files), true);
  assert.equal(Object.isFrozen(result.files[0]), true);
  const original = Buffer.from(result.files[0].bytes);
  bytes[0] = 0;
  assert.deepEqual(result.files[0].bytes, original);
  result.files[0].bytes[0] ^= 1;
  assert.notEqual(sha256(result.files[0].bytes), result.files[0].sha256);
  assert.equal(result.originVerified, false);
  assert.equal(result.measurementComplete, false);
});

for (const kind of ['archive', 'JSON']) {
  test(`${kind} refuses non-native, proxied and shared-memory bodies without invoking traps`, () => {
    const valid =
      kind === 'archive' ? zip([{ name: 'auth.summary.json' }]).bytes : Buffer.from('{}');
    let accesses = 0;
    const trap = () => {
      accesses += 1;
      throw new Error('body trap');
    };
    const shared = Buffer.from(new SharedArrayBuffer(valid.length));
    shared.set(valid);
    const changedPrototype = Buffer.from(valid);
    Object.setPrototypeOf(changedPrototype, Uint8Array.prototype);
    for (const body of [
      new Uint8Array(valid),
      new Proxy(valid, { get: trap, getPrototypeOf: trap }),
      shared,
      changedPrototype,
      null,
    ]) {
      if (kind === 'archive') {
        assert.throws(
          () =>
            inspectBaselineArchive({
              bytes: body,
              sha256: sha256(valid),
              roster: ['auth.summary.json'],
            }),
          /BASELINE_ARCHIVE_REFUSED/u,
        );
      } else assert.throws(() => parseBaselineJson(body), /BASELINE_JSON_REFUSED/u);
    }
    assert.equal(accesses, 0);
  });
}

test('strict JSON preserves nested JSON, escaped names and prototype-named own data', () => {
  const value = parseBaselineJson(
    Buffer.from(
      ' \r\n {"nested":[true,false,null,1.25e2,-0,"ação \\uD83D\\uDE80"],"escaped\\u0020name":"line\\nslash\\/","__proto__":{"polluted":true},"constructor":4} \t',
    ),
  );
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal(Object.getPrototypeOf(value.__proto__), null);
  assert.equal(Object.hasOwn(value, '__proto__'), true);
  assert.equal(value.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(value.nested.slice(0, 4), [true, false, null, 125]);
  assert.equal(Object.is(value.nested[4], -0), true);
  assert.equal(value.nested[5], 'ação 🚀');
  assert.equal(value['escaped name'], 'line\nslash/');
  assert.equal(value.constructor, 4);
  assert.equal(parseBaselineJson(Buffer.from('9007199254740993')), JSON.parse('9007199254740993'));
  assert.equal(parseBaselineJson(Buffer.from('1e-400')), 0);
});

test('strict JSON admits ordinary root values and all standard string escapes without numeric overclaims', () => {
  for (const text of [
    'null',
    'true',
    'false',
    '[]',
    '{}',
    '"\\b\\f\\n\\r\\t\\\\\\/\\""',
    '{"toString":3,"valueOf":4}',
    '-0',
    '0.125',
    '-12.5E-2',
  ]) {
    assert.equal(
      JSON.stringify(parseBaselineJson(Buffer.from(text))),
      JSON.stringify(JSON.parse(text)),
    );
  }
  // RFC JSON follows native string/number semantics. Consumer schema checks,
  // rather than this grammar kernel, must enforce safe integers/scalar strings.
  assert.equal(parseBaselineJson(Buffer.from('"\\uD800"')), JSON.parse('"\\uD800"'));
});

for (const body of [
  '{"a":1,"a":2}',
  '{"a":1,"\\u0061":2}',
  '{"nested":{"a":1,"a":2}}',
  '[{"__proto__":1,"\\u005f_proto__":2}]',
  '{"🚀":1,"\\uD83D\\uDE80":2}',
  '{"constructor":1,"constructor":2}',
]) {
  test(`strict JSON refuses decoded duplicate keys: ${body}`, () => {
    assert.throws(() => parseBaselineJson(Buffer.from(body)), /BASELINE_JSON_REFUSED/u);
  });
}

for (const body of [
  '',
  ' ',
  '{}{}',
  'null false',
  'truex',
  '// comment\n{}',
  '{/*x*/}',
  '{a:1}',
  '{"a":1,}',
  '[1,]',
  '[,1]',
  '{"a" 1}',
  '{"a":}',
  '[1 2]',
  '{',
  '[',
  '"unterminated',
  '"\\x20"',
  '"\\u12"',
  '"line\nfeed"',
  '+1',
  '01',
  '-01',
  '.5',
  '1.',
  '1e',
  '1e+',
  'NaN',
  'Infinity',
  '-Infinity',
  '1e400',
  '-1e400',
  '\ufeff{}',
  '\u00a0{}',
]) {
  test(`strict JSON refuses malformed or nonfinite input ${JSON.stringify(body)}`, () => {
    assert.throws(() => parseBaselineJson(Buffer.from(body)), /BASELINE_JSON_REFUSED/u);
  });
}

test('strict JSON refuses malformed UTF-8, BOM, excessive size/depth/value population', () => {
  for (const bytes of [
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xe2, 0x82]),
    Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
  ]) {
    assert.throws(() => parseBaselineJson(bytes), /BASELINE_JSON_REFUSED/u);
  }
  const nested = (depth) => Buffer.from('['.repeat(depth) + '0' + ']'.repeat(depth));
  assert.doesNotThrow(() => parseBaselineJson(nested(100)));
  assert.throws(() => parseBaselineJson(nested(101)), /BASELINE_JSON_REFUSED/u);
  assert.equal(parseBaselineJson(Buffer.from('[' + '0,'.repeat(199_998) + '0]')).length, 199_999);
  assert.throws(
    () => parseBaselineJson(Buffer.from('[' + '0,'.repeat(199_999) + '0]')),
    /BASELINE_JSON_REFUSED/u,
  );
  assert.equal(
    parseBaselineJson(Buffer.from('"' + 'a'.repeat(8 * 1024 * 1024 - 2) + '"')).length,
    8 * 1024 * 1024 - 2,
  );
  assert.throws(
    () => parseBaselineJson(Buffer.alloc(8 * 1024 * 1024 + 1, 32)),
    /BASELINE_JSON_REFUSED/u,
  );
});

test('strict JSON ignores shadowed Buffer methods and returns a detached mutable value', () => {
  const body = Buffer.from('{"items":[{"value":1}]}');
  let accesses = 0;
  for (const key of ['length', 'buffer', 'toString', Symbol.iterator]) {
    Object.defineProperty(body, key, {
      get() {
        accesses += 1;
        throw new Error('JSON body accessor');
      },
    });
  }
  const parsed = parseBaselineJson(body);
  assert.equal(accesses, 0);
  body[0] = 0;
  assert.equal(parsed.items[0].value, 1);
  parsed.items[0].value = 2;
  assert.equal(parsed.items[0].value, 2);
});
