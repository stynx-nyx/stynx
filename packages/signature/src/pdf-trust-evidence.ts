import { createHash } from 'node:crypto';
import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObjectParser,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { SignatureTrustError, SignatureTrustUnavailableError } from './errors.js';

const name = (value: string) => PDFName.of(value);
type Evidence = {
  certs: Uint8Array[];
  ocsp: Uint8Array[];
  crls: Uint8Array[];
  vriOcsp: Uint8Array[];
  vriCrls: Uint8Array[];
};
type XrefEntry = { offset: number; generation: number; inUse: boolean };
type XrefSection = { offset: number; end: number; previous?: number; trailer: PDFDict };
function failXref(): never {
  throw new SignatureTrustError('Post-signature modification');
}

function parsedObject(bytes: Uint8Array, context: PDFContext): { value: unknown; length: number } {
  try {
    const parser = PDFObjectParser.forBytes(bytes, context);
    const value = parser.parseObject();
    if (value instanceof PDFRawStream) {
      const declared = value.dict.get(name('Length'));
      if (!(declared instanceof PDFNumber) || declared.asNumber() !== value.getContentsSize())
        failXref();
    }
    const length = (parser as unknown as { bytes: { offset(): number } }).bytes.offset();
    if (!Number.isSafeInteger(length) || length <= 0) failXref();
    return { value, length };
  } catch {
    return failXref();
  }
}

