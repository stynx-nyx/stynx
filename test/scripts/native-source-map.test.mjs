import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { encode } from '@jridgewell/sourcemap-codec';
import { repairSourceMap } from '../../tools/repo-config/native-source-map.mjs';

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vitest/package.json'));
const { moduleRunnerTransform } = await import(pathToFileURL(viteRequire.resolve('vite')));

// Independent VLQ decoding checks the complete ordered population, rather than
// calling the mapper's codec or reconstructing its token-selection algorithm.
function decoded(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let source = 0,
    originalLine = 0,
    originalColumn = 0,
    name = 0;
  return text.split(';').map((line) => {
    let generated = 0;
    return line === ''
      ? []
      : line.split(',').map((entry) => {
          const values = [];
          let value = 0,
            shift = 0;
          for (const char of entry) {
            const digit = alphabet.indexOf(char);
            assert.notEqual(digit, -1);
            value += (digit & 31) * 2 ** shift;
            if (digit & 32) shift += 5;
            else {
              values.push(value & 1 ? -(value >> 1) : value >> 1);
              value = 0;
              shift = 0;
            }
          }
          assert.equal(shift, 0);
          generated += values[0];
          const row = [generated];
          if (values.length > 1) {
            source += values[1];
            originalLine += values[2];
            originalColumn += values[3];
            row.push(source, originalLine, originalColumn);
            if (values.length === 5) {
              name += values[4];
              row.push(name);
            }
          }
          return row;
        });
  });
}

