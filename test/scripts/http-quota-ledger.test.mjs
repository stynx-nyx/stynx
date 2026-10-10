import assert from 'node:assert/strict';
import test from 'node:test';
import { reconstructWeightedSlidingQuota } from '../../scripts/lib/http-quota-ledger.mjs';

function charge(
  chargeId,
  scoreEarliestMs,
  scoreLatestMs = scoreEarliestMs,
  cost = 1,
  overrides = {},
) {
  return {
    chargeId,
    bucketId: 'tenant-a',
    scoreEarliestMs,
    scoreLatestMs,
    cost,
    traffic: 'target',
    ...overrides,
  };
}
function input(
  charges = [charge('one', 0)],
  buckets = [{ bucketId: 'tenant-a', windowMs: 10, limit: 3 }],
) {
  return {
    buckets,
    charges,
    maximumEvaluationLagMs: 0,
    timebase: 'common-nondecreasing-milliseconds',
    memberIdentity: 'globally-unique-per-charge',
  };
}

// Independent bounded oracle: enumerate actual dispatch assignments and count
// each real (end-window,end] population, rather than reproducing an edge sweep.
function exhaustiveDiscreteMaximum(charges, windowMs) {
  let maximum = 0;
  const chosen = [];
  function enumerate(index) {
    if (index < charges.length) {
      for (
        let time = charges[index].scoreEarliestMs;
        time <= charges[index].scoreLatestMs;
        time++
      ) {
        chosen[index] = time;
        enumerate(index + 1);
      }
      return;
    }
    const first = Math.min(...chosen);
    const last = Math.max(...chosen) + windowMs;
    for (let end = first; end <= last; end++) {
      const actual = charges.reduce(
        (total, entry, index) =>
          total + (chosen[index] > end - windowMs && chosen[index] <= end ? entry.cost : 0),
        0,
      );
      maximum = Math.max(maximum, actual);
    }
  }
  enumerate(0);
  return maximum;
}

test('weighted uncertainty reconstruction matches exhaustive actual-dispatch enumeration', () => {
  const intervals = [
    [0, 0],
    [0, 1],
    [1, 2],
    [3, 3],
  ];
  for (const first of intervals)
    for (const second of intervals)
      for (const third of intervals) {
        const charges = [first, second, third].map(([earliest, latest], index) =>
          charge(`c${index}`, earliest, latest, index + 1),
        );
        const report = reconstructWeightedSlidingQuota(
          input(charges, [{ bucketId: 'tenant-a', windowMs: 2, limit: 6 }]),
        )[0];
        assert.equal(report.maximumPossibleCost, exhaustiveDiscreteMaximum(charges, 2));
        assert.equal(report.chargeCount, 3);
      }
});

// Independently enumerate source scores, bounded asynchronous evaluation times,
// and every legal evaluation order. Apply the production Lua's inclusive score
// expiry before each attempted charge; no event-interval sweep is used here.
function exhaustiveBackendMaximum(charges, windowMs, lagMs, limit = Infinity) {
  let maximum = 0;
  const assigned = [];
  function orders(remaining, ordered) {
    if (remaining.length) {
      for (let index = 0; index < remaining.length; index += 1) {
        const next = remaining[index];
        if (ordered.length && next.evaluation < ordered.at(-1).evaluation) continue;
        orders(
          remaining.filter((_, position) => position !== index),
          [...ordered, next],
        );
      }
      return;
    }
    let retained = [];
    for (const next of ordered) {
      retained = retained.filter((old) => old.score > next.score - windowMs);
      const attempted = retained.reduce((total, old) => total + old.cost, 0) + next.cost;
      maximum = Math.max(maximum, attempted);
      if (attempted <= limit) retained.push(next);
    }
  }
  function assign(index) {
    if (index === charges.length) {
      orders(assigned, []);
      return;
    }
    const next = charges[index];
    for (let score = next.scoreEarliestMs; score <= next.scoreLatestMs; score += 1)
      for (let lag = 0; lag <= lagMs; lag += 1) {
        assigned[index] = { score, evaluation: score + lag, cost: next.cost };
        assign(index + 1);
      }
  }
  assign(0);
  return maximum;
}