function finalXref(
  bytes: Uint8Array,
  uniqueEntries = false,
): {
  entries: Map<number, XrefEntry>;
  sections: XrefSection[];
} {
  const text = Buffer.from(bytes).toString('latin1');
  const end = text.lastIndexOf('startxref');
  if (end < 0) failXref();
  const offsetMatch = /^startxref\s+(\d+)\s+%%EOF\s*$/u.exec(text.slice(end));
  if (!offsetMatch) failXref();
  let offset = Number(offsetMatch[1]);
  const entries = new Map<number, XrefEntry>();
  const sections: XrefSection[] = [];
  const seen = new Set<number>();
  while (Number.isSafeInteger(offset) && offset >= 0 && offset < bytes.length) {
    if (seen.has(offset)) failXref();
    if (text.slice(offset, offset + 4) !== 'xref') {
      throw new SignatureTrustUnavailableError('Unsupported PDF xref stream');
    }
    seen.add(offset);
    let cursor = offset + 4;
    const sectionEntries = new Set<number>();
    while (/\s/u.test(text[cursor]!)) cursor++;
    for (;;) {
      if (text.slice(cursor, cursor + 7) === 'trailer') {
        cursor += 7;
        break;
      }
      const header = /^(\d+)\s+(\d+)\s*/u.exec(text.slice(cursor));
      if (!header) failXref();
      const first = Number(header[1]);
      const count = Number(header[2]);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count > 100_000)
        failXref();
      cursor += header[0].length;
      for (let i = 0; i < count; i++) {
        if (uniqueEntries && sectionEntries.has(first + i)) failXref();
        sectionEntries.add(first + i);
        const line = /^(\d{10})\s+(\d{5})\s+([nf])\s*/u.exec(text.slice(cursor));
        if (!line) failXref();
        if (!entries.has(first + i))
          entries.set(first + i, {
            offset: Number(line[1]),
            generation: Number(line[2]),
            inUse: line[3] === 'n',
          });
        cursor += line[0].length;
      }
    }
    const parsed = parsedObject(bytes.subarray(cursor), PDFContext.create());
    if (!(parsed.value instanceof PDFDict)) failXref();
    const trailer = parsed.value;
    const raw = text.slice(cursor, cursor + parsed.length);
    const keys = [...raw.matchAll(/\/((?:#[0-9a-fA-F]{2}|[A-Za-z0-9])+)/gu)].map((match) =>
      match[1]!.replace(/#([0-9a-fA-F]{2})/gu, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
    );
    if (new Set(keys).size !== keys.length) failXref();
    if (keys.includes('XRefStm') || trailer.has(name('XRefStm'))) {
      throw new SignatureTrustUnavailableError('Unsupported PDF hybrid xref');
    }
    const declared = /^\s*startxref\s+(\d+)\s+%%EOF/u.exec(text.slice(cursor + parsed.length));
    if (!declared || Number(declared[1]) !== offset) failXref();
    const previousValue = trailer.get(name('Prev'));
    if (previousValue && !(previousValue instanceof PDFNumber)) failXref();
    const previous = previousValue?.asNumber();
    const sectionEnd = cursor + parsed.length + declared[0].length;
    sections.push({
      offset,
      end: sectionEnd,
      trailer,
      ...(previous === undefined ? {} : { previous }),
    });
    if (previous === undefined) return { entries, sections };
    offset = previous;
  }
  return failXref();
}

function checkFinalXref(
  pdf: Uint8Array,
  revisionEnd: number,
  catalogRef: PDFRef,
  context: PDFContext,
): SignatureTrustUnavailableError | undefined {
  const original = finalXref(pdf.slice(0, revisionEnd));
  let final: ReturnType<typeof finalXref>;
  try {
    final = finalXref(pdf);
  } catch (error) {
    if (error instanceof SignatureTrustUnavailableError) return error;
    throw error;
  }
  const text = Buffer.from(pdf).toString('latin1');
  const signedStart = original.sections[0]?.offset;
  const appended = final.sections.filter((section) => section.offset >= revisionEnd);
  if (!signedStart || !appended.length || appended.at(-1)!.previous !== signedStart) failXref();
  const effectiveCatalog = final.entries.get(catalogRef.objectNumber);
  if (
    !effectiveCatalog?.inUse ||
    effectiveCatalog.generation !== catalogRef.generationNumber ||
    effectiveCatalog.offset < revisionEnd
  )
    failXref();
  const signedTrailer = original.sections[0]!.trailer;
  for (const section of appended) {
    for (const key of ['Root', 'Encrypt', 'Info']) {
      if (!sameObject(section.trailer.get(name(key)), signedTrailer.get(name(key)))) {
        if (section.trailer.has(name(key)) || signedTrailer.has(name(key))) failXref();
      }
    }
  }
  const intervals: Array<readonly [number, number]> = [];
  for (const [number, entry] of original.entries) {
    const current = final.entries.get(number);
    if (
      !current ||
      current.inUse !== entry.inUse ||
      current.generation !== entry.generation ||
      (entry.inUse && number !== catalogRef.objectNumber && current.offset !== entry.offset)
    )
      failXref();
  }
  for (const [number, entry] of final.entries) {
    if (entry.inUse && !original.entries.has(number) && entry.offset < revisionEnd) failXref();
    if (!entry.inUse || entry.offset < revisionEnd) continue;
    const header = new RegExp(`^${number}\\s+${entry.generation}\\s+obj\\b`, 'u').exec(
      text.slice(entry.offset),
    );
    if (!header) failXref();
    const parsed = parsedObject(pdf.subarray(entry.offset + header[0].length), context);
    if (
      parsed.value instanceof PDFRawStream &&
      parsed.value.dict.lookupMaybe(name('Type'), PDFName)?.toString() === '/XRef'
    )
      failXref();
    const expected = context.lookup(PDFRef.of(number, entry.generation));
    if (!sameObject(parsed.value, expected)) failXref();
    intervals.push([entry.offset, entry.offset + header[0].length + parsed.length]);
  }
  for (const [start, end] of intervals) {
    if (intervals.some(([other]) => other !== start && other > start && other < end)) failXref();
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    const entry = final.entries.get(ref.objectNumber);
    if (!entry?.inUse || entry.generation !== ref.generationNumber) failXref();
  }
  return undefined;
}

export async function readSelectedSignatureDictionary(
  pdf: Uint8Array,
  revisionEnd: number,
  byteRange: readonly number[],
  cms: Uint8Array,
): Promise<{ manifest?: string }> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(pdf.slice(0, revisionEnd), { updateMetadata: false });
  } catch {
    throw new SignatureTrustError('Signed PDF signature dictionary invalid');
  }
  const found: PDFDict[] = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const range = object.get(name('ByteRange'));
    const contents = object.get(name('Contents'));
    if (!(range instanceof PDFArray) || !(contents instanceof PDFHexString) || range.size() !== 4)
      continue;
    const values = Array.from({ length: 4 }, (_, i) => range.lookupMaybe(i, PDFNumber)?.asNumber());
    if (
      values.some((value, i) => value !== byteRange[i]) ||
      !Buffer.from(contents.asBytes()).subarray(0, cms.length).equals(Buffer.from(cms))
    )
      continue;
    found.push(object);
  }
  if (found.length !== 1)
    throw new SignatureTrustError('Selected PDF signature dictionary missing or ambiguous');
  const selected = found[0]!;
  if (selected.lookupMaybe(name('SubFilter'), PDFName)?.toString() !== '/ETSI.CAdES.detached')
    throw new SignatureTrustError('CAdES PAdES subfilter absent');
  const binding = selected.lookupMaybe(name('STYNXManifestSHA256'), PDFString)?.decodeText();
  if (binding && !/^[0-9a-f]{64}$/u.test(binding))
    throw new SignatureTrustError('Signed manifest binding malformed');
  return binding ? { manifest: binding } : {};
}

