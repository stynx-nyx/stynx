import { createRequire } from 'node:module';
import ts from 'typescript';
import { types } from 'node:util';

const { decode, encode } = createRequire(import.meta.url)('@jridgewell/sourcemap-codec');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const refuse = (message) => {
  throw new Error(`Native source map: ${message}`);
};

function dataRecord(value, required, optional = []) {
  if (types.isProxy(value) || !value || Object.getPrototypeOf(value) !== Object.prototype)
    refuse('expected an ordinary map record');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || ![...required, ...optional].includes(key),
    ) ||
    required.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((entry) => !('value' in entry) || !entry.enumerable)
  )
    refuse('unsupported map fields or descriptors');
  return value;
}

function dataArray(value) {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    refuse('expected an ordinary dense array');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => descriptors[index]).some(
      (entry) => !entry || !('value' in entry) || !entry.enumerable,
    )
  )
    refuse('array holes, accessors or extra keys are unsupported');
  return value;
}

function syntax(code, name, kind) {
  if (typeof code !== 'string') refuse('representation code must be a string');
  const parsed = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, kind);
  if (parsed.parseDiagnostics.length !== 0) refuse('representation parser diagnostics');
  const spans = new Map();
  function visit(node) {
    const start = node.getStart(parsed);
    if (node.kind === ts.SyntaxKind.CloseBraceToken || node.kind === ts.SyntaxKind.SemicolonToken) {
      const literal = node.kind === ts.SyntaxKind.CloseBraceToken ? '}' : ';';
      if (node.end !== start + 1 || code[start] !== literal) refuse('token boundary mismatch');
      spans.set(start, { relationKind: ts.SyntaxKind[node.kind], spanLength: 1 });
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression === undefined &&
      node.getText(parsed) === 'return;'
    ) {
      const children = node.getChildren(parsed);
      if (
        node.end !== start + 7 ||
        children.length !== 2 ||
        children[0].kind !== ts.SyntaxKind.ReturnKeyword ||
        children[0].getStart(parsed) !== start ||
        children[0].end !== start + 6 ||
        children[1].kind !== ts.SyntaxKind.SemicolonToken ||
        children[1].getStart(parsed) !== start + 6 ||
        children[1].end !== start + 7
      )
        refuse('empty return parser boundary mismatch');
      spans.set(start, { relationKind: 'EMPTY_RETURN_STATEMENT_7', spanLength: 7 });
    }
    for (const child of node.getChildren(parsed)) visit(child);
  }
  visit(parsed);
  const starts = parsed.getLineStarts();
  const lengths = starts.map(
    (start, index) =>
      code.slice(start, starts[index + 1] ?? code.length).replace(/[\r\n\u2028\u2029]+$/u, '')
        .length,
  );
  return { spans, starts, lengths, code };
}

function decodeMap(map, generated, original) {
  dataRecord(
    map,
    ['version', 'names', 'sources', 'sourcesContent', 'mappings'],
    ['file', 'sourceRoot', 'ignoreList'],
  );
  if (
    map.version !== 3 ||
    typeof map.mappings !== 'string' ||
    dataArray(map.sources).length !== 1 ||
    typeof map.sources[0] !== 'string' ||
    map.sources[0] === '' ||
    dataArray(map.sourcesContent).length !== 1 ||
    map.sourcesContent[0] !== original.code ||
    dataArray(map.names).some((name) => typeof name !== 'string')
  )
    refuse('map identity or required grammar mismatch');
  for (const key of ['file', 'sourceRoot']) {
    if (Object.hasOwn(map, key) && map[key] !== undefined && typeof map[key] !== 'string')
      refuse('optional metadata must be absent, undefined or a string');
  }
  if (Object.hasOwn(map, 'ignoreList')) {
    const indexes = dataArray(map.ignoreList);
    if (
      new Set(indexes).size !== indexes.length ||
      indexes.some(
        (index) => !Number.isSafeInteger(index) || index < 0 || index >= map.sources.length,
      )
    )
      refuse('invalid ignore-list indexes');
  }
  const decoded = decode(map.mappings);
  if (encode(decoded) !== map.mappings) refuse('noncanonical or malformed VLQ');
  for (const [line, segments] of decoded.entries()) {
    if (line >= generated.lengths.length && segments.length !== 0)
      refuse('generated line outside representation');
    let previous = -1;
    for (const segment of segments) {
      if (
        ![1, 4, 5].includes(segment.length) ||
        segment.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        segment[0] <= previous ||
        segment[0] > generated.lengths[line]
      )
        refuse('invalid or unordered generated coordinate');
      previous = segment[0];
      if (
        segment.length > 1 &&
        (segment[1] !== 0 ||
          segment[2] >= original.lengths.length ||
          segment[3] > original.lengths[segment[2]] ||
          (segment.length === 5 && segment[4] >= map.names.length))
      )
        refuse('invalid source or name coordinate');
    }
  }
  return decoded;
}

function cloneMapWithMappings(map, mappings) {
  const descriptors = Object.getOwnPropertyDescriptors(map);
  for (const descriptor of Object.values(descriptors)) {
    if (Array.isArray(descriptor.value)) {
      descriptor.value = Object.defineProperties(
        [],
        Object.getOwnPropertyDescriptors(descriptor.value),
      );
    }
  }
  descriptors.mappings.value = mappings;
  return Object.defineProperties({}, descriptors);
}

