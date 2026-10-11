import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

const maximumBytes = 64 * 1024 * 1024;
const identityFields = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];

function refuse() {
  const error = new Error(
    'Private qualification artifact is linked, oversized, changed or incomplete',
  );
  error.code = 'HTTP_QUALIFICATION_ARTIFACT_INVALID';
  throw error;
}

function sameIdentity(left, right) {
  return identityFields.every((key) => left[key] === right[key]);
}

// A bounded byte-acquisition component, never runtime or measurement authority.
// Open without following the final symlink or blocking on a substituted FIFO;
// allocate only after inspecting the actual descriptor, and reject any drift.
export function readHttpQualificationArtifact(root, path) {
  if (
    arguments.length !== 2 ||
    typeof root !== 'string' ||
    typeof path !== 'string' ||
    !isAbsolute(root) ||
    !isAbsolute(path) ||
    !Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_NONBLOCK) ||
    realpathSync(root) !== root
  )
    refuse();
  const name = relative(root, path);
  if (!name || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) refuse();
  const initial = lstatSync(path, { bigint: true });
  if (!initial.isFile() || realpathSync(path) !== path) refuse();
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      !sameIdentity(initial, opened) ||
      opened.nlink !== 1n ||
      (opened.mode & 0o7777n) !== 0o600n ||
      typeof process.getuid !== 'function' ||
      opened.uid !== BigInt(process.getuid()) ||
      opened.size < 0n ||
      opened.size > BigInt(maximumBytes)
    )
      refuse();
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) refuse();
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, offset) !== 0) refuse();
    const final = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      !sameIdentity(opened, final) ||
      !sameIdentity(opened, current) ||
      realpathSync(root) !== root ||
      realpathSync(path) !== path
    )
      refuse();
    return {
      bytes,
      row: {
        path: name.split(sep).join('/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.length,
        permissions: Number(opened.mode & 0o7777n),
      },
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
