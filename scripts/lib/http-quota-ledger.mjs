// Arithmetic only for the Redis weighted sliding-window store. The producer
// must independently establish the real bucket/policy identities, complete
// traffic population, initial state, source timestamp bounds and a COMMON
// nondecreasing clock with bounded timestamp-to-Redis-evaluation lag and
// collision-free actual Redis members across ALL writers. Local charge IDs
// alone do not prove that store precondition. The
// store samples Date.now BEFORE its asynchronous EVAL, so dispatch order is
// insufficient. No result verifies these assumptions or admits a workload.
// No result from this helper authenticates those inputs or confers PASS.
import { isProxy } from 'node:util/types';

function closedData(value, keys, label) {
  if (
    !value ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !keys.includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
    )
  )
    throw new Error(`Invalid ${label}`);
}

function denseDataArray(value, label) {
  if (
    !Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length === 0 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw new Error(`Invalid ${label}`);
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new Error(`Invalid ${label} member`);
    copy.push(descriptor.value);
  }
  return copy;
}

function identity(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

/**
 * Find the largest possible charge in ANY (end-windowMs, end] interval.
 * Each charge's source timestamp can lie anywhere in its inclusive bounds.
 * If EVAL happens at e with timestamp >= e-L on a common nondecreasing clock,
 * retained charges have timestamps in (e-(windowMs+L), e]. Thus widen the
 * ACCOUNTING horizon by L, preserving the actual backend policy window.
 * Without independently proved clock/lag bounds this model cannot be admitted.
 * It can occupy such an interval precisely when
 *   scoreEarliestMs <= end < scoreLatestMs + accountingWindowMs.
 * Sweep those half-open intervals, expiring old charges before equal-time
 * additions. This matches redis-rate-limit.store.ts's inclusive cutoff removal.
 * The independent presign fixed-window limiter is NOT this store model.
 */
export function reconstructWeightedSlidingQuota(options) {
  closedData(
    options,
    ['buckets', 'charges', 'maximumEvaluationLagMs', 'timebase', 'memberIdentity'],
    'sliding quota options',
  );
  const { maximumEvaluationLagMs, timebase, memberIdentity } = options;
  if (
    timebase !== 'common-nondecreasing-milliseconds' ||
    !Number.isSafeInteger(maximumEvaluationLagMs) ||
    maximumEvaluationLagMs < 0
  )
    throw new Error('Unknown or unbounded quota clock/evaluation lag');
  if (memberIdentity !== 'globally-unique-per-charge')
    throw new Error('Unknown or colliding Redis quota member identity');
  const buckets = denseDataArray(options.buckets, 'quota buckets');
  const charges = denseDataArray(options.charges, 'quota charges');
  const states = new Map();
  for (const bucket of buckets) {
    closedData(bucket, ['bucketId', 'windowMs', 'limit'], 'quota bucket');
    if (
      !identity(bucket.bucketId) ||
      states.has(bucket.bucketId) ||
      !Number.isSafeInteger(bucket.windowMs) ||
      bucket.windowMs <= 0 ||
      !Number.isSafeInteger(bucket.windowMs + maximumEvaluationLagMs) ||
      !Number.isSafeInteger(bucket.limit) ||
      bucket.limit <= 0
    )
      throw new Error('Invalid or duplicate quota bucket');
    states.set(bucket.bucketId, {
      bucketId: bucket.bucketId,
      windowMs: bucket.windowMs,
      accountingWindowMs: bucket.windowMs + maximumEvaluationLagMs,
      limit: bucket.limit,
      totalCost: 0,
      chargeCount: 0,
      trafficCounts: { setup: 0, target: 0, cleanup: 0 },
      edges: new Map(),
    });
  }
  const identities = new Set();
  for (const charge of charges) {
    closedData(
      charge,
      ['chargeId', 'bucketId', 'scoreEarliestMs', 'scoreLatestMs', 'cost', 'traffic'],
      'quota charge',
    );
    const state = states.get(charge.bucketId);
    if (
      !identity(charge.chargeId) ||
      identities.has(charge.chargeId) ||
      !state ||
      !Number.isSafeInteger(charge.scoreEarliestMs) ||
      !Number.isSafeInteger(charge.scoreLatestMs) ||
      charge.scoreLatestMs < charge.scoreEarliestMs ||
      !Number.isSafeInteger(charge.scoreLatestMs + state.accountingWindowMs) ||
      !Number.isSafeInteger(charge.cost) ||
      charge.cost <= 0 ||
      !['setup', 'target', 'cleanup'].includes(charge.traffic) ||
      !Number.isSafeInteger(state.totalCost + charge.cost)
    )
      throw new Error('Invalid, unknown or duplicate quota charge');
    identities.add(charge.chargeId);
    state.totalCost += charge.cost;
    state.chargeCount += 1;
    state.trafficCounts[charge.traffic] += 1;
    for (const [time, delta] of [
      [charge.scoreEarliestMs, charge.cost],
      [charge.scoreLatestMs + state.accountingWindowMs, -charge.cost],
    ])
      state.edges.set(time, (state.edges.get(time) ?? 0) + delta);
  }
  return [...states.values()].map((state) => {
    if (state.chargeCount === 0) throw new Error('Quota bucket has no declared charges');
    let used = 0;
    let maximumPossibleCost = 0;
    let peakWindowEndMs;
    for (const [time, delta] of [...state.edges.entries()].sort(([a], [b]) => a - b)) {
      used += delta;
      if (used > maximumPossibleCost) {
        maximumPossibleCost = used;
        peakWindowEndMs = time;
      }
    }
    return {
      bucketId: state.bucketId,
      model: 'conditional-redis-weighted-sliding-window-v1',
      windowMs: state.windowMs,
      accountingWindowMs: state.accountingWindowMs,
      maximumEvaluationLagMs,
      timebase,
      memberIdentity,
      assumptionsVerified: false,
      admissionComplete: false,
      limit: state.limit,
      chargeCount: state.chargeCount,
      trafficCounts: { ...state.trafficCounts },
      maximumPossibleCost,
      peakWindowEndMs,
      spareCost: state.limit - maximumPossibleCost,
      capacityFitsWithinAssumptions: maximumPossibleCost <= state.limit,
    };
  });
}
