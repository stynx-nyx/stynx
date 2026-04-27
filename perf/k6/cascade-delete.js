import { createRecord, createRecordNote, handleSummary, hitDataTxProbe, login, softDeleteRecord } from './lib/stynx.js';
import { assertScenario } from './lib/config.js';

export const options = {
  scenarios: {
    cascade_delete: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STYNX_K6_RATE || 25),
      timeUnit: '1s',
      duration: __ENV.STYNX_K6_DURATION || '5m',
      preAllocatedVUs: Number(__ENV.STYNX_K6_PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.STYNX_K6_MAX_VUS || 100),
    },
  },
  thresholds: {
    data_tx_overhead_ms: ['p(99)<2'],
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function cascadeDeleteScenario() {
  assertScenario('cascade_delete');
  const token = login();
  hitDataTxProbe(token, { record: false });
  hitDataTxProbe(token);
  const record = createRecord(token, 'K6 Cascade');
  createRecordNote(token, record.id);
  createRecordNote(token, record.id);
  createRecordNote(token, record.id);
  softDeleteRecord(token, record.id, 'cascade-delete');
}

export { handleSummary };
