import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';

const maximumBytes = 64 * 1024 * 1024;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;

function refuse() {
  const error = new Error('Bounded qualification generator log capture refused');
  error.code = 'HTTP_QUALIFICATION_LOG_CAPTURE_INVALID';
  throw error;
}

function chunksSize(chunks) {
  if (
    types.isProxy(chunks) ||
    !Array.isArray(chunks) ||
    Object.getPrototypeOf(chunks) !== Array.prototype ||
    Reflect.ownKeys(chunks).length !== chunks.length + 1
  )
    refuse();
  let size = 0;
  for (let index = 0; index < chunks.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(chunks, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse();
    const chunk = descriptor.value;
    if (
      types.isProxy(chunk) ||
      !Buffer.isBuffer(chunk) ||
      Object.getPrototypeOf(chunk) !== Buffer.prototype ||
      types.isSharedArrayBuffer(nativeBuffer.call(chunk))
    )
      refuse();
    size += nativeLength.call(chunk);
    if (size > maximumBytes) refuse();
  }
  return size;
}

function ownedDirectory(directory) {
  const stat = lstatSync(directory);
  if (
    !stat.isDirectory() ||
    realpathSync(directory) !== directory ||
    typeof process.getuid !== 'function' ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o7777) !== 0o700
  )
    refuse();
}

// Byte capture only: fixed destinations are derived internally, and both writes
// are attempted even if the first fails. Cleanup/acceptance remain parent-owned.
export function captureHttpQualificationGeneratorLogs(
  directory,
  generatorOperationId,
  stdoutChunks,
  stderrChunks,
) {
  if (
    arguments.length !== 4 ||
    typeof directory !== 'string' ||
    !isAbsolute(directory) ||
    typeof generatorOperationId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      generatorOperationId,
    )
  )
    refuse();
  const sizes = [chunksSize(stdoutChunks), chunksSize(stderrChunks)];
  if (sizes[0] + sizes[1] > maximumBytes) refuse();
  const captured = [],
    failures = [];
  for (const [index, stream, chunks] of [
    [0, 'stdout', stdoutChunks],
    [1, 'stderr', stderrChunks],
  ]) {
    try {
      ownedDirectory(directory);
      const bytes = Buffer.alloc(sizes[index]);
      let offset = 0;
      for (let item = 0; item < chunks.length; item++) {
        const chunk = Object.getOwnPropertyDescriptor(chunks, String(item)).value;
        Uint8Array.prototype.set.call(bytes, chunk, offset);
        offset += nativeLength.call(chunk);
      }
      const path = resolve(directory, `${generatorOperationId}.${stream}.log`);
      writeFileSync(path, bytes, { mode: 0o600, flag: 'wx', flush: true });
      ownedDirectory(directory);
      captured.push({
        stream,
        path,
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    } catch (error) {
      failures.push({ stream, code: error.code ?? 'HTTP_QUALIFICATION_LOG_CAPTURE_INVALID' });
    }
  }
  if (failures.length) {
    const error = new Error('One or more durable qualification generator logs were not captured');
    error.code = 'HTTP_QUALIFICATION_LOG_CAPTURE_INCOMPLETE';
    error.failures = failures;
    error.captured = captured;
    throw error;
  }
  return {
    scope: 'qualification-generator-log-byte-capture-component',
    captured,
    captureComplete: true,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
