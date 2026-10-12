import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { assertHttpQualificationWorkerBody } from '../../scripts/lib/http-qualification-worker-body.mjs';

// INV-PERF-001: pure closed-body correspondence, never proof that a real worker,
// module closure, owned application or measurement produced these fixture rows.
const invalid = { code: 'HTTP_QUALIFICATION_WORKER_BODY_INVALID' };
function fixture() {
  const expected = {
    candidateCommit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    workerPid: process.pid,
    nonce: randomUUID(),
    trustedBootstrap: [
      { path: 'reviewed-control-a.mjs', sha256: 'c'.repeat(64) },
      { path: 'reviewed-control-b.mjs', sha256: 'd'.repeat(64) },
      { path: 'reviewed-control-c.mjs', sha256: 'e'.repeat(64) },
    ],
  };
  return {
    expected,
    body: {
      schemaVersion: 1,
      scope: 'http-endpoint-qualification',
      candidateCommit: expected.candidateCommit,
      tree: expected.tree,
      workerPid: expected.workerPid,
      nonce: expected.nonce,
      modules: {},
      trustedBootstrap: structuredClone(expected.trustedBootstrap),
      networkClosure: {},
      referenceObservation: {
        scope: 'http-endpoint-qualification',
        performanceQualified: false,
      },
      parentCorroborationRequired: true,
      complete: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    },
  };
}

test('matching closed worker body returns structural-only false-readiness correspondence without mutation', () => {
  const { body, expected } = fixture();
  const before = structuredClone({ body, expected });
  assert.deepEqual(assertHttpQualificationWorkerBody(body, expected), {
    scope: 'qualification-worker-body-structural-correspondence-component',
    structuralCorrespondence: true,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
  assert.deepEqual({ body, expected }, before);
});

for (const field of Object.keys(fixture().body))
  test(`worker body refuses missing mandatory ${field}`, () => {
    const { body, expected } = fixture();
    delete body[field];
    assert.throws(() => assertHttpQualificationWorkerBody(body, expected), invalid);
  });

for (const [name, change] of [
  [
    'extra top-level field',
    (b) => {
      b.extra = false;
    },
  ],
  [
    'wrong schema',
    (b) => {
      b.schemaVersion = 2;
    },
  ],
  [
    'wrong scope',
    (b) => {
      b.scope = 'reference-owned-loopback';
    },
  ],
  [
    'wrong candidate',
    (b) => {
      b.candidateCommit = 'f'.repeat(40);
    },
  ],
  [
    'wrong tree',
    (b) => {
      b.tree = 'f'.repeat(40);
    },
  ],
  [
    'wrong worker',
    (b) => {
      b.workerPid++;
    },
  ],
  [
    'wrong nonce',
    (b) => {
      b.nonce = randomUUID();
    },
  ],
  [
    'omitted bootstrap row',
    (b) => {
      b.trustedBootstrap.pop();
    },
  ],
  [
    'reordered bootstrap rows',
    (b) => {
      b.trustedBootstrap.reverse();
    },
  ],
  [
    'extra bootstrap row',
    (b) => {
      b.trustedBootstrap.push({ path: 'foreign', sha256: 'f'.repeat(64) });
    },
  ],
  [
    'changed bootstrap bytes',
    (b) => {
      b.trustedBootstrap[0].sha256 = 'f'.repeat(64);
    },
  ],
  [
    'changed bootstrap path',
    (b) => {
      b.trustedBootstrap[0].path = 'foreign';
    },
  ],
  [
    'false parent corroboration',
    (b) => {
      b.parentCorroborationRequired = false;
    },
  ],
  [
    'wrong reference observation scope',
    (b) => {
      b.referenceObservation.scope = 'different';
    },
  ],
  [
    'reference performance promoted',
    (b) => {
      b.referenceObservation.performanceQualified = true;
    },
  ],
  ...['complete', 'runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'].map(
    (field) => [
      `promoted ${field}`,
      (b) => {
        b[field] = true;
      },
    ],
  ),
])
  test(`worker body refuses ${name}`, () => {
    const { body, expected } = fixture();
    change(body);
    assert.throws(() => assertHttpQualificationWorkerBody(body, expected), invalid);
  });

test('worker body refuses Proxy/accessor caller behavior without executing it', () => {
  const { body, expected } = fixture();
  let calls = 0;
  const proxy = new Proxy(body, {
    ownKeys() {
      calls++;
      return Reflect.ownKeys(body);
    },
  });
  assert.throws(() => assertHttpQualificationWorkerBody(proxy, expected));
  assert.equal(calls, 0);
  Object.defineProperty(body, 'modules', {
    get() {
      calls++;
      return {};
    },
    enumerable: true,
  });
  assert.throws(() => assertHttpQualificationWorkerBody(body, expected));
  assert.equal(calls, 0);
});

test('worker body refuses missing/additional invocation arguments and invalid expected context', () => {
  const { body, expected } = fixture();
  assert.throws(() => assertHttpQualificationWorkerBody(body), invalid);
  assert.throws(() => assertHttpQualificationWorkerBody(body, expected, {}), invalid);
  for (const value of [null, [], 123, {}])
    assert.throws(() => assertHttpQualificationWorkerBody(body, value), invalid);
  assert.throws(
    () => assertHttpQualificationWorkerBody(body, { ...expected, extra: true }),
    invalid,
  );
});
