import http from 'k6/http';
import { check } from 'k6';
import { handleSummary, createRecord, hitDataTxProbe, hitIdempotencyProbe, hitRateLimitProbe, listRecords, login, softDeleteRecord } from './lib/stynx.js';
import { assertScenario } from './lib/config.js';

export const options = {
  scenarios: {
    crud_flow: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STYNX_K6_RATE || 10),
      timeUnit: '1s',
      duration: __ENV.STYNX_K6_DURATION || '10m',
      preAllocatedVUs: Number(__ENV.STYNX_K6_PREALLOCATED_VUS || 2),
      maxVUs: Number(__ENV.STYNX_K6_MAX_VUS || 20),
    },
  },
  thresholds: {
    data_tx_overhead_ms: ['p(99)<2'],
    ratelimit_overhead_ms: ['p(99)<1'],
    idempotency_lookup_ms: ['p(99)<5'],
    http_req_duration: ['p(95)<750'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function crudScenario() {
  assertScenario('crud_flow');
  const token = login();
  const record = createRecord(token, 'K6 CRUD');
  listRecords(token);
  hitDataTxProbe(token, { record: false });
  hitDataTxProbe(token, { record: false });
  hitDataTxProbe(token);
  hitRateLimitProbe({ record: false });
  hitRateLimitProbe();
  hitIdempotencyProbe();
  softDeleteRecord(token, record.id);
}

export { handleSummary };