export async function readWithdrawalSourceBinding(source: Uint8Array): Promise<string | undefined> {
  try {
    const document = await PDFDocument.load(source, { updateMetadata: false });
    const binding = document.catalog
      .lookupMaybe(name('STYNXWithdrawalSHA256'), PDFString)
      ?.decodeText();
    return binding && /^[0-9a-f]{64}$/u.test(binding) ? binding : undefined;
  } catch {
    throw new SignatureTrustError('Withdrawal source PDF invalid');
  }
}

function streams(dict: PDFDict, key: string): Uint8Array[] {
  const array = dict.lookupMaybe(name(key), PDFArray);
  if (!array) return [];
  const result: Uint8Array[] = [];
  for (let i = 0; i < array.size(); i++) {
    const stream = array.lookupMaybe(i, PDFRawStream);
    if (!stream) throw new SignatureTrustError('DSS evidence is not a PDF stream');
    try {
      result.push(decodePDFRawStream(stream).decode());
    } catch {
      throw new SignatureTrustError('DSS evidence stream cannot be decoded');
    }
  }
  return result;
}

function sameObject(a: unknown, b: unknown): boolean {
  return (
    !!a &&
    !!b &&
    (a as { toString(): string }).toString() === (b as { toString(): string }).toString()
  );
}