/** Derive only existing compiler-proven endpoints; no coverage counters are accepted. */
export function repairSourceMap(input) {
  dataRecord(input, ['sourceName', 'source', 'compiler', 'actual']);
  const { sourceName, source, compiler, actual } = input;
  if (typeof sourceName !== 'string' || sourceName === '') refuse('source identity is required');
  dataRecord(compiler, ['code', 'map']);
  dataRecord(actual, ['code', 'map']);
  const original = syntax(source, sourceName, ts.ScriptKind.TS);
  const emitted = syntax(compiler.code, `${sourceName}.esm.js`, ts.ScriptKind.JS);
  const ssr = syntax(actual.code, `${sourceName}.ssr.js`, ts.ScriptKind.JS);
  const emission = decodeMap(compiler.map, emitted, original);
  const before = decodeMap(actual.map, ssr, original);
  const derived = structuredClone(before);
  const candidates = [];
  for (const [line, segments] of emission.entries()) {
    for (let index = 0; index < segments.length - 1; index++) {
      const left = segments[index],
        right = segments[index + 1];
      if (left.length !== 4 || right.length !== 4 || right[1] !== left[1] || right[2] !== left[2])
        continue;
      const originalOffset = original.starts[left[2]] + left[3];
      const compilerOffset = emitted.starts[line] + left[0];
      const span = original.spans.get(originalOffset);
      if (!span || !emitted.spans.has(compilerOffset)) continue;
      if (right[0] !== left[0] + span.spanLength || right[3] !== left[3] + span.spanLength)
        continue;
      if (!same(span, emitted.spans.get(compilerOffset))) refuse('compiler/source span mismatch');
      candidates.push({
        ...span,
        originalOffset,
        compilerOffset,
        compilerLine: line,
        compilerLeft: [...left],
        compilerRight: [...right],
        sourceLine: left[2],
        sourceLeft: left[3],
        sourceRight: right[3],
      });
    }
  }
  const seen = new Set(),
    ledger = [];
  for (const candidate of candidates) {
    const key = `${candidate.sourceLine}:${candidate.sourceLeft}`;
    if (seen.has(key)) refuse('ambiguous compiler span');
    seen.add(key);
    const matches = [];
    for (const [line, segments] of before.entries()) {
      for (const segment of segments) {
        if (
          segment.length >= 4 &&
          segment[1] === 0 &&
          segment[2] === candidate.sourceLine &&
          segment[3] === candidate.sourceLeft
        )
          matches.push({ line, segment });
      }
    }
    if (matches.length === 0) {
      ledger.push({ ...candidate, ssrLeftMatches: 0, status: 'NOT_ELIGIBLE_NO_SSR_LEFT' });
      continue;
    }
    if (matches.length !== 1) refuse('ambiguous SSR span');
    const { line, segment } = matches[0];
    const ssrOffset = ssr.starts[line] + segment[0];
    if (
      !same(ssr.spans.get(ssrOffset), {
        relationKind: candidate.relationKind,
        spanLength: candidate.spanLength,
      })
    )
      refuse('SSR/source span mismatch');
    const added = [
      segment[0] + candidate.spanLength,
      0,
      candidate.sourceLine,
      candidate.sourceRight,
    ];
    if (added[0] > ssr.lengths[line]) refuse('SSR endpoint outside line');
    const existing = derived[line].find((entry) => entry[0] === added[0]);
    if (existing && !same(existing, added)) refuse('mapped or unmapped endpoint collision');
    if (!existing) {
      derived[line].push(added);
      derived[line].sort((left, right) => left[0] - right[0]);
    }
    ledger.push({
      ...candidate,
      ssrOffset,
      ssrLine: line,
      ssrLeft: [...segment],
      ssrRight: [...added],
      ssrLeftMatches: 1,
      status: existing ? 'ALREADY_PRESENT' : 'INSERTED',
    });
  }
  const map = cloneMapWithMappings(actual.map, encode(derived));
  const checked = decodeMap(map, ssr, original);
  const expected = structuredClone(before);
  for (const row of ledger) if (row.status === 'INSERTED') expected[row.ssrLine].push(row.ssrRight);
  for (const line of expected) line.sort((left, right) => left[0] - right[0]);
  if (!same(checked, expected)) refuse('ordered original/addition population changed');
  const oldDescriptors = Object.getOwnPropertyDescriptors(actual.map);
  const newDescriptors = Object.getOwnPropertyDescriptors(map);
  if (!same(Reflect.ownKeys(oldDescriptors), Reflect.ownKeys(newDescriptors)))
    refuse('map own-key population changed');
  for (const key of Reflect.ownKeys(oldDescriptors)) {
    const old = oldDescriptors[key],
      next = newDescriptors[key];
    if (
      old.configurable !== next.configurable ||
      old.enumerable !== next.enumerable ||
      old.writable !== next.writable ||
      (key !== 'mappings' && !same(old.value, next.value))
    )
      refuse('map metadata or descriptor changed');
    if (
      Array.isArray(old.value) &&
      !same(
        Object.getOwnPropertyDescriptors(old.value),
        Object.getOwnPropertyDescriptors(next.value),
      )
    )
      refuse('map array descriptors changed');
  }
  if (ledger.length !== candidates.length) refuse('candidate ledger is incomplete');
  return {
    map,
    ledger,
    oldSegmentCount: before.flat().length,
    newSegmentCount: checked.flat().length,
  };
}
