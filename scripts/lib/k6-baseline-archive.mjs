// Inspect an authenticated archive in memory; never extract archive paths.
// Transport/run provenance and measurement completeness remain separate obligations.
import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { types } from 'node:util';

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 64;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const refuse = (message) => {
  throw new Error(`BASELINE_ARCHIVE_REFUSED: ${message}`);
};

function closedRecord(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    refuse('invalid options');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'),
    )
  )
    refuse('options must be closed own data');
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function expectedNames(roster) {
  if (
    types.isProxy(roster) ||
    !Array.isArray(roster) ||
    Object.getPrototypeOf(roster) !== Array.prototype
  )
    refuse('invalid roster');
  const descriptors = Object.getOwnPropertyDescriptors(roster);
  const length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_ENTRIES ||
    Reflect.ownKeys(descriptors).length !== length + 1
  )
    refuse('invalid roster size');
  const names = [];
  for (let i = 0; i < length; i += 1) {
    const item = descriptors[i];
    if (
      !item ||
      !Object.hasOwn(item, 'value') ||
      typeof item.value !== 'string' ||
      !/^[a-z0-9][a-z0-9.-]{0,79}$/u.test(item.value) ||
      item.value.includes('..') ||
      item.value.startsWith('.') ||
      item.value.endsWith('.')
    )
      refuse('unsafe roster name');
    names.push(item.value);
  }
  if (new Set(names).size !== length) refuse('duplicate roster names');
  return names;
}

/** Verify digest and closed regular-file roster without filesystem writes.
 * Returned body snapshots are caller-owned mutable Buffers; consume or rehash before trust.
 * Neither this result nor frozen metadata attest remote origin or measurement completeness. */
