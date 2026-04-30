import { createDocument, createRecord, handleSummary, login, uploadDocumentBinary, completeDocument } from './lib/stynx.js';
import { assertScenario } from './lib/config.js';

const storagePresignP99Ms = Number(__ENV.STYNX_K6_STORAGE_PRESIGN_P99_MS || 50);

let cachedToken;
let cachedRecord;

export const options = {
  scenarios: {
    upload_flow: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STYNX_K6_RATE || 50),
      timeUnit: '1s',
      duration: __ENV.STYNX_K6_DURATION || '5m',
      preAllocatedVUs: Number(__ENV.STYNX_K6_PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.STYNX_K6_MAX_VUS || 100),
    },
  },
  thresholds: {
    storage_presign_duration_ms: [`p(99)<${storagePresignP99Ms}`],
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function uploadScenario() {
  assertScenario('upload_flow');
  if (!cachedToken) {
    cachedToken = login();
  }
  if (!cachedRecord) {
    cachedRecord = createRecord(cachedToken, 'K6 Upload');
  }
  const document = createDocument(cachedToken, cachedRecord.id);
  uploadDocumentBinary(document);
  completeDocument(cachedToken, document.id);
}

export { handleSummary };
