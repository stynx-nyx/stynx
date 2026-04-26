import exec from 'k6/execution';

export const BASE_URL = __ENV.STYNX_K6_BASE_URL || 'http://127.0.0.1:3000';
export const TENANT_ID = __ENV.STYNX_K6_TENANT_ID || '01978f4a-32bf-7c27-a131-fd73a9e001a1';
export const EMAIL = __ENV.STYNX_K6_EMAIL || 'admin@sample-demo.test';
export const SUMMARY_PATH = __ENV.K6_SUMMARY_PATH || 'perf/k6/results/summary.json';
export const S3_PUBLIC_BASE_URL = __ENV.STYNX_K6_S3_PUBLIC_BASE_URL || 'http://host.docker.internal:4566';

export function assertScenario(expected) {
  if (exec.scenario.name !== expected) {
    throw new Error(`Expected k6 scenario "${expected}" but received "${exec.scenario.name}"`);
  }
}

export function uniqueSuffix(prefix = 'k6') {
  return `${prefix}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Date.now()}`;
}

export function idempotencyKey(prefix = 'k6') {
  return uniqueSuffix(prefix);
}