export function inspectBaselineArchive(options) {
  const { bytes: input, sha256, roster } = closedRecord(options, ['bytes', 'sha256', 'roster']);
  if (
    types.isProxy(input) ||
    !Buffer.isBuffer(input) ||
    Object.getPrototypeOf(input) !== Buffer.prototype ||
    types.isSharedArrayBuffer(backingBuffer.call(input))
  )
    refuse('archive must be a private Buffer');
  const inputLength = bufferLength.call(input);
  if (inputLength < 22 || inputLength > MAX_ARCHIVE_BYTES) refuse('archive size');
  const bytes = Buffer.allocUnsafe(inputLength);
  Uint8Array.prototype.set.call(bytes, input);
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256) || digest(bytes) !== sha256)
    refuse('archive digest mismatch');
  const names = expectedNames(roster);
  const expected = new Set(names);
  const end = bytes.length - 22;
  const u16 = (offset) => bytes.readUInt16LE(offset);
  const u32 = (offset) => bytes.readUInt32LE(offset);
  const within = (offset, size, limit) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(size) ||
      offset < 0 ||
      size < 0 ||
      offset > limit ||
      size > limit - offset
    )
      refuse('truncated ZIP record');
  };
  if (
    u32(end) !== 0x06054b50 ||
    u16(end + 4) !== 0 ||
    u16(end + 6) !== 0 ||
    u16(end + 20) !== 0 ||
    u16(end + 8) !== u16(end + 10) ||
    u16(end + 10) !== names.length
  )
    refuse('unsupported ZIP end record');
  const directorySize = u32(end + 12);
  const directoryStart = u32(end + 16);
  within(directoryStart, directorySize, end);
  if (directoryStart + directorySize !== end) refuse('ZIP directory gap or trailing records');
  const entries = [];
  let cursor = directoryStart;
  let totalBytes = 0;
  for (let index = 0; index < names.length; index += 1) {
    within(cursor, 46, end);
    if (u32(cursor) !== 0x02014b50) refuse('invalid ZIP directory signature');
    const madeBy = u16(cursor + 4);
    const required = u16(cursor + 6);
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const checksum = u32(cursor + 16);
    const compressedSize = u32(cursor + 20);
    const size = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const external = u32(cursor + 38);
    const localOffset = u32(cursor + 42);
    within(cursor + 46, nameLength + extraLength + commentLength, end);
    if (
      ![10, 20].includes(required) ||
      (method === 8 && required !== 20) ||
      (flags & ~0x0808) !== 0 ||
      ![0, 8].includes(method) ||
      extraLength !== 0 ||
      commentLength !== 0 ||
      u16(cursor + 34) !== 0 ||
      u16(cursor + 36) !== 0
    )
      refuse('unsupported ZIP entry metadata');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = rawName.toString('ascii');
    if (!Buffer.from(name, 'ascii').equals(rawName) || !expected.delete(name))
      refuse('unexpected or duplicate archive member');
    const system = madeBy >>> 8;
    const mode = external >>> 16;
    if (
      (external & 0xffdf) !== 0 ||
      (system === 3 ? (mode & 0xf000) !== 0x8000 : system !== 0 || mode !== 0)
    )
      refuse('archive member is not a regular file');
    if (
      size < 1 ||
      size > MAX_ENTRY_BYTES ||
      compressedSize < 1 ||
      compressedSize > MAX_ARCHIVE_BYTES ||
      size > compressedSize * 1000 ||
      (method === 0 && compressedSize !== size)
    )
      refuse('ZIP size or compression limits');
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) refuse('ZIP total size limit');
    entries.push({
      name,
      required,
      flags,
      method,
      checksum,
      compressedSize,
      size,
      localOffset,
      time: u16(cursor + 12),
      date: u16(cursor + 14),
    });
    cursor += 46 + nameLength;
  }
  if (cursor !== end || expected.size !== 0) refuse('archive roster is not closed');
  entries.sort((a, b) => a.localOffset - b.localOffset);
  cursor = 0;
  const files = [];
  for (const entry of entries) {
    const {
      name,
      required,
      flags,
      method,
      checksum,
      compressedSize,
      size,
      localOffset,
      time,
      date,
    } = entry;
    if (localOffset !== cursor) refuse('overlapping ZIP entries, gaps or prepended data');
    within(cursor, 30, directoryStart);
    const nameLength = u16(cursor + 26);
    const extraLength = u16(cursor + 28);
    within(cursor + 30, nameLength + extraLength, directoryStart);
    if (
      u32(cursor) !== 0x04034b50 ||
      u16(cursor + 4) !== required ||
      u16(cursor + 6) !== flags ||
      u16(cursor + 8) !== method ||
      u16(cursor + 10) !== time ||
      u16(cursor + 12) !== date ||
      extraLength !== 0 ||
      !bytes.subarray(cursor + 30, cursor + 30 + nameLength).equals(Buffer.from(name))
    )
      refuse('ZIP local/directory metadata disagreement');
    const hasDescriptor = (flags & 8) !== 0;
    const localCrc = u32(cursor + 14);
    const localCompressed = u32(cursor + 18);
    const localSize = u32(cursor + 22);
    if (
      hasDescriptor
        ? localCrc !== 0 || localCompressed !== 0 || localSize !== 0
        : localCrc !== checksum || localCompressed !== compressedSize || localSize !== size
    )
      refuse('ZIP local sizes disagree');
    const payloadStart = cursor + 30 + nameLength;
    within(payloadStart, compressedSize, directoryStart);
    const compressed = bytes.subarray(payloadStart, payloadStart + compressedSize);
    let body;
    try {
      if (method === 0) body = Buffer.from(compressed);
      else {
        const inflated = inflateRawSync(compressed, {
          maxOutputLength: size,
          info: true,
        });
        if (inflated.engine.bytesWritten !== compressedSize) refuse('unused compressed bytes');
        body = inflated.buffer;
      }
    } catch {
      refuse('invalid or oversized compressed body');
    }
    if (body.length !== size || crc32(body) !== checksum) refuse('ZIP body size or CRC mismatch');
    cursor = payloadStart + compressedSize;
    if (hasDescriptor) {
      within(cursor, 16, directoryStart);
      if (
        u32(cursor) !== 0x08074b50 ||
        u32(cursor + 4) !== checksum ||
        u32(cursor + 8) !== compressedSize ||
        u32(cursor + 12) !== size
      )
        refuse('ZIP data descriptor mismatch');
      cursor += 16;
    }
    files.push(Object.freeze({ name, size, sha256: digest(body), bytes: body }));
  }
  if (cursor !== directoryStart) refuse('unused local ZIP records');
  return Object.freeze({
    archiveSha256: sha256,
    archiveBytes: bytes.length,
    totalBytes,
    files: Object.freeze(files.sort((a, b) => a.name.localeCompare(b.name))),
    originVerified: false,
    measurementComplete: false,
  });
}
