import { decode, encode } from '@jridgewell/sourcemap-codec';
import ts from 'typescript';
import { types } from 'node:util';

/** @param {unknown} left @param {unknown} right */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
/** @param {string} message @returns {never} */
const refuse = (message) => {
  throw new Error(`Native source map: ${message}`);
};

/** @param {unknown} value @param {string[]} required @param {string[]} [optional] */
function dataRecord(value, required, optional = []) {
  if (
    types.isProxy(value) ||
    !opaqueRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuse('expected an ordinary map record');
  const descriptors = ownDescriptors(value);
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

/** @param {unknown} value @returns {unknown[]} */
function dataArray(value) {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    refuse('expected an ordinary dense array');
  const descriptors = ownDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => descriptors[index]).some(
      (entry) => !entry || !('value' in entry) || !entry.enumerable,
    )
  )
    refuse('array holes, accessors or extra keys are unsupported');
  return value;
}

/** @param {unknown} code @param {string} name @param {import('typescript').ScriptKind} kind */
function syntax(code, name, kind) {
  if (typeof code !== 'string') refuse('representation code must be a string');
  const parsed = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, kind);
  /** @type {unknown} */
  const parseDiagnostics = Reflect.get(parsed, 'parseDiagnostics');
  if (!Array.isArray(parseDiagnostics) || parseDiagnostics.length !== 0)
    refuse('representation parser diagnostics');
  const sourceCode = code;
  /** @type {Map<number, {relationKind: string, spanLength: number}>} */
  const spans = new Map();
  /** @param {import('typescript').Node} node */
  function visit(node) {
    const start = node.getStart(parsed);
    if (node.kind === ts.SyntaxKind.CloseBraceToken || node.kind === ts.SyntaxKind.SemicolonToken) {
      const literal = node.kind === ts.SyntaxKind.CloseBraceToken ? '}' : ';';
      if (node.end !== start + 1 || sourceCode[start] !== literal)
        refuse('token boundary mismatch');
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
        denseEntry(children, 0).kind !== ts.SyntaxKind.ReturnKeyword ||
        denseEntry(children, 0).getStart(parsed) !== start ||
        denseEntry(children, 0).end !== start + 6 ||
        denseEntry(children, 1).kind !== ts.SyntaxKind.SemicolonToken ||
        denseEntry(children, 1).getStart(parsed) !== start + 6 ||
        denseEntry(children, 1).end !== start + 7
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

/** @param {unknown} incomingMap @param {ReturnType<typeof syntax>} generated @param {ReturnType<typeof syntax>} original */
function decodeMap(incomingMap, generated, original) {
  const map = dataRecord(
    incomingMap,
    ['version', 'names', 'sources', 'sourcesContent', 'mappings'],
    ['file', 'sourceRoot', 'ignoreList'],
  );
  if (map.version !== 3 || typeof map.mappings !== 'string')
    refuse('map identity or required grammar mismatch');
  const sources = dataArray(map.sources);
  if (sources.length !== 1 || typeof sources[0] !== 'string' || sources[0] === '')
    refuse('map identity or required grammar mismatch');
  const sourcesContent = dataArray(map.sourcesContent);
  if (sourcesContent.length !== 1 || sourcesContent[0] !== original.code)
    refuse('map identity or required grammar mismatch');
  const names = dataArray(map.names);
  if (names.some((name) => typeof name !== 'string'))
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
        (index) =>
          typeof index !== 'number' ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= sources.length,
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
        segment[0] > denseEntry(generated.lengths, line)
      )
        refuse('invalid or unordered generated coordinate');
      previous = segment[0];
      if (
        segment.length !== 1 &&
        (segment[1] !== 0 ||
          segment[2] >= original.lengths.length ||
          segment[3] > denseEntry(original.lengths, segment[2]) ||
          (segment.length === 5 && segment[4] >= names.length))
      )
        refuse('invalid source or name coordinate');
    }
  }
  return decoded;
}

/** @param {unknown} map @param {string} mappings @returns {Record<PropertyKey, unknown>} */
function cloneMapWithMappings(map, mappings) {
  const descriptors = ownDescriptors(map);
  for (const descriptor of Object.values(descriptors)) {
    if (Array.isArray(descriptor.value)) {
      descriptor.value = Object.defineProperties([], ownDescriptors(descriptor.value));
    }
  }
  const mappingsDescriptor = descriptors.mappings;
  if (!mappingsDescriptor) refuse('map metadata or descriptor changed');
  mappingsDescriptor.value = mappings;
  return Object.defineProperties({}, descriptors);
}

/** Derive only existing compiler-proven endpoints; no coverage counters are accepted.
 * @param {unknown} incomingInput
 */
