import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeHttpQualificationTargetCapture } from '../../scripts/lib/http-qualification-raw.mjs';
import {
  captureBytes,
  sha256,
  targetCaptureFixture,
} from './support/http-qualification-fixture.mjs';

// INV-PERF-001: all outcomes remain visible; a parser is never qualification authority.
test('raw reconstruction retains all 600 ordered outcomes and cannot promote readiness', () => {
  const { records, allocation } = targetCaptureFixture();
  const bytes = captureBytes([...records].reverse());
  const result = decodeHttpQualificationTargetCapture(bytes, allocation);
  assert.equal(result.targetCount, 600);
  assert.deepEqual(
    result.targets.map((row) => row.sequence),
    Array.from({ length: 600 }, (_, i) => i),
  );
  assert.equal(result.captureSha256, sha256(bytes));
  assert.equal(result.captureBytes, bytes.length);
  assert.deepEqual(result.targets[599], records[599]);
  for (const field of [
    'complete',
    'runtimeCustodyComplete',
    'performanceQualified',
    'readinessPromoting',
  ])
    assert.equal(result[field], false);
});

test('raw reconstruction preserves every native failure, missing duration and reversed clock', () => {
  const { records, allocation } = targetCaptureFixture();
  for (const record of records) {
    record.transport = 'native-request-threw';
    record.targetCompletedAtUnixMs = record.targetStartedAtUnixMs - 1;
    for (const key of [
      'durationMs',
      'fullHttpMs',
      'timings',
      'actualRequestSha256',
      'request',
      'status',
      'bodySha256',
      'bodyBase64',
      'headers',
      'headersSha256',
      'errorCode',
    ])
      record[key] = null;
  }
  const result = decodeHttpQualificationTargetCapture(captureBytes(records), allocation);
  assert.equal(result.targetCount, 600);
  assert.equal(result.transportFailures, 600);
  assert.equal(result.missingDurations, 600);
  assert.equal(result.clockReversals, 600);
  assert.deepEqual(result.targets, records);
  assert.equal(result.performanceQualified, false);
});

for (const [name, mutate] of [
  [
    'wrong candidate',
    (rows) => {
      rows[30].candidateCommit = '0'.repeat(40);
    },
  ],
  [
    'duplicate sequence',
    (rows) => {
      rows[30] = structuredClone(rows[29]);
    },
  ],
  [
    'wrong allocation digest',
    (rows) => {
      rows[30].allocationRequestSha256 = '0'.repeat(64);
    },
  ],
  [
    'wrong native request digest',
    (rows) => {
      rows[30].actualRequestSha256 = '0'.repeat(64);
    },
  ],
  [
    'missing duration field',
    (rows) => {
      delete rows[30].timings.waiting;
    },
  ],
  [
    'double-counted connecting time',
    (rows) => {
      rows[30].fullHttpMs += rows[30].timings.connecting;
    },
  ],
  [
    'forged response body',
    (rows) => {
      rows[30].bodyBase64 = Buffer.from('changed').toString('base64');
    },
  ],
  [
    'noncanonical base64',
    (rows) => {
      rows[30].bodyBase64 += '=';
    },
  ],
  [
    'forged response headers',
    (rows) => {
      rows[30].headers['X-Request-Id'] = 'changed';
    },
  ],
  [
    'out-of-range status',
    (rows) => {
      rows[30].status = 600;
    },
  ],
  [
    'unknown field',
    (rows) => {
      rows[30].pass = true;
    },
  ],
  [
    'missing outcome',
    (rows) => {
      rows.pop();
    },
  ],
  [
    'extra outcome',
    (rows) => {
      rows.push(structuredClone(rows[0]));
    },
  ],
])
  test(`raw reconstruction refuses ${name}`, () => {
    const { records, allocation } = targetCaptureFixture();
    mutate(records);
    assert.throws(
      () => decodeHttpQualificationTargetCapture(captureBytes(records), allocation),
      /capture reconstruction refused/u,
    );
  });

test('raw reconstruction refuses ambiguous JSON, truncated output and malformed UTF-8', () => {
  const { records, allocation } = targetCaptureFixture();
  const valid = captureBytes(records);
  const duplicate = Buffer.from(
    valid.toString('utf8').replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
  );
  for (const bytes of [
    duplicate,
    valid.subarray(0, -1),
    Buffer.concat([Buffer.from([0xff]), valid]),
    Buffer.from(valid.toString().replace('"sequence":0', '"sequence":NaN')),
  ])
    assert.throws(
      () => decodeHttpQualificationTargetCapture(bytes, allocation),
      /capture reconstruction refused/u,
    );
});

test('raw reconstruction refuses unsafe buffers and allocation accessors without invoking them', () => {
  const { records, allocation } = targetCaptureFixture();
  const valid = captureBytes(records);
  const shared = Buffer.from(new SharedArrayBuffer(valid.length));
  valid.copy(shared);
  for (const bytes of [shared, new Proxy(valid, {}), new Uint8Array(valid), valid.toString()])
    assert.throws(
      () => decodeHttpQualificationTargetCapture(bytes, allocation),
      /capture reconstruction refused/u,
    );
  let calls = 0;
  Object.defineProperty(allocation, 'caseId', {
    enumerable: true,
    get() {
      calls++;
      return 'forged';
    },
  });
  assert.throws(
    () => decodeHttpQualificationTargetCapture(valid, allocation),
    /capture reconstruction refused/u,
  );
  assert.equal(calls, 0);
});
