import assert from 'node:assert/strict';
import {
  openReferenceLifecycleChannel,
  assertReferenceLifecycleChannel,
  emitReferenceLifecyclePhase,
  finishReferenceLifecycleChannel,
} from '../../../scripts/lib/http-reference-loopback-protocol.mjs';

// Real test-owned IPC child; no factory, resource controller, DB or listener.
const invalid = { code: 'HTTP_REFERENCE_LOOPBACK_PROTOCOL_INVALID' };
process.once('message', async ({ kind, job, phases }) => {
  try {
    const handle = await openReferenceLifecycleChannel(job);
    assertReferenceLifecycleChannel(handle, job);
    if (kind === 'success') {
      for (const phase of phases) await emitReferenceLifecyclePhase(handle, phase);
      await finishReferenceLifecycleChannel(handle, {
        observationArtifact: { diagnosticOnly: true },
        modules: { diagnosticOnly: true },
        trustedBootstrap: [],
      });
      await assert.rejects(finishReferenceLifecycleChannel(handle, {}), invalid);
      await assert.rejects(emitReferenceLifecyclePhase(handle, phases[0]), invalid);
    } else if (kind === 'phase-order') {
      await assert.rejects(emitReferenceLifecyclePhase(handle, phases[1]), invalid);
      await assert.rejects(emitReferenceLifecyclePhase(handle, phases[0]), invalid);
    } else if (kind === 'binding') {
      assert.throws(
        () => assertReferenceLifecycleChannel(handle, { ...job, tree: 'c'.repeat(40) }),
        invalid,
      );
      await assert.rejects(emitReferenceLifecyclePhase(handle, phases[0]), invalid);
    } else if (kind === 'send-drift') {
      const descriptor = Object.getOwnPropertyDescriptor(process, 'send');
      try {
        Object.defineProperty(process, 'send', {
          ...descriptor,
          value: function (...args) {
            return Reflect.apply(descriptor.value, this, args);
          },
        });
        assert.throws(() => assertReferenceLifecycleChannel(handle, job), invalid);
      } finally {
        Object.defineProperty(process, 'send', descriptor);
      }
      assert.throws(() => assertReferenceLifecycleChannel(handle, job), invalid);
    } else if (kind === 'reentrant') {
      const first = emitReferenceLifecyclePhase(handle, phases[0]);
      await assert.rejects(emitReferenceLifecyclePhase(handle, phases[0]), invalid);
      await assert.rejects(first, invalid);
    } else throw new Error('Unknown finite IPC child test');
    await new Promise((accept, reject) =>
      process.send(
        {
          inspectorResult: 'PASS',
          kind,
          pid: process.pid,
          actualFactoryInvoked: false,
          runtimeCustodyComplete: false,
          readinessPromoting: false,
        },
        (error) => (error ? reject(error) : accept()),
      ),
    );
    process.disconnect();
  } catch (error) {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
});
