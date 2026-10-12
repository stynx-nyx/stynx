import { linkSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { workerData } from 'node:worker_threads';

// Inspector-owned external filesystem fault. The production store and its native
// operations remain unchanged; this actor links the pending inode or swaps an
// actual ancestor while the pending body is being written.
const state = new Int32Array(workerData.signal);
Atomics.store(state, 0, 1);
Atomics.notify(state, 0);
const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  const name = readdirSync(workerData.directory).find((entry) => entry.startsWith('pending-'));
  if (!name) continue;
  try {
    if (workerData.mutation === 'swap-directory') {
      renameSync(workerData.ancestor, workerData.retained);
      mkdirSync(workerData.ancestor, { mode: 0o700 });
    } else linkSync(join(workerData.directory, name), workerData.alias);
    Atomics.store(state, 0, 2);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    Atomics.store(state, 0, 3);
  }
  Atomics.notify(state, 0);
  break;
}
if (Atomics.load(state, 0) === 1) {
  Atomics.store(state, 0, 4);
  Atomics.notify(state, 0);
}
