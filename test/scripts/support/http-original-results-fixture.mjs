import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Source-derived fixture records, NOT an executed native run. The complete
// envelope/statistic shapes come from k6 b5328aa782832a80451ea430075af8845dffb7cd:
// output/json/json_test.go104-110, js/summary.go27-98, metrics/sink.go.
// Expected sink values below are simple literal witnesses, not the production
// reconstruction implementation or a substituted owned component.
export const statistics = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];
const definitions = {
  auth: {
    rate: 10,
    duration: 300,
    name: 'auth_flow',
    components: { auth_verify_duration_ms: 10 },
    http: 500,
    failed: 0.01,
  },
  crud: {
    rate: 4,
    duration: 600,
    name: 'crud_flow',
    components: { data_tx_overhead_ms: 2, ratelimit_overhead_ms: 1, idempotency_lookup_ms: 5 },
    http: 750,
    failed: 0.02,
  },
  upload: {
    rate: 5,
    duration: 300,
    name: 'upload_flow',
    components: { storage_presign_duration_ms: 50 },
    http: 1000,
    failed: 0.02,
  },
  'cascade-delete': {
    rate: 2,
    duration: 300,
    name: 'cascade_delete',
    components: { data_tx_overhead_ms: 2 },
    http: 1000,
    failed: 0.02,
  },
};
export const constantTrend = (value) => Object.fromEntries(statistics.map((key) => [key, value]));
export function resultFixture(
  root,
  { scenarioId = 'auth', component = 0.5, completed, dropped, durationMs, tail = false } = {},
) {
  const definition = definitions[scenarioId];
  const duration = durationMs ?? definition.duration * 1000;
  const count = completed ?? definition.rate * definition.duration + 1;
  const records = [];
  const metrics = {};
  const point = (name, value, tags = { scenario: definition.name }) => ({
    type: 'Point',
    metric: name,
    data: { time: '2026-10-11T12:00:00.123456789Z', value, tags },
  });
  function metric(name, type, contains, values, expected, thresholds = {}, tags) {
    records.push({
      type: 'Metric',
      metric: name,
      data: { name, type, contains, thresholds: Object.keys(thresholds), submetrics: null },
    });
    records.push(...values.map((value) => point(name, value, tags)));
    metrics[name] = { type, contains, values: expected };
    if (Object.keys(thresholds).length)
      metrics[name].thresholds = Object.fromEntries(
        Object.entries(thresholds).map(([expression, ok]) => [expression, { ok }]),
      );
  }
  metric('iterations', 'counter', 'default', Array(count).fill(1), {
    count,
    rate: (count * 1000) / duration,
  });
  metric('http_reqs', 'counter', 'default', [1, 1], { count: 2, rate: 2000 / duration });
  if (dropped !== undefined)
    metric('dropped_iterations', 'counter', 'default', [dropped], {
      count: dropped,
      rate: (dropped * 1000) / duration,
    });
  metric(
    'checks',
    'rate',
    'default',
    [1],
    { rate: 1, passes: 1, fails: 0 },
    {},
    { scenario: definition.name, check: 'status200', group: '' },
  );
  metric(
    'http_req_failed',
    'rate',
    'default',
    [0, 0],
    { rate: 0, passes: 0, fails: 2 },
    { [`rate<${definition.failed}`]: true },
  );
  metric('http_req_duration', 'trend', 'time', [20, 20], constantTrend(20), {
    [`p(95)<${definition.http}`]: true,
  });
  for (const [name, maximum] of Object.entries(definition.components)) {
    const values = tail ? [...Array(600).fill(1), ...Array(401).fill(9)] : [component, component];
    const expected = tail
      ? { avg: 4209 / 1001, min: 1, med: 1, max: 9, 'p(90)': 9, 'p(95)': 9, 'p(99)': 9 }
      : constantTrend(component);
    metric(name, 'trend', 'time', values, expected, {
      [`p(99)<${maximum}`]: expected['p(99)'] < maximum,
    });
  }
  metric('generic_gauge', 'gauge', 'default', [-4, -2], { value: -2, min: -4, max: 0 });
  metric('generic_rate', 'rate', 'default', [-2, 0, 4], { rate: 2 / 3, passes: 2, fails: 1 });
  metric('generic_counter', 'counter', 'data', [2, 5], { count: 7, rate: 7000 / duration });
  metric('generic_trend', 'trend', 'default', [1, 2, 4, 8], {
    avg: 3.75,
    min: 1,
    med: 3,
    max: 8,
    'p(90)': 6.8,
    'p(95)': 7.4,
    'p(99)': 7.88,
  });
  const summary = {
    root_group: {
      name: '',
      path: '',
      id: 'fixture-root',
      checks: [
        { name: 'status200', id: 'fixture-check', path: '::status200', passes: 1, fails: 0 },
      ],
      groups: [],
    },
    options: { summaryTrendStats: [...statistics], summaryTimeUnit: '', noColor: true },
    state: { isStdOutTTY: false, isStdErrTTY: false, testRunDurationMs: duration },
    metrics,
  };
  const baseline = { metrics: {} },
    reference = { metrics: {} };
  for (const name of Object.keys(definition.components)) {
    baseline.metrics[name] = { values: { 'p(95)': 20, 'p(99)': 20 } };
    reference.metrics[name] = { 'p(95)': 20, 'p(99)': 20 };
  }
  const options = {
    scenarioId,
    profileId: 'hardening',
    summaryPath: join(root, 'summary.json'),
    metricStreamPath: join(root, 'metrics.json.gz'),
    baseline,
    reference,
  };
  function save() {
    writeFileSync(options.summaryPath, JSON.stringify(summary), { mode: 0o600 });
    writeFileSync(
      options.metricStreamPath,
      gzipSync(Buffer.from(records.map((record) => JSON.stringify(record)).join('\n') + '\n')),
      { mode: 0o600 },
    );
  }
  save();
  return { root, summary, records, options, save, count, definition };
}