test('conservative accounting horizon bounds exhaustive reordered Redis evaluations under declared lag', () => {
  for (const first of [
    [0, 0],
    [0, 1],
  ])
    for (const second of [
      [1, 2],
      [3, 3],
    ])
      for (const lag of [0, 1, 2]) {
        const charges = [charge('a', ...first, 1), charge('b', ...second, 2), charge('c', 4, 4, 3)];
        const options = input(charges, [{ bucketId: 'tenant-a', windowMs: 2, limit: 6 }]);
        options.maximumEvaluationLagMs = lag;
        const [report] = reconstructWeightedSlidingQuota(options);
        const actualMaximum = exhaustiveBackendMaximum(charges, 2, lag, 6);
        assert.ok(report.maximumPossibleCost >= actualMaximum);
        assert.equal(report.maximumPossibleCost, exhaustiveDiscreteMaximum(charges, 2 + lag));
        assert.equal(report.accountingWindowMs, 2 + lag);
        assert.equal(report.windowMs, 2);
        assert.equal(report.maximumEvaluationLagMs, lag);
        if (lag === 0) assert.equal(report.maximumPossibleCost, actualMaximum);
      }
});

test('score20 then delayed score0 is overloaded with bounded lag instead of trusting disjoint nominal windows', () => {
  const charges = [charge('later-score-first-eval', 20), charge('earlier-score-delayed-eval', 0)];
  const options = input(charges, [{ bucketId: 'tenant-a', windowMs: 10, limit: 1 }]);
  options.maximumEvaluationLagMs = 20;
  const [report] = reconstructWeightedSlidingQuota(options);
  assert.equal(exhaustiveBackendMaximum(charges, 10, 20, 1), 2);
  assert.equal(report.maximumPossibleCost, 2);
  assert.equal(report.accountingWindowMs, 30);
  assert.equal(report.windowMs, 10);
  assert.equal(report.capacityFitsWithinAssumptions, false);
  assert.equal(report.assumptionsVerified, false);
  assert.equal(report.admissionComplete, false);
});

