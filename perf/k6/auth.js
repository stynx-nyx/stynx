import { handleSummary, login, verifyAuth } from './lib/stynx.js';
import { assertScenario } from './lib/config.js';

export const options = {
  scenarios: {
    auth_flow: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STYNX_K6_RATE || 100),
      timeUnit: '1s',
      duration: __ENV.STYNX_K6_DURATION || '5m',
      preAllocatedVUs: Number(__ENV.STYNX_K6_PREALLOCATED_VUS || 20),
      maxVUs: Number(__ENV.STYNX_K6_MAX_VUS || 200),
    },
  },
  thresholds: {
    auth_verify_duration_ms: ['p(99)<10'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function authScenario() {
  assertScenario('auth_flow');
  const token = login();
  verifyAuth(token);
}

export { handleSummary };
