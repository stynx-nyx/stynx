import { createHash } from 'node:crypto';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const qualificationContext = () => ({
  candidateCommit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  nonce: '00000000-0000-4000-8000-000000000001',
  operationId: '00000000-0000-4000-8000-000000000002',
  workerPid: 1234,
  compositionId: 'reference',
  caseId: 'reference.synthetic.nominal',
  caseSha256: 'c'.repeat(64),
  manifestSha256: 'd'.repeat(64),
  fixtureSha256: 'e'.repeat(64),
  controlClosureSha256: 'f'.repeat(64),
});
export const generatorId = '00000000-0000-4000-8000-000000000003';
const headersIdentity = (headers) =>
  Object.keys(headers)
    .sort()
    .map((name) => [name, headers[name]]);

// Synthetic byte reconstruction witnesses only; no requests, fixtures or measurements.
export function targetCaptureFixture() {
  const context = qualificationContext();
  const allocation = {
    schemaVersion: 1,
    ...Object.fromEntries(
      ['candidateCommit', 'tree', 'operationId', 'caseId', 'manifestSha256', 'caseSha256'].map(
        (key) => [key, context[key]],
      ),
    ),
    generatorOperationId: generatorId,
    baseUrl: 'http://127.0.0.1:12345',
    targets: Array.from({ length: 600 }, (_, sequence) => ({
      sequence,
      method: 'POST',
      path: `/items/${sequence}`,
      headers: {
        Authorization: 'Bearer synthetic-component-only',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sequence, title: 'ação 日本語' }),
      expectedOutcomeId: `created-${sequence}`,
    })),
  };
  const records = allocation.targets.map((target) => {
    const request = {
      method: target.method,
      url: allocation.baseUrl + target.path,
      headers: Object.fromEntries(
        Object.entries(target.headers).map(([name, value]) => [name, [value]]),
      ),
      body: target.body,
      cookies: {},
    };
    const body = Buffer.from(JSON.stringify({ id: target.sequence, title: 'ação 日本語' }));
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-Id': `request-${target.sequence}`,
    };
    return {
      schemaVersion: 1,
      kind: 'supplemental-http-target',
      ...Object.fromEntries(
        [
          'candidateCommit',
          'tree',
          'operationId',
          'generatorOperationId',
          'caseId',
          'caseSha256',
          'manifestSha256',
        ].map((key) => [key, allocation[key]]),
      ),
      sequence: target.sequence,
      expectedOutcomeId: target.expectedOutcomeId,
      allocationRequestSha256: sha256(
        JSON.stringify([target.method, request.url, headersIdentity(target.headers), target.body]),
      ),
      transport: 'http-response',
      targetStartedAtUnixMs: 1_800_000_000_000 + target.sequence * 500,
      targetCompletedAtUnixMs: 1_800_000_000_012 + target.sequence * 500,
      durationMs: 10,
      fullHttpMs: 12,
      timings: {
        duration: 10,
        blocked: 2,
        looking_up: 0,
        connecting: 1,
        tls_handshaking: 0,
        sending: 1,
        waiting: 8,
        receiving: 1,
      },
      actualRequestSha256: sha256(
        JSON.stringify([
          request.method,
          request.url,
          headersIdentity(request.headers),
          request.body,
        ]),
      ),
      request,
      status: 201,
      bodySha256: sha256(body),
      bodyBase64: body.toString('base64'),
      headers,
      headersSha256: sha256(JSON.stringify(headersIdentity(headers))),
      errorCode: null,
    };
  });
  return { allocation, records };
}
export const captureBytes = (records) =>
  Buffer.from(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