export function repairSourceMap(incomingInput) {
  const input = dataRecord(incomingInput, ['sourceName', 'source', 'compiler', 'actual']);
  const { sourceName, source, compiler: incomingCompiler, actual: incomingActual } = input;
  if (typeof sourceName !== 'string' || sourceName === '') refuse('source identity is required');
  const compiler = dataRecord(incomingCompiler, ['code', 'map']);
  const actual = dataRecord(incomingActual, ['code', 'map']);
  const original = syntax(source, sourceName, ts.ScriptKind.TS);
  const emitted = syntax(compiler.code, `${sourceName}.esm.js`, ts.ScriptKind.JS);
  const ssr = syntax(actual.code, `${sourceName}.ssr.js`, ts.ScriptKind.JS);
  const emission = decodeMap(compiler.map, emitted, original);
  const before = decodeMap(actual.map, ssr, original);
  const derived = structuredClone(before);
  /** @type {EndpointCandidate[]} */
  const candidates = [];
  for (const [line, segments] of emission.entries()) {
    for (let index = 0; index < segments.length - 1; index++) {
      const left = denseEntry(segments, index),
        right = denseEntry(segments, index + 1);
      if (left.length !== 4 || right.length !== 4 || right[1] !== left[1] || right[2] !== left[2])
        continue;
      const originalOffset = denseEntry(original.starts, left[2]) + left[3];
      const compilerOffset = denseEntry(emitted.starts, line) + left[0];
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
  const seen = new Set();
  /** @type {EndpointLedger[]} */
  const ledger = [];
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
    const { line, segment } = denseEntry(matches, 0);
    const ssrOffset = denseEntry(ssr.starts, line) + segment[0];
    if (
      !same(ssr.spans.get(ssrOffset), {
        relationKind: candidate.relationKind,
        spanLength: candidate.spanLength,
      })
    )
      refuse('SSR/source span mismatch');
    /** @type {[number, number, number, number]} */
    const added = [
      segment[0] + candidate.spanLength,
      0,
      candidate.sourceLine,
      candidate.sourceRight,
    ];
    if (added[0] > denseEntry(ssr.lengths, line)) refuse('SSR endpoint outside line');
    const existing = denseEntry(derived, line).find((entry) => entry[0] === added[0]);
    if (existing && !same(existing, added)) refuse('mapped or unmapped endpoint collision');
    if (!existing) {
      denseEntry(derived, line).push(added);
      denseEntry(derived, line).sort((left, right) => left[0] - right[0]);
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
  for (const row of ledger)
    if (row.status === 'INSERTED') denseEntry(expected, row.ssrLine).push(row.ssrRight);
  for (const line of expected) line.sort((left, right) => left[0] - right[0]);
  if (!same(checked, expected)) refuse('ordered original/addition population changed');
  const oldDescriptors = ownDescriptors(actual.map);
  const newDescriptors = ownDescriptors(map);
  if (!same(Reflect.ownKeys(oldDescriptors), Reflect.ownKeys(newDescriptors)))
    refuse('map own-key population changed');
  for (const key of Reflect.ownKeys(oldDescriptors)) {
    const old = oldDescriptors[key],
      next = newDescriptors[key];
    if (!old || !next) refuse('map metadata or descriptor changed');
    if (
      old.configurable !== next.configurable ||
      old.enumerable !== next.enumerable ||
      old.writable !== next.writable ||
      (key !== 'mappings' && !same(old.value, next.value))
    )
      refuse('map metadata or descriptor changed');
    if (Array.isArray(old.value) && !same(ownDescriptors(old.value), ownDescriptors(next.value)))
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

/** Only an opaque property view; no source-map fields are claimed here.
 * @param {unknown} value
 * @returns {value is Record<PropertyKey, unknown>}
 */
function opaqueRecord(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** Native descriptors keep their actual values unknown.
 * @param {unknown} value
 * @returns {Record<PropertyKey, TypedPropertyDescriptor<unknown>>}
 */
function ownDescriptors(value) {
  return Object.getOwnPropertyDescriptors(value);
}

/** Index only actual native codec/parser sequences or construction-owned arrays.
 * Every caller establishes its dense, in-range domain before this read.
 * @template T
 * @param {readonly T[]} values
 * @param {number} index
 * @returns {T}
 */
function denseEntry(values, index) {
  const entry = values[index];
  if (entry === undefined) refuse('native dense sequence entry is missing');
  return entry;
}

/** @typedef {{relationKind: string, spanLength: number, originalOffset: number, compilerOffset: number, compilerLine: number, compilerLeft: [number, number, number, number], compilerRight: [number, number, number, number], sourceLine: number, sourceLeft: number, sourceRight: number}} EndpointCandidate */
/** @typedef {EndpointCandidate & ({ssrLeftMatches: 0, status: 'NOT_ELIGIBLE_NO_SSR_LEFT'} | {ssrOffset: number, ssrLine: number, ssrLeft: import('@jridgewell/sourcemap-codec').SourceMapSegment, ssrRight: [number, number, number, number], ssrLeftMatches: 1, status: 'ALREADY_PRESENT' | 'INSERTED'})} EndpointLedger */