test('unknown clocks and absent, unbounded or coerced evaluation lag refuse conditional accounting', () => {
  for (const timebase of [
    undefined,
    null,
    'Date.now',
    'independent-monotonic-clocks',
    'backward-clock-allowed',
    1,
  ])
    assert.throws(() => reconstructWeightedSlidingQuota({ ...input(), timebase }), /clock|lag/iu);
  for (const maximumEvaluationLagMs of [
    undefined,
    null,
    -1,
    '0',
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(
      () => reconstructWeightedSlidingQuota({ ...input(), maximumEvaluationLagMs }),
      /clock|lag/iu,
    );
  const missing = input();
  delete missing.maximumEvaluationLagMs;
  assert.throws(() => reconstructWeightedSlidingQuota(missing), /options/iu);
  assert.throws(
    () =>
      reconstructWeightedSlidingQuota({
        ...input(),
        maximumEvaluationLagMs: Number.MAX_SAFE_INTEGER,
      }),
    /bucket/iu,
  );
  const overflow = input([charge('overflow', Number.MAX_SAFE_INTEGER - 10)]);
  overflow.maximumEvaluationLagMs = 1;
  assert.throws(() => reconstructWeightedSlidingQuota(overflow), /charge/iu);
});

test('cross-writer Redis member collisions invalidate ordinary timestamp capacity despite monotonic clocks', () => {
  // Model the real Lua's ZSET/HASH member identity and separately incremented
  // total. Duplicate members overwrite one weight but increment total twice.
  function redisDecisions(members) {
    const scores = [0, 0, 10];
    const costs = [1, 1, 2];
    const stored = new Map();
    let total = 0;
    return scores.map((score, index) => {
      for (const [member, event] of stored) {
        if (event.score <= score - 10) {
          total -= event.cost;
          stored.delete(member);
        }
      }
      const allowed = total + costs[index] <= 2;
      if (allowed) {
        stored.set(members[index], { score, cost: costs[index] });
        total += costs[index];
      }
      return { allowed, total, storedMembers: stored.size };
    });
  }
  const colliding = redisDecisions(['0:1', '0:1', '10:2']);
  assert.deepEqual(colliding, [
    { allowed: true, total: 1, storedMembers: 1 },
    { allowed: true, total: 2, storedMembers: 1 },
    { allowed: false, total: 1, storedMembers: 0 },
  ]);
  const unique = redisDecisions(['writer-a:0:1', 'writer-b:0:1', 'writer-a:10:2']);
  assert.deepEqual(
    unique.map(({ allowed }) => allowed),
    [true, true, true],
  );
  const options = input(
    [charge('a', 0), charge('b', 0), charge('c', 10, 10, 2)],
    [{ bucketId: 'tenant-a', windowMs: 10, limit: 2 }],
  );
  const [report] = reconstructWeightedSlidingQuota(options);
  assert.equal(report.maximumPossibleCost, 2);
  assert.equal(report.capacityFitsWithinAssumptions, true);
  assert.equal(report.memberIdentity, 'globally-unique-per-charge');
  assert.equal(report.assumptionsVerified, false);
  assert.equal(report.admissionComplete, false);
});

test('missing or colliding member identity models refuse and an identity getter never executes', () => {
  for (const memberIdentity of [
    undefined,
    null,
    '',
    'per-instance',
    'Date.now:local-sequence',
    1,
    true,
  ])
    assert.throws(
      () => reconstructWeightedSlidingQuota({ ...input(), memberIdentity }),
      /member|identity/iu,
    );
  const missing = input();
  delete missing.memberIdentity;
  assert.throws(() => reconstructWeightedSlidingQuota(missing), /options/iu);
  let getterCalls = 0;
  const accessor = input();
  Object.defineProperty(accessor, 'memberIdentity', {
    get() {
      getterCalls += 1;
      throw new Error('must not execute');
    },
  });
  assert.throws(() => reconstructWeightedSlidingQuota(accessor), /options/iu);
  assert.equal(getterCalls, 0);
});

test('inclusive cutoff expiry keeps the lower window boundary open and the upper boundary closed', () => {
  const exact = reconstructWeightedSlidingQuota(input([charge('old', 0), charge('new', 10)]))[0];
  assert.equal(exact.maximumPossibleCost, 1);
  const before = reconstructWeightedSlidingQuota(input([charge('old', 0), charge('new', 9)]))[0];
  assert.equal(before.maximumPossibleCost, 2);
  const after = reconstructWeightedSlidingQuota(input([charge('old', 0), charge('new', 11)]))[0];
  assert.equal(after.maximumPossibleCost, 1);
  const simultaneous = reconstructWeightedSlidingQuota(
    input([charge('one', 0), charge('two', 0)]),
  )[0];
  assert.equal(simultaneous.maximumPossibleCost, 2);
});

test('inclusive independent dispatch bounds can overlap despite nominal exact-window spacing', () => {
  const report = reconstructWeightedSlidingQuota(
    input([charge('first', -1, 1), charge('next', 9, 11)]),
  )[0];
  assert.equal(report.maximumPossibleCost, 2);
  assert.equal(exhaustiveDiscreteMaximum([charge('first', -1, 1), charge('next', 9, 11)], 10), 2);
});

function lockSchedule(bucketCount, jitterMs) {
  return input(
    Array.from({ length: 600 }, (_, index) =>
      charge(`target-${index}`, index * 500 - jitterMs, index * 500 + jitterMs, 2, {
        bucketId: `tenant-${index % bucketCount}`,
      }),
    ),
    Array.from({ length: bucketCount }, (_, index) => ({
      bucketId: `tenant-${index}`,
      windowMs: 60000,
      limit: 2,
    })),
  );
}
test('120 lock buckets have zero slack while bounded jitter needs the prospectively declared 121-bucket spacing', () => {
  const exact = reconstructWeightedSlidingQuota(lockSchedule(120, 0));
  assert.equal(exact.length, 120);
  assert.equal(
    exact.every(
      ({ maximumPossibleCost, spareCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 2 && spareCost === 0 && capacityFitsWithinAssumptions,
    ),
    true,
  );
  const jitter = reconstructWeightedSlidingQuota(lockSchedule(120, 1));
  assert.equal(
    jitter.every(
      ({ maximumPossibleCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 4 && !capacityFitsWithinAssumptions,
    ),
    true,
  );
  const slack = reconstructWeightedSlidingQuota(lockSchedule(121, 1));
  assert.equal(slack.length, 121);
  assert.equal(
    slack.every(
      ({ maximumPossibleCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 2 && capacityFitsWithinAssumptions,
    ),
    true,
  );
  assert.equal(
    slack.reduce((count, { chargeCount }) => count + chargeCount, 0),
    600,
  );
  const zeroSlackWithLag = lockSchedule(120, 0);
  zeroSlackWithLag.maximumEvaluationLagMs = 1;
  assert.equal(
    reconstructWeightedSlidingQuota(zeroSlackWithLag).every(
      ({ maximumPossibleCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 4 && !capacityFitsWithinAssumptions,
    ),
    true,
  );
  const declaredSlack = lockSchedule(121, 1);
  declaredSlack.maximumEvaluationLagMs = 20;
  assert.equal(
    reconstructWeightedSlidingQuota(declaredSlack).every(
      ({ maximumPossibleCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 2 && capacityFitsWithinAssumptions,
    ),
    true,
  );
  declaredSlack.maximumEvaluationLagMs = 500;
  assert.equal(
    reconstructWeightedSlidingQuota(declaredSlack).every(
      ({ maximumPossibleCost, capacityFitsWithinAssumptions }) =>
        maximumPossibleCost === 4 && !capacityFitsWithinAssumptions,
    ),
    true,
  );
});

test('weighted setup, target and cleanup charges share capacity and overload is never filtered away', () => {
  const original = input([
    charge('setup', 0, 0, 2, { traffic: 'setup' }),
    charge('target', 1, 1, 3),
    charge('cleanup', 2, 2, 1, { traffic: 'cleanup' }),
  ]);
  const snapshot = structuredClone(original);
  const [report] = reconstructWeightedSlidingQuota(original);
  assert.equal(report.maximumPossibleCost, 6);
  assert.equal(report.spareCost, -3);
  assert.equal(report.capacityFitsWithinAssumptions, false);
  assert.equal(report.chargeCount, 3);
  assert.deepEqual(report.trafficCounts, { setup: 1, target: 1, cleanup: 1 });
  assert.deepEqual(original, snapshot);
  assert.throws(
    () => reconstructWeightedSlidingQuota(input([{ ...charge('failed', 0), accepted: false }])),
    /charge/iu,
  );
});

test('separate bucket policies retain independent weighted populations and declared identity order', () => {
  const buckets = [
    { bucketId: 'tenant-b', windowMs: 5, limit: 10 },
    { bucketId: 'tenant-a', windowMs: 10, limit: 3 },
  ];
  const reports = reconstructWeightedSlidingQuota(
    input([charge('a', 0, 0, 4), charge('b', 0, 0, 2, { bucketId: 'tenant-b' })], buckets),
  );
  assert.deepEqual(
    reports.map(({ bucketId }) => bucketId),
    ['tenant-b', 'tenant-a'],
  );
  assert.deepEqual(
    reports.map(({ maximumPossibleCost, capacityFitsWithinAssumptions }) => [
      maximumPossibleCost,
      capacityFitsWithinAssumptions,
    ]),
    [
      [2, true],
      [4, false],
    ],
  );
});

test('unknown, unused and duplicate bucket or charge identities refuse underdeclared populations', () => {
  assert.throws(
    () =>
      reconstructWeightedSlidingQuota(
        input([charge('unknown', 0, 0, 1, { bucketId: 'undeclared' })]),
      ),
    /unknown|charge/iu,
  );
  assert.throws(
    () =>
      reconstructWeightedSlidingQuota(
        input(
          [charge('one', 0)],
          [
            { bucketId: 'tenant-a', windowMs: 10, limit: 3 },
            { bucketId: 'unused', windowMs: 10, limit: 3 },
          ],
        ),
      ),
    /no declared charges/iu,
  );
  assert.throws(
    () => reconstructWeightedSlidingQuota(input([charge('same', 0), charge('same', 1)])),
    /duplicate/iu,
  );
  assert.throws(
    () =>
      reconstructWeightedSlidingQuota(
        input(
          [charge('one', 0)],
          [
            { bucketId: 'tenant-a', windowMs: 10, limit: 3 },
            { bucketId: 'tenant-a', windowMs: 11, limit: 4 },
          ],
        ),
      ),
    /duplicate/iu,
  );
  for (const value of ['', ' ', ' trailing', 1, null]) {
    assert.throws(() => reconstructWeightedSlidingQuota(input([charge(value, 0)])), /charge/iu);
    assert.throws(
      () =>
        reconstructWeightedSlidingQuota(
          input([charge('one', 0)], [{ bucketId: value, windowMs: 10, limit: 3 }]),
        ),
      /bucket/iu,
    );
  }
});

test('numeric coercion, noninteger bounds, reversed uncertainty and arithmetic overflow refuse', () => {
  for (const key of ['windowMs', 'limit'])
    for (const value of [0, -1, 1.5, '10', NaN, Infinity, null, Number.MAX_SAFE_INTEGER + 1]) {
      const candidate = input();
      candidate.buckets[0][key] = value;
      assert.throws(() => reconstructWeightedSlidingQuota(candidate), /bucket/iu);
    }
  for (const key of ['scoreEarliestMs', 'scoreLatestMs', 'cost'])
    for (const value of [1.5, '1', NaN, Infinity, null, Number.MAX_SAFE_INTEGER + 1]) {
      const candidate = input();
      candidate.charges[0][key] = value;
      assert.throws(() => reconstructWeightedSlidingQuota(candidate), /charge/iu);
    }
  for (const cost of [0, -1])
    assert.throws(
      () => reconstructWeightedSlidingQuota(input([charge('one', 0, 0, cost)])),
      /charge/iu,
    );
  assert.throws(() => reconstructWeightedSlidingQuota(input([charge('one', 2, 1)])), /charge/iu);
  assert.throws(
    () => reconstructWeightedSlidingQuota(input([charge('one', Number.MAX_SAFE_INTEGER)])),
    /charge/iu,
  );
  assert.throws(
    () =>
      reconstructWeightedSlidingQuota(
        input([charge('one', 0, 0, Number.MAX_SAFE_INTEGER), charge('two', 1)]),
      ),
    /charge/iu,
  );
  for (const traffic of ['unknown', 'TARGET', '', null, 1])
    assert.throws(
      () => reconstructWeightedSlidingQuota(input([charge('one', 0, 0, 1, { traffic })])),
      /charge/iu,
    );
});

test('closed options, buckets and charges reject unknown keys and accessors without invoking them', () => {
  let calls = 0;
  for (const level of ['options', 'bucket', 'charge']) {
    for (const key of ['unknown', Symbol('unknown')]) {
      const candidate = input();
      const target =
        level === 'options'
          ? candidate
          : level === 'bucket'
            ? candidate.buckets[0]
            : candidate.charges[0];
      Object.defineProperty(target, key, { value: true });
      assert.throws(() => reconstructWeightedSlidingQuota(candidate), /Invalid/iu);
    }
    const candidate = input();
    const [target, key] =
      level === 'options'
        ? [candidate, 'charges']
        : level === 'bucket'
          ? [candidate.buckets[0], 'limit']
          : [candidate.charges[0], 'cost'];
    Object.defineProperty(target, key, {
      get() {
        calls++;
        throw new Error('must not execute');
      },
    });
    assert.throws(() => reconstructWeightedSlidingQuota(candidate), /Invalid/iu);
  }
  assert.equal(calls, 0);
});

test('arrays reject hidden iterators, sparse entries, extra properties and alternate prototypes', () => {
  let calls = 0;
  for (const key of ['buckets', 'charges']) {
    const iterator = input();
    iterator[key][Symbol.iterator] = function* () {
      calls++;
      yield* [];
    };
    assert.throws(() => reconstructWeightedSlidingQuota(iterator), /quota/iu);
    const sparse = input();
    delete sparse[key][0];
    assert.throws(() => reconstructWeightedSlidingQuota(sparse), /quota/iu);
    const extra = input();
    Object.defineProperty(extra[key], 'ignored', { value: true });
    assert.throws(() => reconstructWeightedSlidingQuota(extra), /quota/iu);
    const accessor = input();
    Object.defineProperty(accessor[key], '0', {
      get() {
        calls++;
        throw new Error('must not execute');
      },
    });
    assert.throws(() => reconstructWeightedSlidingQuota(accessor), /quota/iu);
    for (const prototype of [null, {}, Object.create(Array.prototype)]) {
      const candidate = input();
      Object.setPrototypeOf(candidate[key], prototype);
      assert.throws(() => reconstructWeightedSlidingQuota(candidate), /quota/iu);
    }
    assert.throws(() => reconstructWeightedSlidingQuota({ ...input(), [key]: [] }), /quota/iu);
  }
  assert.equal(calls, 0);
});

test('proxies cannot supply trusted quota options, arrays or data members', () => {
  let calls = 0;
  for (const level of ['options', 'buckets', 'charges', 'bucket', 'charge']) {
    let candidate = input();
    const target =
      level === 'options'
        ? candidate
        : level === 'bucket'
          ? candidate.buckets[0]
          : level === 'charge'
            ? candidate.charges[0]
            : candidate[level];
    const proxy = new Proxy(target, {
      get() {
        calls++;
        throw new Error('must not execute');
      },
      ownKeys() {
        calls++;
        throw new Error('must not execute');
      },
    });
    if (level === 'options') candidate = proxy;
    else if (level === 'bucket') candidate.buckets[0] = proxy;
    else if (level === 'charge') candidate.charges[0] = proxy;
    else candidate[level] = proxy;
    assert.throws(() => reconstructWeightedSlidingQuota(candidate), /Invalid/iu);
  }
  assert.equal(calls, 0);
});

test('quota arithmetic reports only this Redis sliding model and cannot claim complete capacity custody', () => {
  const [report] = reconstructWeightedSlidingQuota(input());
  assert.equal(report.model, 'conditional-redis-weighted-sliding-window-v1');
  assert.equal(report.assumptionsVerified, false);
  assert.equal(report.admissionComplete, false);
  assert.equal(Object.hasOwn(report, 'capacityFits'), false);
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'bucketId',
      'model',
      'windowMs',
      'accountingWindowMs',
      'maximumEvaluationLagMs',
      'timebase',
      'memberIdentity',
      'assumptionsVerified',
      'admissionComplete',
      'limit',
      'chargeCount',
      'trafficCounts',
      'maximumPossibleCost',
      'peakWindowEndMs',
      'spareCost',
      'capacityFitsWithinAssumptions',
    ].sort(),
  );
  assert.equal(Object.hasOwn(report, 'verdict'), false);
  assert.equal(Object.hasOwn(report, 'authenticated'), false);
  assert.equal(Object.hasOwn(report, 'complete'), false);
});