async function compile(source) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx endpoint spaces 日本語-')));
  try {
    const path = join(root, 'subject.ts');
    writeFileSync(path, source);
    const program = ts.createProgram([path], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
      sourceMap: true,
      inlineSources: true,
      strict: true,
    });
    assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
    const output = new Map();
    const emission = program.emit(undefined, (name, text) => output.set(name, text));
    assert.equal(emission.emitSkipped, false);
    const compiler = {
      code: output.get(join(root, 'subject.js')),
      map: JSON.parse(output.get(join(root, 'subject.js.map'))),
    };
    const actual = await moduleRunnerTransform(compiler.code, compiler.map, path, source);
    assert.equal(typeof actual.code, 'string');
    assert.notEqual(
      Object.getPrototypeOf(actual.map),
      Object.prototype,
      'the real Vite transform supplies its bundled map class',
    );
    return {
      sourceName: path,
      source,
      compiler,
      actual: {
        code: actual.code,
        map: Object.defineProperties({}, Object.getOwnPropertyDescriptors(actual.map)),
      },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const original = await compile(
  'export function choose(value: boolean): number | undefined {\n  if (!value) { return; }\n  return 1;\n}\nexport function spare(): number {\n  return 2;\n}\n',
);
const copy = () => structuredClone(original);
const derive = (input = copy()) => repairSourceMap(input);
const first = derive();
assert.ok(first.ledger.some((row) => row.status === 'INSERTED'));

function mutateActual(input, change) {
  const rows = decoded(input.actual.map.mappings);
  change(rows);
  input.actual.map.mappings = encode(rows);
}
function inserted(input = original) {
  const row = repairSourceMap(input).ledger.find((entry) => entry.status === 'INSERTED');
  assert.ok(row);
  return row;
}
function tokenAt(code, line, column, kind) {
  const parsed = ts.createSourceFile('proof.ts', code, ts.ScriptTarget.Latest, true, kind);
  const offset = parsed.getLineStarts()[line] + column;
  const found = [];
  function visit(node) {
    if (node.getStart(parsed) === offset) found.push(node);
    for (const child of node.getChildren(parsed)) visit(child);
  }
  visit(parsed);
  return found;
}

test('actual Program and public Vite SSR repair proves all three token relations', () => {
  assert.equal(ts.version, '6.0.3');
  const result = derive();
  assert.deepEqual(
    new Set(result.ledger.map((row) => row.relationKind)),
    new Set(['CloseBraceToken', 'SemicolonToken', 'EMPTY_RETURN_STATEMENT_7']),
  );
  for (const row of result.ledger) {
    const kind =
      row.relationKind === 'EMPTY_RETURN_STATEMENT_7'
        ? ts.SyntaxKind.ReturnStatement
        : ts.SyntaxKind[row.relationKind];
    for (const [code, line, col, script] of [
      [original.source, row.sourceLine, row.sourceLeft, ts.ScriptKind.TS],
      [original.compiler.code, row.compilerLine, row.compilerLeft[0], ts.ScriptKind.JS],
      [original.actual.code, row.ssrLine, row.ssrLeft[0], ts.ScriptKind.JS],
    ]) {
      const node = tokenAt(code, line, col, script).find((entry) => entry.kind === kind);
      assert.ok(node, row.relationKind);
      assert.equal(node.end - node.getStart(), row.spanLength);
      if (row.spanLength === 7) {
        assert.equal(node.expression, undefined);
        assert.deepEqual(
          node.getChildren().map((entry) => [entry.kind, entry.end - entry.getStart()]),
          [
            [ts.SyntaxKind.ReturnKeyword, 6],
            [ts.SyntaxKind.SemicolonToken, 1],
          ],
        );
      }
    }
  }
});

test('complete old ordered segments plus exactly inserted ledger entries survive', () => {
  const input = copy(),
    before = structuredClone(input),
    result = derive(input);
  const expected = decoded(before.actual.map.mappings);
  for (const row of result.ledger.filter((entry) => entry.status === 'INSERTED'))
    expected[row.ssrLine].push(row.ssrRight);
  for (const line of expected) line.sort((left, right) => left[0] - right[0]);
  assert.deepEqual(decoded(result.map.mappings), expected);
  assert.equal(
    result.newSegmentCount - result.oldSegmentCount,
    result.ledger.filter((row) => row.status === 'INSERTED').length,
  );
  assert.deepEqual(input, before);
  assert.notEqual(result.map, input.actual.map);
  for (const key of ['names', 'sources', 'sourcesContent', 'ignoreList'])
    if (key in result.map) {
      assert.notEqual(result.map[key], input.actual.map[key]);
      assert.deepEqual(result.map[key], input.actual.map[key]);
    }
});

test('repeated repair is an exact decoded no-op with already-present ledger', () => {
  const input = copy(),
    repaired = derive(input);
  input.actual.map = repaired.map;
  const repeated = derive(input);
  assert.deepEqual(decoded(repeated.map.mappings), decoded(repaired.map.mappings));
  assert.equal(
    repeated.ledger.some((row) => row.status === 'INSERTED'),
    false,
  );
  assert.ok(repeated.ledger.every((row) => row.status === 'ALREADY_PRESENT'));
});

test('missing SSR left is recorded ineligible and does not synthesize an anchor', () => {
  const input = copy(),
    anchor = inserted(input);
  mutateActual(input, (rows) => {
    rows[anchor.ssrLine] = rows[anchor.ssrLine].filter(
      (row) => !(row.length >= 4 && row[2] === anchor.sourceLine && row[3] === anchor.sourceLeft),
    );
  });
  const result = derive(input);
  assert.ok(
    result.ledger.some(
      (row) =>
        row.sourceLine === anchor.sourceLine &&
        row.sourceLeft === anchor.sourceLeft &&
        row.status === 'NOT_ELIGIBLE_NO_SSR_LEFT' &&
        row.ssrLeftMatches === 0,
    ),
  );
  assert.equal(
    result.ledger.some(
      (row) =>
        row.status === 'INSERTED' &&
        row.sourceLine === anchor.sourceLine &&
        row.sourceLeft === anchor.sourceLeft,
    ),
    false,
  );
});

test('mapped, unmapped and named existing endpoints refuse collisions', () => {
  for (const shape of ['mapped', 'unmapped', 'named']) {
    const input = copy(),
      anchor = inserted(input);
    input.actual.map.names = ['collision'];
    mutateActual(input, (rows) => {
      const row =
        shape === 'unmapped'
          ? [anchor.ssrRight[0]]
          : shape === 'named'
            ? [...anchor.ssrRight, 0]
            : [anchor.ssrRight[0], 0, 0, 0];
      rows[anchor.ssrLine].push(row);
      rows[anchor.ssrLine].sort((a, b) => a[0] - b[0]);
    });
    assert.throws(() => derive(input), /collision/u, shape);
  }
});

test('multiple SSR left matches refuse rather than select the first', () => {
  const input = copy(),
    anchor = inserted(input);
  mutateActual(input, (rows) => {
    const line = rows.findIndex((entries, index) => index !== anchor.ssrLine && entries.length > 0);
    rows[line][0] = [rows[line][0][0], 0, anchor.sourceLine, anchor.sourceLeft];
  });
  assert.throws(() => derive(input), /ambiguous SSR/u);
});

test('ambiguous compiler provenance refuses and absent right proof is not inferred', () => {
  const input = copy(),
    ledger = derive(input).ledger;
  const anchor = ledger.find((row) => row.relationKind === 'CloseBraceToken');
  const second = ledger.find(
    (row) =>
      row.relationKind === anchor.relationKind && row.originalOffset !== anchor.originalOffset,
  );
  assert.ok(second, 'two actual compiler tokens are required for ambiguity');
  const rows = decoded(input.compiler.map.mappings);
  for (const row of rows[second.compilerLine]) {
    if (row[0] === second.compilerLeft[0])
      row.splice(1, 3, 0, anchor.sourceLine, anchor.sourceLeft);
    if (row[0] === second.compilerRight[0])
      row.splice(1, 3, 0, anchor.sourceLine, anchor.sourceRight);
  }
  input.compiler.map.mappings = encode(rows);
  assert.throws(() => derive(input), /ambiguous compiler/u);
  const missing = copy(),
    entries = decoded(missing.compiler.map.mappings);
  entries[anchor.compilerLine] = entries[anchor.compilerLine].filter(
    (row) => row[0] !== anchor.compilerRight[0],
  );
  missing.compiler.map.mappings = encode(entries);
  const result = derive(missing);
  assert.equal(
    result.ledger.some(
      (row) => row.sourceLine === anchor.sourceLine && row.sourceLeft === anchor.sourceLeft,
    ),
    false,
  );
});

test('mixed actual token kinds refuse a plausible coordinate match', () => {
  const input = copy(),
    anchor = inserted(input);
  const at =
    ts
      .createSourceFile(
        'actual.js',
        input.actual.code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      )
      .getLineStarts()[anchor.ssrLine] + anchor.ssrLeft[0];
  input.actual.code =
    input.actual.code.slice(0, at) +
    (anchor.relationKind === 'CloseBraceToken' ? ';' : '}') +
    input.actual.code.slice(at + 1);
  assert.throws(() => derive(input), /parser|span mismatch/u);
});

test('optional metadata absence, own undefined and string stay distinct with descriptor flags', () => {
  for (const state of ['absent', undefined, '']) {
    const input = copy();
    for (const key of ['sourceRoot', 'file']) {
      delete input.actual.map[key];
      if (state !== 'absent')
        Object.defineProperty(input.actual.map, key, {
          value: state,
          enumerable: true,
          configurable: false,
          writable: false,
        });
    }
    const before = Object.getOwnPropertyDescriptors(input.actual.map),
      result = derive(input);
    for (const key of ['sourceRoot', 'file']) {
      assert.equal(Object.hasOwn(result.map, key), state !== 'absent');
      assert.deepEqual(Object.getOwnPropertyDescriptor(result.map, key), before[key]);
    }
  }
});

test('invalid optional fields, symbols, unknown keys and inherited required data refuse', () => {
  for (const value of [null, false, 0, {}, Symbol('field')]) {
    const input = copy();
    input.actual.map.sourceRoot = value;
    assert.throws(() => derive(input), /optional metadata/u);
  }
  for (const key of ['unknown', Symbol('unknown')]) {
    const input = copy();
    input.actual.map[key] = true;
    assert.throws(() => derive(input), /fields/u);
  }
  const input = copy(),
    inherited = input.actual.map.version;
  delete input.actual.map.version;
  Object.setPrototypeOf(input.actual.map, { version: inherited });
  assert.throws(() => derive(input), /ordinary/u);
});

test('Proxy and accessor inputs refuse before running traps or getters', () => {
  let calls = 0;
  for (const target of ['input', 'map', 'array']) {
    const input = copy();
    const proxy = (value) =>
      new Proxy(value, {
        get() {
          calls++;
          throw Error('trap');
        },
        getPrototypeOf() {
          calls++;
          throw Error('trap');
        },
        ownKeys() {
          calls++;
          throw Error('trap');
        },
      });
    if (target === 'map') input.actual.map = proxy(input.actual.map);
    if (target === 'array') input.actual.map.names = proxy(input.actual.map.names);
    assert.throws(() => derive(target === 'input' ? proxy(input) : input), /ordinary/u);
  }
  const input = copy();
  Object.defineProperty(input.actual.map, 'sourceRoot', {
    enumerable: true,
    get() {
      calls++;
      return '';
    },
  });
  assert.throws(() => derive(input), /descriptors/u);
  assert.equal(calls, 0);
});

test('dense array and closed scalar grammar reject holes, extra fields and wrong indexes', () => {
  for (const make of [() => new Array(1), () => Object.assign([], { extra: true }), () => [0]]) {
    const input = copy();
    input.actual.map.names = make();
    assert.throws(() => derive(input), /array|grammar/u);
  }
  for (const value of [[1], [0, 0], [-1], ['0']]) {
    const input = copy();
    input.actual.map.ignoreList = value;
    assert.throws(() => derive(input), /ignore/u);
  }
});

test('malformed VLQ and duplicate, unsorted or out-of-range coordinates refuse', () => {
  for (const text of ['!', 'g', 'AAAA,AAAA', 'CAAA,DAAA']) {
    const input = copy();
    input.actual.map.mappings = text;
    assert.throws(() => derive(input), /VLQ|coordinate/u, text);
  }
  for (const segment of [[0, 1, 0, 0], [0, 0, 999, 0], [0, 0, 0, 9999], [0, 0, 0, 0, 0], [99999]]) {
    const input = copy();
    input.actual.map.mappings = encode([[segment]]);
    assert.throws(() => derive(input), /coordinate/u);
  }
});

test('source-content drift and syntax errors in every representation refuse', () => {
  const mismatch = copy();
  mismatch.actual.map.sourcesContent = ['different'];
  assert.throws(() => derive(mismatch), /identity/u);
  for (const field of ['source', 'compiler', 'actual']) {
    const input = copy();
    if (field === 'source') input.source = 'export function {';
    else input[field].code = 'export function {';
    assert.throws(() => derive(input), /parser/u);
  }
});

test('counter and caller-defined token-policy fields cannot enter the pure map operation', () => {
  for (const key of ['counts', 'ranges', 'allowedTokens', 'thresholds']) {
    const input = copy();
    input[key] = [];
    assert.throws(() => derive(input), /fields/u);
  }
});

test('literal and comment punctuation, ASI and nonexact returns gain no invented relation', async () => {
  for (const body of ['return', 'return ;', 'return/*comment*/;', 'return 1;', 'return\n;']) {
    const input = await compile(
      `export function pick() { ${body}\n}\nexport const text = '} ; return;';\nexport const template = \`;} return;\`;\nexport const pattern = /[;{}]/u;\n// } ; return;\n/* ; } return; */\n`,
    );
    const result = derive(input);
    assert.equal(
      result.ledger.some((row) => row.relationKind === 'EMPTY_RETURN_STATEMENT_7'),
      false,
      body,
    );
    for (const row of result.ledger)
      assert.ok(
        tokenAt(input.source, row.sourceLine, row.sourceLeft, ts.ScriptKind.TS).some(
          (node) => node.kind === ts.SyntaxKind[row.relationKind],
        ),
      );
  }
});

test('real for-header tokens and Unicode line terminators retain exact UTF16 endpoints', async () => {
  for (const end of ['\n', '\r\n', '\r', '\u2028', '\u2029']) {
    const source = [
      'export function loop() {',
      "  const text = '😀 日本語 ; }';",
      '  for (let i = 0; i < 2; i++) { if (i) return; }',
      '}',
    ].join(end);
    const input = await compile(source),
      result = derive(input);
    assert.ok(result.ledger.some((row) => row.relationKind === 'SemicolonToken'));
    for (const row of result.ledger) {
      assert.equal(
        source.slice(row.originalOffset, row.originalOffset + row.spanLength),
        row.spanLength === 7 ? 'return;' : row.relationKind === 'CloseBraceToken' ? '}' : ';',
      );
      assert.equal(row.sourceRight - row.sourceLeft, row.spanLength);
    }
  }
});
