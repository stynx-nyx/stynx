import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { qualificationContext } from './support/http-qualification-fixture.mjs';

// INV-PERF-001: actual private IPC boundary, without application/resource allocation.
const worker = fileURLToPath(
  new URL('./support/http-qualification-channel-child.mjs', import.meta.url),
);
for (const scenario of ['accepted-prefix', 'send-replaced', 'clock-replaced', 'foreign-fixture'])
  test(`live channel ${scenario} preserves actual IPC and capability boundaries`, async () => {
    const child = spawn(process.execPath, [worker, scenario], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      timeout: 10_000,
    });
    const frames = [];
    let stderr = '';
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    child.on('message', (message) => frames.push(message));
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(status, { code: 0, signal: null }, stderr);
    const result = frames.pop();
    assert.deepEqual(result, {
      kind: 'inspector-child-complete',
      scenario,
      actualPid: child.pid,
      qualificationComplete: false,
    });
    assert.deepEqual(
      frames.map((frame) => frame.phase),
      scenario === 'foreign-fixture'
        ? []
        : scenario === 'accepted-prefix'
          ? ['start', 'factory']
          : ['start'],
    );
    for (const [index, frame] of frames.entries()) {
      assert.equal(frame.workerPid, child.pid);
      assert.equal(frame.operationId, qualificationContext().operationId);
      assert.equal(frame.sequence, index + 1);
      assert.equal(frame.mode, 'http-endpoint-qualification');
      assert.equal(frame.caseId, qualificationContext().caseId);
    }
    if (frames.length) {
      assert.equal(frames[0].elapsedNs, '0');
      assert.equal(frames[0].body.parentCorroborationRequired, true);
    }
  });