/** Reject duplicate decoded dictionary keys before pdf-lib can discard them. */
function uniqueDictionaryKeys(raw: string): void {
  let cursor = 0;
  const space = (): void => {
    for (;;) {
      while (/\s/u.test(raw[cursor] ?? '') && cursor < raw.length) cursor++;
      if (raw[cursor] !== '%') return;
      while (cursor < raw.length && !/[\r\n]/u.test(raw[cursor]!)) cursor++;
    }
  };
  const pdfName = (): string => {
    if (raw[cursor++] !== '/') return failXref();
    const start = cursor;
    while (cursor < raw.length && !/[\s()[\]<>/%]/u.test(raw[cursor]!)) cursor++;
    return raw
      .slice(start, cursor)
      .replace(/#([0-9a-fA-F]{2})/gu, (_whole, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  };
  const value = (depth: number): void => {
    if (depth > 32) failXref();
    space();
    if (raw.slice(cursor, cursor + 2) === '<<') {
      cursor += 2;
      const keys = new Set<string>();
      for (;;) {
        space();
        if (raw.slice(cursor, cursor + 2) === '>>') {
          cursor += 2;
          return;
        }
        const key = pdfName();
        if (keys.has(key)) failXref();
        keys.add(key);
        value(depth + 1);
      }
    }
    if (raw[cursor] === '[') {
      cursor++;
      for (;;) {
        space();
        if (raw[cursor] === ']') {
          cursor++;
          return;
        }
        value(depth + 1);
      }
    }
    if (raw[cursor] === '(') {
      cursor++;
      let nested = 1;
      while (cursor < raw.length && nested) {
        const character = raw[cursor++];
        if (character === '\\') cursor++;
        else if (character === '(') nested++;
        else if (character === ')') nested--;
      }
      if (nested) failXref();
      return;
    }
    if (raw[cursor] === '<') {
      const hex = /^<[0-9a-fA-F\s]*>/u.exec(raw.slice(cursor));
      if (!hex) failXref();
      cursor += hex[0].length;
      return;
    }
    if (raw[cursor] === '/') {
      pdfName();
      return;
    }
    const reference = /^\d+\s+\d+\s+R\b/u.exec(raw.slice(cursor));
    const scalar =
      reference ??
      /^(?:[+-]?(?:\d+\.\d*|\.\d+|\d+)|true\b|false\b|null\b)/u.exec(raw.slice(cursor));
    if (!scalar) failXref();
    cursor += scalar[0].length;
  };
  value(0);
}

function collectRefs(
  value: unknown,
  context: PDFDocument['context'],
  seen: Set<string>,
  depth = 0,
): void {
  if (depth > 32) throw new SignatureTrustError('DSS object graph is too deep');
  if (value instanceof PDFRef) {
    const key = value.toString();
    if (seen.has(key)) return;
    seen.add(key);
    collectRefs(context.lookup(value), context, seen, depth + 1);
  } else if (value instanceof PDFDict) {
    for (const [, child] of value.entries()) collectRefs(child, context, seen, depth + 1);
  } else if (value instanceof PDFArray) {
    for (const child of value.asArray()) collectRefs(child, context, seen, depth + 1);
  }
}

export async function readPdfTrustEvidence(
  pdf: Uint8Array,
  revisionEnd: number,
  cms: Uint8Array,
): Promise<Evidence> {
  const empty: Evidence = { certs: [], ocsp: [], crls: [], vriOcsp: [], vriCrls: [] };
  if (revisionEnd === pdf.length) return empty;
  let previous: PDFDocument;
  let complete: PDFDocument;
  try {
    previous = await PDFDocument.load(pdf.slice(0, revisionEnd), { updateMetadata: false });
    complete = await PDFDocument.load(pdf, { updateMetadata: false });
  } catch {
    throw new SignatureTrustError('Post-signature modification');
  }
  const oldObjects = new Map(
    previous.context.enumerateIndirectObjects().map(([ref, obj]) => [ref.toString(), obj]),
  );
  const allObjects = new Map(
    complete.context.enumerateIndirectObjects().map(([ref, obj]) => [ref.toString(), obj]),
  );
  const oldCatalog = previous.catalog;
  const catalog = complete.catalog;
  const catalogRef = previous.context.getObjectRef(oldCatalog);
  if (!catalogRef) throw new SignatureTrustError('Post-signature modification');
  const unsupportedXref = checkFinalXref(pdf, revisionEnd, catalogRef, complete.context);
  if (!sameObject(complete.context.lookup(catalogRef), complete.catalog))
    throw new SignatureTrustError('Post-signature modification');
  if (
    oldCatalog.has(name('DSS')) ||
    !catalog.has(name('DSS')) ||
    catalog.keys().length !== oldCatalog.keys().length + 1
  )
    throw new SignatureTrustError('Post-signature modification');
  for (const [key, value] of oldCatalog.entries()) {
    if (!sameObject(value, catalog.get(key)))
      throw new SignatureTrustError('Post-signature modification');
  }
  const dss = catalog.lookupMaybe(name('DSS'), PDFDict);
  if (!dss) throw new SignatureTrustError('Post-signature modification');
  for (const [key, obj] of oldObjects) {
    if (key === catalogRef.toString()) continue;
    if (!sameObject(obj, allObjects.get(key)))
      throw new SignatureTrustError('Post-signature modification');
  }
  const reachable = new Set<string>();
  collectRefs(catalog.get(name('DSS')), complete.context, reachable);
  for (const key of allObjects.keys()) {
    if (oldObjects.has(key) || reachable.has(key)) continue;
    throw new SignatureTrustError('Post-signature modification');
  }
  const vri = dss.lookupMaybe(name('VRI'), PDFDict);
  const vriKey = createHash('sha1').update(cms).digest('hex').toUpperCase();
  const entry = vri?.lookupMaybe(name(vriKey), PDFDict);
  const globalOcsp = streams(dss, 'OCSPs');
  const globalCrls = streams(dss, 'CRLs');
  const evidence = {
    certs: streams(dss, 'Certs'),
    ocsp: globalOcsp,
    crls: globalCrls,
    vriOcsp: entry ? streams(entry, 'OCSP') : globalOcsp,
    vriCrls: entry ? streams(entry, 'CRL') : globalCrls,
  };
  const contains = (haystack: Uint8Array[], item: Uint8Array) =>
    haystack.some((candidate) => Buffer.from(candidate).equals(Buffer.from(item)));
  if (
    !evidence.certs.length ||
    evidence.vriOcsp.some((item) => !contains(evidence.ocsp, item)) ||
    evidence.vriCrls.some((item) => !contains(evidence.crls, item))
  )
    throw new SignatureTrustError('DSS VRI evidence is unbound');
  if (unsupportedXref) throw unsupportedXref;
  return evidence;
}

/** The sole admitted LTA layout is one unchanged DSS followed by one invisible timestamp field. */
export async function readLtaPdfEvidence(
  pdf: Uint8Array,
  revisionEnd: number,
  cms: Uint8Array,
): Promise<{
  evidence: Evidence;
  token: Uint8Array;
  covered: Uint8Array;
}> {
  const original = finalXref(pdf.slice(0, revisionEnd), true);
  const final = finalXref(pdf, true);
  const appended = final.sections.filter((section) => section.offset >= revisionEnd);
  if (appended.length < 2) {
    await readPdfTrustEvidence(pdf, revisionEnd, cms);
    throw new SignatureTrustError('Archive timestamp evidence unavailable');
  }
  if (
    appended.length !== 2 ||
    final.sections.length !== original.sections.length + 2 ||
    appended[1]!.previous !== original.sections[0]!.offset ||
    appended[0]!.previous !== appended[1]!.offset
  )
    failXref();
  const dssEnd = appended[1]!.end;
  const evidence = await readPdfTrustEvidence(pdf.slice(0, dssEnd), revisionEnd, cms);
  const dssXref = finalXref(pdf.slice(0, dssEnd), true);
  let prior: PDFDocument;
  let complete: PDFDocument;
  try {
    prior = await PDFDocument.load(pdf.slice(0, dssEnd), { updateMetadata: false });
    complete = await PDFDocument.load(pdf, { updateMetadata: false });
  } catch {
    return failXref();
  }
  const catalogRef = prior.context.getObjectRef(prior.catalog);
  if (!catalogRef || !sameObject(prior.catalog, complete.catalog)) failXref();
  const formRef = prior.catalog.get(name('AcroForm'));
  if (!(formRef instanceof PDFRef)) failXref();
  const priorForm = prior.context.lookup(formRef);
  const form = complete.context.lookup(formRef);
  if (
    !(priorForm instanceof PDFDict) ||
    !(form instanceof PDFDict) ||
    priorForm.keys().length !== form.keys().length
  )
    failXref();
  for (const [key, value] of priorForm.entries())
    if (key.toString() !== '/Fields' && !sameObject(value, form.get(key))) failXref();
  // Deliberately no indirect Fields-array, new AcroForm, parent/kids, appearance,
  // page annotation or visible-widget support in this minimal revision shape.
  const priorFields = priorForm.get(name('Fields'));
  const fields = form.get(name('Fields'));
  if (
    !(priorFields instanceof PDFArray) ||
    !(fields instanceof PDFArray) ||
    fields.size() !== priorFields.size() + 1
  )
    failXref();
  for (let index = 0; index < priorFields.size(); index++)
    if (!sameObject(priorFields.get(index), fields.get(index))) failXref();
  const fieldRef = fields.get(fields.size() - 1);
  if (!(fieldRef instanceof PDFRef)) failXref();
  const field = complete.context.lookup(fieldRef);
  if (
    !(field instanceof PDFDict) ||
    field
      .keys()
      .some(
        (key) => !['/Type', '/Subtype', '/FT', '/T', '/Rect', '/P', '/V'].includes(key.toString()),
      ) ||
    field.lookupMaybe(name('Type'), PDFName)?.toString() !== '/Annot' ||
    field.lookupMaybe(name('Subtype'), PDFName)?.toString() !== '/Widget' ||
    field.lookupMaybe(name('FT'), PDFName)?.toString() !== '/Sig' ||
    !(field.get(name('T')) instanceof PDFString)
  )
    failXref();
  const rectangle = field.get(name('Rect'));
  if (
    !(rectangle instanceof PDFArray) ||
    rectangle.size() !== 4 ||
    rectangle.asArray().some((value) => !(value instanceof PDFNumber) || value.asNumber() !== 0)
  )
    failXref();
  const page = field.get(name('P'));
  if (!(page instanceof PDFRef) || !prior.getPages().some((value) => sameObject(value.ref, page)))
    failXref();
  const stampRef = field.get(name('V'));
  if (!(stampRef instanceof PDFRef)) failXref();
  const stamp = complete.context.lookup(stampRef);
  if (
    !(stamp instanceof PDFDict) ||
    stamp
      .keys()
      .some(
        (key) =>
          !['/Type', '/Filter', '/SubFilter', '/ByteRange', '/Contents'].includes(key.toString()),
      ) ||
    stamp.lookupMaybe(name('Type'), PDFName)?.toString() !== '/DocTimeStamp' ||
    stamp.lookupMaybe(name('SubFilter'), PDFName)?.toString() !== '/ETSI.RFC3161' ||
    stamp.lookupMaybe(name('Filter'), PDFName)?.toString() !== '/Adobe.PPKLite'
  )
    failXref();
  const allowedNew = new Set([fieldRef.toString(), stampRef.toString()]);
  if (allowedNew.size !== 2) failXref();
  for (const [ref, object] of complete.context.enumerateIndirectObjects()) {
    const previous = prior.context.lookup(ref);
    if (allowedNew.has(ref.toString())) {
      if (previous) failXref();
    } else if (ref.toString() !== formRef.toString() && !sameObject(previous, object)) failXref();
  }
  for (const [number, entry] of dssXref.entries) {
    const current = final.entries.get(number);
    if (
      !current ||
      current.inUse !== entry.inUse ||
      current.generation !== entry.generation ||
      (entry.inUse && number !== formRef.objectNumber && current.offset !== entry.offset)
    )
      failXref();
  }
  // Inspect every indexed definition and all inter-object bytes in each appended
  // revision. An orphan/unindexed object cannot hide behind an unused xref entry.
  const text = Buffer.from(pdf).toString('latin1');
  const whitespace = (value: string) => /^(?:\s|%[^\r\n]*(?:\r?\n|\r|$))*$/u.test(value);
  for (const [boundary, section] of [
    [revisionEnd, appended[1]!],
    [dssEnd, appended[0]!],
  ] as const) {
    const entries = (boundary === revisionEnd ? dssXref : final).entries;
    const intervals: Array<readonly [number, number]> = [];
    for (const [number, entry] of entries) {
      if (!entry.inUse || entry.offset < boundary) continue;
      if (entry.offset >= section.offset) failXref();
      const header = new RegExp(`^${number}\\s+${entry.generation}\\s+obj\\b`, 'u').exec(
        text.slice(entry.offset),
      );
      if (!header) failXref();
      const parsed = parsedObject(pdf.subarray(entry.offset + header[0].length), complete.context);
      uniqueDictionaryKeys(
        text.slice(
          entry.offset + header[0].length,
          entry.offset + header[0].length + parsed.length,
        ),
      );
      const end = entry.offset + header[0].length + parsed.length;
      const close = /^\s*endobj\b/u.exec(text.slice(end));
      if (
        !close ||
        !sameObject(parsed.value, complete.context.lookup(PDFRef.of(number, entry.generation)))
      )
        failXref();
      intervals.push([entry.offset, end + close[0].length]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let cursor = boundary;
    for (const [start, end] of intervals) {
      if (start < cursor || !whitespace(text.slice(cursor, start))) failXref();
      cursor = end;
    }
    if (!whitespace(text.slice(cursor, section.offset))) failXref();
  }
  const previousTrailer = dssXref.sections[0]!.trailer;
  const trailer = appended[0]!.trailer;
  for (const key of new Set(
    [...previousTrailer.keys(), ...trailer.keys()].map((key) => key.toString()),
  ))
    if (
      !['/Prev', '/Size'].includes(key) &&
      !sameObject(previousTrailer.get(name(key.slice(1))), trailer.get(name(key.slice(1))))
    )
      failXref();
  const signatureObjects = complete.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) =>
        object instanceof PDFDict &&
        (object.has(name('ByteRange')) ||
          ['/Sig', '/DocTimeStamp'].includes(
            object.lookupMaybe(name('Type'), PDFName)?.toString() ?? '',
          )),
    );
  if (signatureObjects.length !== 2) failXref();
  const range = stamp.get(name('ByteRange'));
  const contents = stamp.get(name('Contents'));
  if (!(range instanceof PDFArray) || range.size() !== 4 || !(contents instanceof PDFHexString))
    failXref();
  const values = range
    .asArray()
    .map((value) => (value instanceof PDFNumber ? value.asNumber() : NaN));
  const [start, before, after, tail] = values as [number, number, number, number];
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    start !== 0 ||
    before <= dssEnd ||
    after <= before ||
    after + tail !== pdf.length
  )
    failXref();
  const stampEntry = final.entries.get(stampRef.objectNumber);
  const gap = /^<([0-9a-fA-F]+)>$/u.exec(text.slice(before, after));
  if (
    !stampEntry ||
    stampEntry.offset < dssEnd ||
    stampEntry.offset >= before ||
    !gap ||
    !/^\/Contents\s*$/u.test(text.slice(text.lastIndexOf('/Contents', before), before))
  )
    failXref();
  const encoded = contents.asBytes();
  if (!Buffer.from(encoded).equals(Buffer.from(gap[1]!, 'hex'))) failXref();
  // DER length isolates the token; only zero placeholder padding may follow it.
  if (encoded[0] !== 0x30 || encoded.length < 2) failXref();
  let headerLength = 2;
  let length = encoded[1]!;
  if (length >= 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || encoded[2] === 0) failXref();
    headerLength += count;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + encoded[2 + i]!;
    if (length < 0x80) failXref();
  }
  const tokenEnd = headerLength + length;
  if (
    !Number.isSafeInteger(tokenEnd) ||
    tokenEnd > encoded.length ||
    encoded.subarray(tokenEnd).some((byte) => byte !== 0)
  )
    failXref();
  return {
    evidence,
    token: encoded.slice(0, tokenEnd),
    covered: Buffer.concat([pdf.subarray(0, before), pdf.subarray(after)]),
  };
}
