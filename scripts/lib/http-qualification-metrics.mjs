import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parseBaselineJson } from './k6-baseline-json.mjs';

const arrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(arrayPrototype, 'length').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(arrayPrototype, 'buffer').get;

// Reconstruct actual pinned k6 JSON output counters; supplied bytes are no
// process, native-code, scheduling, quota or measurement authority.
export function decodeHttpQualificationNativeMetrics(input, caseId) {
  const fail = () => {
    throw new Error('Closed native k6 metric capture refused');
  };
  if (
    arguments.length !== 2 ||
    types.isProxy(input) ||
    !Buffer.isBuffer(input) ||
    Object.getPrototypeOf(input) !== Buffer.prototype ||
    types.isSharedArrayBuffer(nativeBuffer.call(input)) ||
    nativeLength.call(input) < 1 ||
    nativeLength.call(input) > 64 * 1024 * 1024 ||
    typeof caseId !== 'string'
  )
    fail();
  const bytes = Buffer.allocUnsafe(nativeLength.call(input));
  Uint8Array.prototype.set.call(bytes, input);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.endsWith('\n')) fail();
  const lines = text.slice(0, -1).split('\n');
  if (lines.length > 100_000) fail();
  const declarations = new Map();
  const populations = new Map([
    ['supplemental_target_started', new Set()],
    ['supplemental_target_completed', new Set()],
    ['http_reqs', new Set()],
  ]);
  let dropped = 0;
  const rows = [];
  for (const line of lines) {
    const row = JSON.parse(JSON.stringify(parseBaselineJson(Buffer.from(line))));
    if (
      !row ||
      Object.keys(row).sort().join(',') !== 'data,metric,type' ||
      typeof row.metric !== 'string' ||
      !row.data ||
      typeof row.data !== 'object'
    )
      fail();
    if (row.type === 'Metric') {
      if (
        declarations.has(row.metric) ||
        row.data.name !== row.metric ||
        Object.keys(row.data).sort().join(',') !== 'contains,name,submetrics,thresholds,type'
      )
        fail();
      declarations.set(row.metric, row.data);
    } else if (row.type === 'Point') {
      if (
        !declarations.has(row.metric) ||
        !['tags,time,value', 'metadata,tags,time,value'].includes(
          Object.keys(row.data).sort().join(','),
        ) ||
        typeof row.data.time !== 'string' ||
        !Number.isFinite(Date.parse(row.data.time)) ||
        !Number.isFinite(row.data.value) ||
        !row.data.tags ||
        Object.values(row.data.tags).some((value) => typeof value !== 'string')
      )
        fail();
      const population = populations.get(row.metric);
      if (population) {
        const sequence = row.data.tags.target_sequence;
        if (
          declarations.get(row.metric).type !== 'counter' ||
          row.data.value !== 1 ||
          row.data.tags.case_id !== caseId ||
          typeof sequence !== 'string' ||
          !/^(0|[1-9][0-9]{0,2})$/u.test(sequence) ||
          Number(sequence) >= 600 ||
          population.has(sequence)
        )
          fail();
        population.add(sequence);
      }
      if (row.metric === 'dropped_iterations') {
        if (row.data.value < 0 || !Number.isSafeInteger(row.data.value)) fail();
        dropped += row.data.value;
      }
    } else fail();
    rows.push(row);
  }
  if ([...populations.values()].some((population) => population.size !== 600)) fail();
  return {
    scope: 'native-k6-counter-byte-reconstruction-component',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    startedTargetCount: populations.get('supplemental_target_started').size,
    completedTargetCount: populations.get('supplemental_target_completed').size,
    httpRequestCount: populations.get('http_reqs').size,
    droppedTargetCount: dropped,
    rows,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
