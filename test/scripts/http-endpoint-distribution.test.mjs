import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { reconstructEndpointDistribution } from '../../scripts/lib/http-endpoint-distribution.mjs';

function input(durations = [1, 2, 3], overrides = {}) {
  return {
    operationId: 'fixture:GET:/items',
    effect: 'read',
    samples: durations.map((durationMs, sequence) => ({
      sequence,
      durationMs,
      outcomeAccepted: true,
    })),
    expectedCount: durations.length,
    slo: { p50Ms: 200, p95Ms: 800 },
    ...overrides,
  };
}
function near(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${actual} must equal ${expected} within floating-point precision`,
  );
}

// Independent fixed vectors for the accepted pinned algorithm, not an alternate
// implementation of the producer: https://github.com/grafana/k6/blob/v0.49.0/metrics/sink.go#L119-L139
for (const [durations, expected] of [
  [[7], [7, 7, 7]],
  [
    [30, 10],
    [20, 29, 29.8],
  ],
  [
    [5, 1, 4, 2, 3],
    [3, 4.8, 4.96],
  ],
  [Array.from({ length: 21 }, (_, index) => 21 - index), [11, 20, 20.8]],
]) {
  test(`pinned k6 interpolation reconstructs the independent ${durations.length}-sample vector`, () => {
    const report = reconstructEndpointDistribution(input(durations));
    const actual = report.distribution;
    for (const [index, key] of ['p50Ms', 'p95Ms', 'p99Ms'].entries())
      near(actual[key], expected[index]);
    assert.equal(actual.minimumMs, Math.min(...durations));
    assert.equal(actual.maximumMs, Math.max(...durations));
    assert.equal(report.percentileAlgorithm, 'k6-v0.49.0-trend-linear-interpolation');
  });
}

test('reconstruction accepts out-of-order completion while retaining exact scheduled sequence identities', () => {
  const original = input([3, 9, 1]);
  original.samples = [original.samples[2], original.samples[0], original.samples[1]];
  const snapshot = structuredClone(original);
  const report = reconstructEndpointDistribution(original);
  assert.equal(report.expectedCount, 3);
  assert.equal(report.observedCount, 3);
  assert.equal(report.sampleCountMatches, true);
  assert.equal(report.distribution.p50Ms, 3);
  assert.deepEqual(original, snapshot);
});

test('missing scheduled target outcomes cannot become an incomplete statistical report', () => {
  const missing = input([1, 2, 3]);
  missing.samples.splice(1, 1);
  assert.throws(() => reconstructEndpointDistribution(missing), /sample|population|sequence/iu);
  assert.throws(
    () => reconstructEndpointDistribution(input([], { expectedCount: 3 })),
    /sample|population/iu,
  );
});

test('custom array iterators cannot report 600 outcomes while exposing zero or one duration', () => {
  let iteratorCalls = 0;
  for (const emittedCount of [0, 1]) {
    const candidate = input(Array(600).fill(1));
    Object.defineProperty(candidate.samples, Symbol.iterator, {
      value: function* () {
        iteratorCalls += 1;
        for (let index = 0; index < emittedCount; index += 1) yield this[index];
      },
    });
    assert.equal(candidate.samples.length, 600);
    assert.throws(() => reconstructEndpointDistribution(candidate), /population|array/iu);
  }
  assert.equal(iteratorCalls, 0);
});

test('sample arrays refuse accessor members without executing them and retain sparse-population refusal', () => {
  let getterCalls = 0;
  const accessor = input();
  Object.defineProperty(accessor.samples, '1', {
    get() {
      getterCalls += 1;
      return { sequence: 1, durationMs: 1, outcomeAccepted: true };
    },
  });
  assert.throws(() => reconstructEndpointDistribution(accessor), /sample|array/iu);
  assert.equal(getterCalls, 0);
  const sparse = input();
  delete sparse.samples[1];
  assert.equal(sparse.samples.length, 3);
  assert.throws(() => reconstructEndpointDistribution(sparse), /population|sample/iu);
});

test('sample arrays reject nonstandard prototypes, proxies and unknown own attributes', () => {
  class SampleArray extends Array {}
  for (const prototype of [SampleArray.prototype, null, {}]) {
    const candidate = input();
    Object.setPrototypeOf(candidate.samples, prototype);
    assert.throws(() => reconstructEndpointDistribution(candidate), /population|array/iu);
  }
  for (const key of ['metadata', Symbol('hidden-samples')]) {
    const candidate = input();
    Object.defineProperty(candidate.samples, key, { value: true });
    assert.throws(() => reconstructEndpointDistribution(candidate), /population|array/iu);
  }
  let proxyCalls = 0;
  const candidate = input();
  candidate.samples = new Proxy(candidate.samples, {
    get() {
      proxyCalls += 1;
      throw new Error('proxy must not execute');
    },
  });
  assert.throws(() => reconstructEndpointDistribution(candidate), /population|array/iu);
  assert.equal(proxyCalls, 0);
});

test('options, SLO and sample proxies cannot supply trusted own-data identities', () => {
  let proxyCalls = 0;
  for (const level of ['options', 'slo', 'sample']) {
    let candidate = input();
    const target =
      level === 'options' ? candidate : level === 'slo' ? candidate.slo : candidate.samples[0];
    const proxy = new Proxy(target, {
      ownKeys() {
        proxyCalls += 1;
        throw new Error('proxy must not execute');
      },
    });
    if (level === 'options') candidate = proxy;
    else if (level === 'slo') candidate.slo = proxy;
    else candidate.samples[0] = proxy;
    assert.throws(() => reconstructEndpointDistribution(candidate), /Invalid/iu);
  }
  assert.equal(proxyCalls, 0);
});

test('duplicate, out-of-range and invalid sequences refuse without renumbering completion order', () => {
  for (const sequence of [0, -1, 3, 1.5, '1', NaN, Infinity, undefined]) {
    const candidate = input();
    candidate.samples[1].sequence = sequence;
    assert.throws(() => reconstructEndpointDistribution(candidate), /sequence/iu);
  }
  const hole = input();
  delete hole.samples[1];
  assert.throws(() => reconstructEndpointDistribution(hole), /sample/iu);
});

test('missing, zero, negative, nonfinite and coerced durations refuse rather than disappear from the tail', () => {
  for (const duration of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '1', true, {}, []]) {
    const candidate = input();
    candidate.samples[1].durationMs = duration;
    assert.throws(() => reconstructEndpointDistribution(candidate), /duration/iu);
  }
  const missing = input();
  delete missing.samples[1].durationMs;
  assert.throws(() => reconstructEndpointDistribution(missing), /sample|duration/iu);
});

test('every unexpected outcome remains in the raw distribution instead of filtering slow failures', () => {
  const candidate = input([1, 2, 1000]);
  candidate.samples[2].outcomeAccepted = false;
  const report = reconstructEndpointDistribution(candidate);
  assert.equal(report.observedCount, 3);
  assert.equal(report.unexpectedOutcomes, 1);
  assert.equal(report.distribution.maximumMs, 1000);
  assert.equal(report.distribution.p50Ms, 2);
  near(report.distribution.p95Ms, 900.2);
  near(report.distribution.p99Ms, 980.04);
  assert.deepEqual(report.strictLimitBreaches, ['p95Ms']);
});

for (const [effect, p50Ms, p95Ms] of [
  ['read', 200, 800],
  ['write', 500, 2000],
]) {
  test(`${effect} SLOs keep strict equality and either side of the accepted p50 and p95 limits`, () => {
    for (const difference of [-0.001, 0, 0.001]) {
      const median = reconstructEndpointDistribution(
        input([p50Ms + difference], { effect, slo: { p50Ms, p95Ms } }),
      );
      assert.deepEqual(median.strictLimitBreaches, difference >= 0 ? ['p50Ms'] : []);
      const durations = [...Array(19).fill(1), p95Ms + difference, p95Ms + difference];
      const tail = reconstructEndpointDistribution(
        input(durations, { effect, slo: { p50Ms, p95Ms } }),
      );
      assert.deepEqual(tail.strictLimitBreaches, difference >= 0 ? ['p95Ms'] : []);
    }
    for (const key of ['p50Ms', 'p95Ms']) {
      const weakened = { p50Ms, p95Ms, [key]: { p50Ms, p95Ms }[key] + 0.001 };
      assert.throws(
        () => reconstructEndpointDistribution(input([1], { effect, slo: weakened })),
        /weakened|SLO/iu,
      );
    }
  });
}

test('a stricter declared SLO is preserved and enforced rather than replaced by default limits', () => {
  const report = reconstructEndpointDistribution(input([50], { slo: { p50Ms: 50, p95Ms: 100 } }));
  assert.deepEqual(report.slo, { p50Ms: 50, p95Ms: 100 });
  assert.deepEqual(report.strictLimitBreaches, ['p50Ms']);
  for (const invalid of [0, -1, '50', NaN, Infinity, null]) {
    assert.throws(
      () => reconstructEndpointDistribution(input([1], { slo: { p50Ms: invalid, p95Ms: 100 } })),
      /SLO/iu,
    );
    assert.throws(
      () => reconstructEndpointDistribution(input([1], { slo: { p50Ms: 50, p95Ms: invalid } })),
      /SLO/iu,
    );
  }
});

test('unknown effects, operation identities, expected counts and nonboolean outcomes refuse', () => {
  for (const effect of ['unknown', 'READ', '', null, {}, '__proto__'])
    assert.throws(() => reconstructEndpointDistribution(input([1], { effect })), /effect/iu);
  for (const operationId of ['', ' ', null, 1])
    assert.throws(() => reconstructEndpointDistribution(input([1], { operationId })), /identity/iu);
  for (const expectedCount of [0, -1, 1.5, '3', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => reconstructEndpointDistribution(input([1], { expectedCount })), /count/iu);
  for (const outcomeAccepted of [undefined, 0, 1, 'true', null]) {
    const candidate = input();
    candidate.samples[0].outcomeAccepted = outcomeAccepted;
    assert.throws(() => reconstructEndpointDistribution(candidate), /outcome/iu);
  }
});

test('closed options, SLOs and samples reject unknown fields and accessors without invoking getters', () => {
  let getterCalls = 0;
  for (const level of ['options', 'slo', 'sample']) {
    for (const field of ['unknown', Symbol('unknown')]) {
      const candidate = input();
      const target =
        level === 'options' ? candidate : level === 'slo' ? candidate.slo : candidate.samples[0];
      Object.defineProperty(target, field, { value: true });
      assert.throws(() => reconstructEndpointDistribution(candidate), /Invalid/iu);
    }
    const candidate = input();
    const [target, key] =
      level === 'options'
        ? [candidate, 'samples']
        : level === 'slo'
          ? [candidate.slo, 'p50Ms']
          : [candidate.samples[0], 'durationMs'];
    Object.defineProperty(target, key, {
      get() {
        getterCalls++;
        throw new Error('getter must not execute');
      },
      enumerable: true,
    });
    assert.throws(() => reconstructEndpointDistribution(candidate), /Invalid/iu);
  }
  assert.equal(getterCalls, 0);
});

test('statistical reconstruction does not assert global readiness or authenticate raw-sample custody', () => {
  const report = reconstructEndpointDistribution(input());
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'distribution',
      'effect',
      'expectedCount',
      'observedCount',
      'operationId',
      'percentileAlgorithm',
      'sampleCountMatches',
      'slo',
      'strictLimitBreaches',
      'unexpectedOutcomes',
    ].sort(),
  );
  assert.equal(Object.hasOwn(report, 'verdict'), false);
  assert.equal(Object.hasOwn(report, 'authenticated'), false);
  assert.equal(Object.hasOwn(report, 'complete'), false);
});

test('real HTTP failure and explicitly expected refusal durations remain counted with successful requests', async () => {
  const server = createServer((request, response) => {
    const status =
      request.url === '/success' ? 200 : request.url === '/expected-refusal' ? 500 : 503;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ kind: request.url }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const samples = [];
    for (const [sequence, path] of ['/success', '/expected-refusal', '/unexpected'].entries()) {
      const started = performance.now();
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      const body = await response.json();
      const durationMs = performance.now() - started;
      assert.equal(body.kind, path);
      samples.push({
        sequence,
        durationMs,
        outcomeAccepted:
          path === '/success'
            ? response.status === 200
            : path === '/expected-refusal'
              ? response.status === 500
              : false,
      });
    }
    const report = reconstructEndpointDistribution(input([], { samples, expectedCount: 3 }));
    assert.equal(report.observedCount, 3);
    assert.equal(report.sampleCountMatches, true);
    assert.equal(report.unexpectedOutcomes, 1);
    assert.equal(
      report.distribution.minimumMs,
      Math.min(...samples.map((sample) => sample.durationMs)),
    );
    assert.equal(
      report.distribution.maximumMs,
      Math.max(...samples.map((sample) => sample.durationMs)),
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
