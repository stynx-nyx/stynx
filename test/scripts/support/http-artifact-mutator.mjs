import { closeSync, ftruncateSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { workerData } from 'node:worker_threads';

// Actual owned filesystem faults. No read API, callback or accepted result is
// substituted. The parent records every read attempt and closes this worker.
const { path, kind, maximumBytes } = workerData;
const control = new Int32Array(workerData.control);
let fd = openSync(path, 'r+');
Atomics.store(control, 0, 1);
try {
  while (Atomics.load(control, 1) === 0) {
    if (kind === 'growth') {
      writeSync(fd, Buffer.from([1]), 0, 1, maximumBytes);
      ftruncateSync(fd, maximumBytes);
    } else if (kind === 'short-read') {
      ftruncateSync(fd, 1024);
      ftruncateSync(fd, maximumBytes);
    } else if (kind === 'replacement') {
      const temporary = `${path}.replacement`;
      const replacement = openSync(temporary, 'wx', 0o600);
      try {
        ftruncateSync(replacement, maximumBytes);
      } finally {
        closeSync(replacement);
      }
      renameSync(temporary, path);
      closeSync(fd);
      fd = openSync(path, 'r+');
    } else throw new Error('Unknown actual mutation');
    Atomics.add(control, 2, 1);
  }
} finally {
  closeSync(fd);
  rmSync(`${path}.replacement`, { force: true });
}
