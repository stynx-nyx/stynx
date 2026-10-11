import {
  closeHttpOriginalParentExchange,
  openHttpOriginalParentExchange,
  waitHttpOriginalParentCommand,
} from '../../../scripts/lib/http-original-exchange.mjs';
import { context } from './http-original-fixture.mjs';
const [kind, scenarioId, profileId] = process.argv.slice(2);
const expected = context(scenarioId, profileId);
const job = {
  mode: 'http-original-scenario',
  parentPid: process.ppid,
  nonce: expected.nonce,
  candidateCommit: expected.candidateCommit,
  tree: expected.tree,
  originalScenario: {
    operationId: expected.operationId,
    scenarioId,
    profileId,
    profileSha256: expected.profileSha256,
    manifestSha256: expected.manifestSha256,
  },
};
const report = {
  kind,
  scope: 'actual-original-parent-exchange-component',
  runtimeCustodyComplete: false,
  performanceQualified: false,
  readinessPromoting: false,
};
let handle;
const timer = setTimeout(() => {
  console.error('Owned IPC component deadline expired');
  process.exit(1);
}, 4000);
try {
  handle = openHttpOriginalParentExchange(job);
  const first = waitHttpOriginalParentCommand(handle, 'begin-measurement');
  process.send({ phase: 'begin-ready' });
  if (kind === 'disconnect') setImmediate(() => process.disconnect());
  const begin = await first;
  report.begin = structuredClone(begin);
  if (kind === 'mutate-return') begin.generatorOperationId = '12345678-1234-4123-8123-123456789015';
  const repeated = await waitHttpOriginalParentCommand(handle, 'begin-measurement');
  report.repeatedBegin = structuredClone(repeated);
  const second = waitHttpOriginalParentCommand(handle, 'finish-measurement');
  process.send({ phase: 'finish-ready' });
  report.finish = await second;
} catch (error) {
  report.refused = { code: error.code ?? null, message: error.message };
} finally {
  if (handle) {
    try {
      report.close = closeHttpOriginalParentExchange(handle);
    } catch (error) {
      report.closeError = { code: error.code ?? null, message: error.message };
    }
  }
  clearTimeout(timer);
}
console.log(JSON.stringify(report));
if (process.connected) process.disconnect();
