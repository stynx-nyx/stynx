import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { collectLegacyK6Baseline } from '../../scripts/lib/k6-baseline-collector.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TOKEN = 'inspector-collector-external-token';
const SIGNED = 'https://fixture.blob.core.windows.net/archive.zip?sig=external-secret';
const candidate = 'c'.repeat(40);
const repository = () => ({ id: 1221320856, full_name: 'stynx-nyx/stynx' });
const copy = (value) => JSON.parse(JSON.stringify(value));
function run(overrides = {}) {
  return {
    id: 500,
    run_attempt: 1,
    run_number: 500,
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    created_at: '2020-01-01T10:00:00Z',
    run_started_at: '2020-01-01T10:00:01Z',
    updated_at: '2020-01-01T10:02:00Z',
    repository: repository(),
    head_repository: repository(),
    workflow_id: 266480675,
    path: '.github/workflows/hardening.yml',
    ...overrides,
  };
}
const current = () =>
  run({
    id: 900,
    head_sha: candidate,
    status: 'in_progress',
    conclusion: null,
    created_at: '2020-01-02T10:00:00Z',
    run_started_at: '2020-01-02T10:00:01Z',
    updated_at: '2020-01-02T10:00:02Z',
  });

// Small conventional stored ZIP fixture, independently produced with IEEE CRC32.
function archive(members) {
  const locals = [],
    directories = [];
  let offset = 0;
  for (const { name: text, body: source } of members) {
    const name = Buffer.from(text),
      body = Buffer.from(source);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(10, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(10, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0x20, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    directories.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(directories),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const members = () =>
  ['auth', 'crud', 'upload', 'cascade-delete'].flatMap((name) => [
    {
      name: `${name}.summary.json`,
      body: JSON.stringify({
        metrics: { duration: { values: { 'p(95)': 12, 'p(99)': 14 } } },
        historicalProfile: name,
      }),
    },
    { name: `${name}.summary.html`, body: `<html><body>${name} historical profile</body></html>` },
  ]);
function streamed(bytes, status = 200, headers = {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
    { status, headers },
  );
}
function fixture({ hooks = {}, body = archive(members()), runs, artifacts, padding = 0 } = {}) {
  const artifact = {
    id: 301,
    name: 'k6-results-all',
    expired: false,
    digest: `sha256:${sha256(body)}`,
    size_in_bytes: body.length,
    created_at: '2020-01-01T10:01:00Z',
    updated_at: '2020-01-01T10:01:01Z',
    expires_at: '2099-01-01T10:00:00Z',
    workflow_run: {
      id: 500,
      repository_id: 1221320856,
      head_repository_id: 1221320856,
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
    },
  };
  const rows = runs ?? [
    ...Array.from({ length: 100 }, (_, index) => run({ id: index + 1, conclusion: 'failure' })),
    run(),
    run({ id: 499, created_at: '2020-01-01T09:00:00Z', run_started_at: '2020-01-01T09:00:01Z' }),
  ];
  const artifactRows = artifacts ?? [
    ...Array.from({ length: 100 }, (_, index) => ({
      id: index + 1000,
      name: `unrelated-${index}`,
    })),
    artifact,
  ];
  const calls = [],
    raw = new Map(),
    counts = new Map();
  async function fetchImpl(url, options) {
    const parsed = new URL(url);
    let stage, value;
    const count = (key) => {
      const number = (counts.get(key) ?? 0) + 1;
      counts.set(key, number);
      return number;
    };
    if (url === SIGNED) {
      stage = 'delivery';
      value = body;
    } else {
      assert.equal(parsed.origin, 'https://api.github.com');
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      const path = parsed.pathname.replace('/repos/stynx-nyx/stynx/actions/', '');
      if (path === 'workflows/266480675') {
        stage = 'workflow';
        value = { id: 266480675, path: '.github/workflows/hardening.yml', state: 'active' };
      } else if (path === 'runs/900') {
        stage = count('current') === 1 ? 'current-before' : 'current-after';
        value = current();
      } else if (path === 'workflows/266480675/runs') {
        const page = Number(parsed.searchParams.get('page'));
        stage = `runs-${page}`;
        value = {
          total_count: rows.length,
          workflow_runs: rows.slice((page - 1) * 100, page * 100),
        };
      } else if (path === 'runs/500') {
        stage = count('selected') === 1 ? 'selected-before' : 'selected-after';
        value = run();
      } else if (path === 'runs/500/attempts/1') {
        stage = count('attempt') === 1 ? 'attempt-before' : 'attempt-after';
        value = run();
      } else if (path === 'runs/500/artifacts') {
        const page = Number(parsed.searchParams.get('page'));
        stage = `artifacts-${page}`;
        value = {
          total_count: artifactRows.length,
          artifacts: artifactRows.slice((page - 1) * 100, page * 100),
        };
      } else if (path === 'artifacts/301') {
        stage = count('artifact') === 1 ? 'artifact-before' : 'artifact-after';
        value = artifact;
      } else if (path === 'artifacts/301/zip') {
        stage = 'redirect';
        value = null;
      } else throw new Error(`Unexpected external request ${url}`);
    }
    calls.push({ stage, url, options });
    const changed = hooks[stage]
      ? await hooks[stage](copy(value), { artifact, rows, artifactRows, calls })
      : undefined;
    if (changed instanceof Response) return changed;
    if (stage === 'redirect')
      return new Response(null, { status: 302, headers: { location: SIGNED } });
    if (stage === 'delivery') return streamed(changed ?? body);
    const bytes = Buffer.from(JSON.stringify(changed ?? value) + ' '.repeat(padding));
    raw.set(stage, bytes);
    return streamed(bytes, 200, {
      'content-type': 'application/json',
      'content-length': String(bytes.length),
    });
  }
  return {
    input: {
      runId: 900,
      runAttempt: 1,
      headSha: candidate,
      scenario: 'all',
      token: TOKEN,
      fetchImpl,
    },
    calls,
    raw,
    artifact,
    body,
  };
}
async function refused(
  setup,
  pattern = /BASELINE_(?:COLLECTION|IDENTITY|TRANSPORT|ARCHIVE|JSON)_REFUSED/u,
) {
  await assert.rejects(collectLegacyK6Baseline(setup.input), (error) => {
    assert.doesNotMatch(String(error), /inspector-collector-external-token|external-secret|sig=/u);
    return pattern.test(error.message);
  });
}

test('actual collector acquires complete two-page populations and exact legacy bytes without promotion', async () => {
  const owned = fixture();
  const result = await collectLegacyK6Baseline(owned.input);
  assert.equal(result.receipt.discoveryCount, 102);
  assert.equal(result.receipt.artifactPopulationCount, 101);
  assert.equal(result.receipt.selected.id, 500);
  assert.equal(result.receipt.current.headSha, candidate);
  assert.equal(result.receipt.responses.length, 13);
  assert.equal(result.responses.length, 13);
  assert.deepEqual(result.archiveBytes, owned.body);
  assert.equal(result.receipt.archive.sha256, sha256(owned.body));
  assert.equal(result.files.length, 8);
  for (const file of result.files) {
    const original = members().find(({ name }) => name === file.name);
    assert.equal(file.bytes.toString(), original.body);
    assert.equal(file.sha256, sha256(Buffer.from(original.body)));
  }
  for (const response of result.responses) {
    const bytes = owned.raw.get(
      response.name
        .replace('.json', '')
        .replace('workflow_runs-page-', 'runs-')
        .replace('artifacts-page-', 'artifacts-')
        .replace('selected-attempt-', 'attempt-'),
    );
    assert.deepEqual(response.bytes, bytes);
    assert.equal(response.sha256, sha256(bytes));
    assert.equal(response.size, bytes.length);
  }
  assert.deepEqual(
    result.receipt.responses,
    result.responses.map(({ bytes: _bytes, ...record }) => record),
  );
  for (const key of [
    'firstSeedAllowed',
    'originVerified',
    'attemptVerified',
    'profileVerified',
    'sourceBuildVerified',
    'endpointQualificationVerified',
    'measurementComplete',
    'readinessPromoting',
  ])
    assert.equal(result.receipt[key], false);
  assert.equal(Object.isFrozen(result.receipt), true);
  assert.equal(Object.isFrozen(result.responses), true);
  assert.equal(owned.calls.filter(({ stage }) => stage.startsWith('runs-')).length, 2);
  assert.equal(owned.calls.filter(({ stage }) => stage.startsWith('artifacts-')).length, 2);
  assert.equal(owned.calls.at(-1).stage, 'current-after');
  result.archiveBytes[0] ^= 1;
  assert.notEqual(sha256(result.archiveBytes), result.receipt.archive.sha256);
  assert.doesNotMatch(
    JSON.stringify(result.receipt),
    /external-secret|inspector-collector-external-token/u,
  );
});

for (const [label, stage, change] of [
  ['workflow ID', 'workflow', (v) => ({ ...v, id: 1 })],
  ['workflow path', 'workflow', (v) => ({ ...v, path: '.github/workflows/other.yml' })],
  ['disabled workflow', 'workflow', (v) => ({ ...v, state: 'disabled_manually' })],
  ['current SHA', 'current-before', (v) => ({ ...v, head_sha: 'd'.repeat(40) })],
  ['current attempt', 'current-before', (v) => ({ ...v, run_attempt: 2 })],
  ['current workflow', 'current-before', (v) => ({ ...v, workflow_id: 1 })],
  ['page count changes', 'runs-2', (v) => ({ ...v, total_count: v.total_count - 1 })],
  [
    'duplicate page identity',
    'runs-2',
    (v) => ({ ...v, workflow_runs: [run({ id: 1 }), v.workflow_runs[1]] }),
  ],
  ['short page', 'runs-1', (v) => ({ ...v, workflow_runs: v.workflow_runs.slice(1) })],
  ['search cap 1000', 'runs-1', (v) => ({ ...v, total_count: 1000 })],
  ['empty history', 'runs-1', () => ({ total_count: 0, workflow_runs: [] })],
  ['selected detail changes', 'selected-before', (v) => ({ ...v, head_sha: 'd'.repeat(40) })],
  ['selected attempt differs', 'attempt-before', (v) => ({ ...v, run_attempt: 2 })],
  ['artifact page count changes', 'artifacts-2', (v) => ({ ...v, total_count: 100 })],
  [
    'duplicate artifact identity',
    'artifacts-2',
    (v) => ({ ...v, artifacts: [{ ...v.artifacts[0], id: 1000 }] }),
  ],
  ['artifact population cap', 'artifacts-1', (v) => ({ ...v, total_count: 10001 })],
  [
    'missing required artifact',
    'artifacts-2',
    (v) => ({ ...v, artifacts: [{ ...v.artifacts[0], name: 'scenario-only-auth' }] }),
  ],
  [
    'unknown artifact name',
    'artifacts-1',
    (v) => ({ ...v, artifacts: [{ id: 1000 }, ...v.artifacts.slice(1)] }),
  ],
  [
    'nonstring artifact name',
    'artifacts-1',
    (v) => ({ ...v, artifacts: [{ id: 1000, name: 3 }, ...v.artifacts.slice(1)] }),
  ],
  [
    'duplicate matching artifact',
    'artifacts-1',
    (v, state) => ({ ...v, artifacts: [{ ...state.artifact, id: 1000 }, ...v.artifacts.slice(1)] }),
  ],
  [
    'expired listed artifact',
    'artifacts-2',
    (v) => ({ ...v, artifacts: [{ ...v.artifacts[0], expired: true }] }),
  ],
  [
    'artifact detail differs',
    'artifact-before',
    (v) => ({ ...v, digest: `sha256:${'d'.repeat(64)}` }),
  ],
  ['selected run races download', 'selected-after', (v) => ({ ...v, run_attempt: 2 })],
  [
    'attempt races download',
    'attempt-after',
    (v) => ({ ...v, updated_at: '2020-01-01T10:02:01Z' }),
  ],
  [
    'artifact races download',
    'artifact-after',
    (v) => ({ ...v, size_in_bytes: v.size_in_bytes + 1 }),
  ],
  ['artifact expires after read', 'artifact-after', (v) => ({ ...v, expired: true })],
  ['current SHA changes', 'current-after', (v) => ({ ...v, head_sha: 'd'.repeat(40) })],
  ['current attempt changes', 'current-after', (v) => ({ ...v, run_attempt: 2 })],
  ['current immutable event changes', 'current-after', (v) => ({ ...v, event: 'push' })],
]) {
  test(`actual acquisition refuses ${label}`, async () => {
    await refused(fixture({ hooks: { [stage]: change } }));
  });
}

test('latest selected run missing its artifact never probes older successful run', async () => {
  const owned = fixture({
    hooks: { 'artifacts-2': (v) => ({ ...v, artifacts: [{ id: 301, name: 'k6-results-auth' }] }) },
  });
  await refused(owned, /no older fallback/u);
  assert.equal(
    owned.calls.some(({ url }) => /\/runs\/499(?:[/?]|$)/u.test(url)),
    false,
  );
  assert.equal(
    owned.calls.some(({ stage }) => stage === 'redirect'),
    false,
  );
});

test('unresolved historical rerun and same-second completion refuse before artifact discovery', async () => {
  for (const overrides of [
    { run_attempt: 2, updated_at: '2020-01-02T10:01:00Z' },
    { updated_at: '2020-01-02T10:00:00Z' },
  ]) {
    const owned = fixture({ runs: [run(overrides), run({ id: 499 })] });
    await refused(owned, /cutoff/u);
    assert.equal(
      owned.calls.some(({ stage }) => stage.startsWith('artifacts-')),
      false,
    );
  }
});

test('downloaded size, digest, archive structure and embedded JSON are independently enforced', async () => {
  const bytes = archive(members());
  const changed = Buffer.from(bytes);
  changed[40] ^= 1;
  for (const delivery of [changed, bytes.subarray(0, bytes.length - 1)])
    await refused(fixture({ hooks: { delivery: () => delivery } }), /size or digest mismatch/u);
  for (const body of [
    Buffer.from('not a ZIP'),
    archive(members().slice(1)),
    archive([...members(), { name: 'extra.txt', body: 'unadmitted' }]),
    archive(
      members().map((member) =>
        member.name === 'auth.summary.json'
          ? { ...member, body: '{"metrics":{},"metrics":{}}' }
          : member,
      ),
    ),
    archive(
      members().map((member) =>
        member.name === 'auth.summary.json' ? { ...member, body: '{"metrics":[]}' } : member,
      ),
    ),
  ])
    await refused(fixture({ body }));
});

test('API duplicate JSON, non-UTF8 and truncated delivery refuse without a receipt', async () => {
  for (const bytes of [Buffer.from('{"id":1,"id":2}'), Buffer.from([0xc0, 0xaf])]) {
    const owned = fixture({
      hooks: { workflow: () => streamed(bytes, 200, { 'content-type': 'application/json' }) },
    });
    await refused(owned);
    assert.equal(owned.calls[0].options.signal.aborted, true);
  }
  await refused(
    fixture({
      hooks: { delivery: () => streamed(Buffer.from('short'), 200, { 'content-length': '100' }) },
    }),
  );
});

test('collector validates closed own options without invoking accessors or making requests', async () => {
  let traps = 0;
  const get = () => {
    traps += 1;
    throw new Error('options getter');
  };
  const owned = fixture();
  const accessor = { ...owned.input };
  Object.defineProperty(accessor, 'token', { get });
  for (const input of [
    { ...owned.input, extra: true },
    accessor,
    new Proxy(owned.input, { get, ownKeys: get }),
    { ...owned.input, runId: 0 },
    { ...owned.input, runAttempt: 1.5 },
    { ...owned.input, scenario: 'other' },
  ])
    await refused({ input });
  assert.equal(traps, 0);
  assert.equal(owned.calls.length, 0);
});

test('aggregate API evidence cap refuses individually valid bounded responses before archive delivery', async () => {
  const owned = fixture({ padding: 4 * 1024 * 1024 - 100_000 });
  await refused(owned, /API evidence resource limit/u);
  assert.equal(
    owned.calls.some(({ stage }) => stage === 'redirect'),
    false,
  );
  assert.ok(owned.raw.size > 8);
  assert.ok([...owned.raw.values()].every((bytes) => bytes.length < 4 * 1024 * 1024));
});

test('normal current-run completion during read-only acquisition preserves the original cutoff', async () => {
  const owned = fixture({
    hooks: {
      'current-after': (v) => ({
        ...v,
        status: 'completed',
        conclusion: 'success',
        updated_at: '2020-01-02T10:10:00Z',
      }),
    },
  });
  const result = await collectLegacyK6Baseline(owned.input);
  assert.equal(result.receipt.current.status, 'in_progress');
  assert.equal(result.receipt.current.createdAt, '2020-01-02T10:00:00Z');
  assert.equal(result.receipt.selected.id, 500);
  assert.equal(result.receipt.readinessPromoting, false);
});

test('expiry is checked again after actual acquisition without substituting the production clock', async () => {
  const expires = new Date(Date.now() + 2000).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const change = (v) => ({ ...v, expires_at: expires });
  const owned = fixture({
    hooks: {
      'artifacts-2': (v) => ({ ...v, artifacts: v.artifacts.map(change) }),
      'artifact-before': change,
      'artifact-after': change,
      delivery: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      },
    },
  });
  await refused(owned, /expiry/u);
  assert.equal(
    owned.calls.some(({ stage }) => stage === 'delivery'),
    true,
  );
});
