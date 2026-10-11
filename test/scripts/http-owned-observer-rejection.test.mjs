import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// INV-PERF-001: actual owned process delivery; no native/workload admission.
test('actual rejected native observer Promise is drained without consulting an overridden catch', () => {
  const moduleUrl = new URL('../../scripts/lib/http-owned-worker.mjs', import.meta.url).href;
  const program = `
    import {createOwnedHttpWorker,launchOwnedHttpNativeGenerator,observeOwnedHttpWorker,waitOwnedHttpWorkerClose,reapOwnedHttpWorker} from ${JSON.stringify(moduleUrl)};
    const unhandled=[];let catchReads=0;
    process.on('unhandledRejection',reason=>unhandled.push(String(reason?.message??reason)));
    const handle=createOwnedHttpWorker();
    launchOwnedHttpNativeGenerator(handle,{executable:process.execPath,argv:['-e','process.stdout.write("one native output");'],cwd:process.cwd(),environment:{}});
    observeOwnedHttpWorker(handle,{stdout(){
      const returned=Promise.reject(new Error('owned observer rejection witness'));
      Object.defineProperty(returned,'catch',{get(){catchReads++;throw new Error('caller catch must not run');}});
      return returned;
    }});
    await waitOwnedHttpWorkerClose(handle);
    const receipt=await reapOwnedHttpWorker(handle);
    await new Promise(resolve=>setImmediate(resolve));
    process.stdout.write(JSON.stringify({unhandled,catchReads,receipt}));
  `;
  const bytes = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: process.cwd(),
    env: {},
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  const result = JSON.parse(bytes);
  assert.deepEqual(result.unhandled, []);
  assert.equal(result.catchReads, 0);
  assert.equal(result.receipt.subscriberFailureCount, 1);
  assert.equal(result.receipt.groupOutcome, 'ABSENT');
  assert.equal(result.receipt.absenceBasis, 'NATIVE_CLOSE_AND_GROUP_ESRCH');
  assert.equal(result.receipt.runtimeCustodyComplete, false);
  assert.equal(result.receipt.performanceQualified, false);
  assert.equal(result.receipt.readinessPromoting, false);
});
