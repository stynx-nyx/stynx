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
    if (kind === 'short-read') {
      // Per-attempt request/ready/go/done/finished handshake keeps the parent
      // from sampling one stable truncated file sixteen times. Reads and
      // truncations are still actual competing filesystem operations.
      const previous = Atomics.load(control, 7);
      while (Atomics.load(control, 3) === previous && Atomics.load(control, 1) === 0)
        Atomics.wait(control, 3, previous, 5_000);
      if (Atomics.load(control, 1) !== 0) break;
      const attempt = Atomics.load(control, 3);
      ftruncateSync(fd, maximumBytes);
      Atomics.store(control, 4, attempt);
      Atomics.notify(control, 4);
      while (Atomics.load(control, 5) !== attempt && Atomics.load(control, 1) === 0)
        Atomics.wait(control, 5, Atomics.load(control, 5), 5_000);
      if (Atomics.load(control, 1) !== 0) break;
      do {
        ftruncateSync(fd, 1024);
        ftruncateSync(fd, maximumBytes);
        Atomics.add(control, 2, 1);
      } while (Atomics.load(control, 6) !== attempt && Atomics.load(control, 1) === 0);
      Atomics.store(control, 7, attempt);
      Atomics.notify(control, 7);
      continue;
    }
    if (kind === 'growth') {
      writeSync(fd, Buffer.from([1]), 0, 1, maximumBytes);
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
