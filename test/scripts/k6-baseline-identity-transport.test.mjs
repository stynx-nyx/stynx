import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  baselineRepository,
  projectBaselineArtifact,
  projectBaselineRun,
  selectPriorBaselineRun,
} from '../../scripts/lib/k6-baseline-identity.mjs';
import { createGithubBaselineTransport } from '../../scripts/lib/k6-baseline-transport.mjs';

const repository = () => ({ id: 1221320856, full_name: 'stynx-nyx/stynx' });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TOKEN = 'inspector-external-test-token';
const signedUrl = 'https://fixture.blob.core.windows.net/artifact.zip?sig=private-test-signature';
const now = Date.parse('2026-10-10T12:00:00Z');
function run(overrides = {}) {
  return {
    id: 101,
    run_attempt: 1,
    run_number: 50,
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-10T10:00:00Z',
    run_started_at: '2026-10-10T10:00:01Z',
    updated_at: '2026-10-10T10:02:00Z',
    repository: repository(),
    head_repository: repository(),
    workflow_id: 266480675,
    path: '.github/workflows/hardening.yml',
    ...overrides,
  };
}
const current = () =>
  run({
    id: 200,
    status: 'in_progress',
    conclusion: null,
    created_at: '2026-10-10T11:00:00Z',
    run_started_at: '2026-10-10T11:00:01Z',
    updated_at: '2026-10-10T11:00:02Z',
  });
function artifact(overrides = {}) {
  return {
    id: 301,
    name: 'k6-results-all',
    expired: false,
    digest: `sha256:${'b'.repeat(64)}`,
    size_in_bytes: 4096,
    created_at: '2026-10-10T10:01:00Z',
    updated_at: '2026-10-10T10:01:01Z',
    expires_at: '2026-11-10T10:00:00Z',
    workflow_run: {
      id: 101,
      repository_id: 1221320856,
      head_repository_id: 1221320856,
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
    },
    ...overrides,
  };
}

test('identity projects immutable run and artifact facts without attesting origin or attempt', () => {
  assert.deepEqual(baselineRepository, {
    id: 1221320856,
    fullName: 'stynx-nyx/stynx',
    workflowId: 266480675,
    workflowPath: '.github/workflows/hardening.yml',
  });
  const raw = run();
  const projected = projectBaselineRun(raw);
  assert.equal(projected.id, raw.id);
  assert.equal(projected.runAttempt, raw.run_attempt);
  assert.equal(projected.headSha, raw.head_sha);
  assert.equal(Object.isFrozen(projected), true);
  raw.head_sha = 'c'.repeat(40);
  assert.equal(projected.headSha, 'a'.repeat(40));
  const evidence = projectBaselineArtifact(artifact(), run(), 'all', now);
  assert.equal(evidence.id, 301);
  assert.equal(evidence.runId, 101);
  assert.equal(evidence.runAttempt, 1);
  assert.equal(evidence.sha256, 'b'.repeat(64));
  assert.equal(evidence.originVerified, false);
  assert.equal(evidence.attemptVerified, false);
  assert.equal(Object.isFrozen(evidence), true);
});

for (const [label, changes] of [
  ['repository ID', { repository: { ...repository(), id: 1 } }],
  ['head repository', { head_repository: { ...repository(), full_name: 'other/repository' } }],
  ['workflow ID', { workflow_id: 1 }],
  ['workflow path', { path: '.github/workflows/ci.yml' }],
  ['run ID', { id: 0 }],
  ['unsafe ID', { id: Number.MAX_SAFE_INTEGER + 1 }],
  ['run attempt', { run_attempt: 0 }],
  ['run number', { run_number: 1.5 }],
  ['SHA spelling', { head_sha: 'A'.repeat(40) }],
  ['empty branch', { head_branch: '' }],
  ['empty event', { event: '' }],
  ['unknown status', { status: 'successful' }],
  ['unknown conclusion', { conclusion: 'passed' }],
  ['unfinished conclusion', { status: 'queued' }],
  ['finished null conclusion', { conclusion: null }],
  ['finished missing start', { run_started_at: null }],
  ['invalid calendar', { created_at: '2026-02-30T10:00:00Z' }],
  ['unbound timestamp precision', { created_at: '2026-10-10T10:00:00.000Z' }],
  ['update before creation', { updated_at: '2026-10-10T09:00:00Z' }],
  ['start before creation', { run_started_at: '2026-10-10T09:59:59Z' }],
  ['update before start', { updated_at: '2026-10-10T10:00:00Z' }],
]) {
  test(`run identity refuses ${label}`, () => {
    assert.throws(() => projectBaselineRun(run(changes)), /BASELINE_IDENTITY_REFUSED/u);
  });
}

test('queued runs permit null start but in-progress or finished runs require actual start', () => {
  for (const status of ['queued', 'waiting', 'requested', 'pending']) {
    assert.equal(
      projectBaselineRun(run({ status, conclusion: null, run_started_at: null })).startedAt,
      null,
    );
  }
  assert.throws(
    () =>
      projectBaselineRun(run({ status: 'in_progress', conclusion: null, run_started_at: null })),
    /BASELINE_IDENTITY_REFUSED/u,
  );
});

test('selection uses latest creation before artifact availability and never authorizes first seed', () => {
  const newest = run({
    id: 102,
    created_at: '2026-10-10T10:01:00Z',
    run_started_at: '2026-10-10T10:01:01Z',
    artifact_available: false,
  });
  const older = run({ id: 101, artifact_available: true });
  const selected = selectPriorBaselineRun(current(), [older, newest, current()]);
  assert.equal(selected.selected.id, 102);
  assert.equal(selected.examined, 3);
  assert.equal(selected.firstSeedAllowed, false);
  assert.equal(selected.originVerified, false);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(selectPriorBaselineRun(current(), []).selected, null);
  assert.equal(selectPriorBaselineRun(current(), []).firstSeedAllowed, false);
  const sameCreated = run({ id: 103 });
  assert.equal(selectPriorBaselineRun(current(), [older, sameCreated]).selected.id, 103);
  const failed = run({
    id: 104,
    conclusion: 'failure',
    created_at: '2026-10-10T10:01:00Z',
    run_started_at: '2026-10-10T10:01:01Z',
  });
  assert.equal(selectPriorBaselineRun(current(), [older, failed]).selected.id, 101);
});

test('historical rerun and same-second cutoff ambiguity refuse rather than fall back to older success', () => {
  const older = run({
    id: 99,
    created_at: '2026-10-10T09:00:00Z',
    run_started_at: '2026-10-10T09:00:01Z',
  });
  for (const unresolved of [
    run({ run_attempt: 2, updated_at: '2026-10-10T11:01:00Z' }),
    run({ updated_at: '2026-10-10T11:00:00Z' }),
  ]) {
    assert.throws(() => selectPriorBaselineRun(current(), [older, unresolved]), /cutoff/u);
  }
  const sameCreated = run({
    created_at: '2026-10-10T11:00:00Z',
    run_started_at: '2026-10-10T11:00:00Z',
    updated_at: '2026-10-10T11:00:01Z',
  });
  assert.equal(selectPriorBaselineRun(current(), [sameCreated]).selected, null);
  assert.throws(() => selectPriorBaselineRun(current(), [run(), run()]), /duplicate/u);
  assert.throws(
    () => selectPriorBaselineRun(current(), [run({ head_branch: 'feature' })]),
    /non-main/u,
  );
});

test('identity requires own metadata and dense populations without executing caller accessors', () => {
  let calls = 0;
  const getter = () => {
    calls += 1;
    throw new Error('metadata accessor');
  };
  const accessor = run();
  Object.defineProperty(accessor, 'id', { get: getter });
  const inherited = Object.assign(Object.create({ id: 101 }), run());
  delete inherited.id;
  for (const value of [
    accessor,
    inherited,
    new Proxy(run(), { get: getter, getPrototypeOf: getter }),
  ]) {
    assert.throws(() => projectBaselineRun(value), /BASELINE_IDENTITY_REFUSED/u);
  }
  const sparse = new Array(1),
    indexed = [run()],
    iterated = [run()];
  Object.defineProperty(indexed, '0', { get: getter });
  Object.defineProperty(iterated, Symbol.iterator, { get: getter });
  for (const runs of [
    sparse,
    indexed,
    iterated,
    new Proxy([run()], { get: getter }),
    Object.assign([run()], { map: () => [] }),
    new Array(10_001).fill(run()),
  ]) {
    assert.throws(() => selectPriorBaselineRun(current(), runs), /BASELINE_IDENTITY_REFUSED/u);
  }
  assert.equal(calls, 0);
});

for (const [label, changes] of [
  ['missing digest', { digest: null }],
  ['wrong digest kind', { digest: `sha512:${'b'.repeat(64)}` }],
  ['expired flag', { expired: true }],
  ['scenario name', { name: 'k6-results-auth' }],
  ['oversize', { size_in_bytes: 32 * 1024 * 1024 + 1 }],
  ['empty', { size_in_bytes: 0 }],
  ['run ID', { workflow_run: { ...artifact().workflow_run, id: 100 } }],
  ['head SHA', { workflow_run: { ...artifact().workflow_run, head_sha: 'c'.repeat(40) } }],
  ['repository ID', { workflow_run: { ...artifact().workflow_run, repository_id: 1 } }],
  ['head repository ID', { workflow_run: { ...artifact().workflow_run, head_repository_id: 1 } }],
  ['branch', { workflow_run: { ...artifact().workflow_run, head_branch: 'feature' } }],
  ['before run start', { created_at: '2026-10-10T10:00:00Z' }],
  ['update before creation', { updated_at: '2026-10-10T10:00:59Z' }],
  ['update after run', { updated_at: '2026-10-10T10:02:01Z' }],
  ['expired at clock equality', { expires_at: '2026-10-10T12:00:00Z' }],
]) {
  test(`artifact identity refuses ${label}`, () => {
    assert.throws(
      () => projectBaselineArtifact(artifact(changes), run(), 'all', now),
      /BASELINE_IDENTITY_REFUSED/u,
    );
  });
}

test('artifact rejects future captured clock facts and unsuccessful selected runs', () => {
  assert.throws(
    () => projectBaselineArtifact(artifact(), run(), 'all', Date.parse('2026-10-10T10:01:00Z')),
    /chronology/u,
  );
  for (const clock of [NaN, -1, 0.5, Infinity]) {
    assert.throws(
      () => projectBaselineArtifact(artifact(), run(), 'all', clock),
      /BASELINE_IDENTITY_REFUSED/u,
    );
  }
  assert.throws(
    () => projectBaselineArtifact(artifact(), run({ conclusion: 'failure' }), 'all', now),
    /successful/u,
  );
  assert.throws(
    () => projectBaselineArtifact(artifact(), run(), 'other', now),
    /BASELINE_IDENTITY_REFUSED/u,
  );
});

test('artifact nested identities refuse proxies and accessors without executing them', () => {
  let accessed = 0;
  const trap = () => {
    accessed += 1;
    throw new Error('untrusted artifact property');
  };
  const nested = artifact();
  Object.defineProperty(nested.workflow_run, 'head_sha', { get: trap });
  const root = artifact();
  Object.defineProperty(root, 'digest', { get: trap });
  for (const value of [
    nested,
    root,
    artifact({ workflow_run: new Proxy(artifact().workflow_run, { get: trap }) }),
  ]) {
    assert.throws(
      () => projectBaselineArtifact(value, run(), 'all', now),
      /BASELINE_IDENTITY_REFUSED/u,
    );
  }
  assert.equal(accessed, 0);
});

function streamed(
  chunks,
  { status = 200, headers = { 'content-type': 'application/json' }, keepOpen = false } = {},
) {
  const state = { cancelled: 0, pulled: 0 };
  const stream = new ReadableStream({
    pull(controller) {
      const value = typeof chunks === 'function' ? chunks(state.pulled++) : chunks[state.pulled++];
      if (value !== undefined) controller.enqueue(value);
      else if (!keepOpen) controller.close();
    },
    cancel() {
      state.cancelled += 1;
    },
  });
  return { response: new Response(stream, { status, headers }), state };
}
function client(responder) {
  const calls = [];
  const transport = createGithubBaselineTransport(TOKEN, async (url, options) => {
    calls.push({ url, options });
    return responder(url, options, calls.length);
  });
  return { transport, calls };
}
function jsonResponse(text = '{"ok":true}', options) {
  return streamed([new TextEncoder().encode(text)], options);
}
function safeMessage(error) {
  assert.doesNotMatch(
    String(error),
    /inspector-external-test-token|private-test-signature|Bearer|sig=/u,
  );
  assert.equal(error.cause, undefined);
  return /BASELINE_(?:TRANSPORT|JSON)_REFUSED/u.test(error.message);
}

test('transport uses only exact canonical GET endpoints and bounded page identities', async () => {
  const owned = client(() => jsonResponse().response);
  const requests = [
    [() => owned.transport.workflow(), 'workflows/266480675'],
    [() => owned.transport.run(123), 'runs/123'],
    [() => owned.transport.attempt(123, 2), 'runs/123/attempts/2'],
    [
      () => owned.transport.runs(1),
      'workflows/266480675/runs?branch=main&exclude_pull_requests=true&per_page=100&page=1',
    ],
    [() => owned.transport.artifacts(123, 100), 'runs/123/artifacts?per_page=100&page=100'],
    [() => owned.transport.artifact(456), 'artifacts/456'],
  ];
  for (const [execute, path] of requests) {
    const result = await execute();
    assert.equal(result.endpoint, `https://api.github.com/repos/stynx-nyx/stynx/actions/${path}`);
    assert.equal(result.status, 200);
    assert.equal(result.value.ok, true);
    assert.equal(result.sha256, hash(result.bytes));
  }
  for (const { url, options } of owned.calls) {
    assert.equal(new URL(url).hostname, 'api.github.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.equal(options.signal.aborted, false);
  }
  const before = owned.calls.length;
  for (const value of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => owned.transport.run(value), /BASELINE_TRANSPORT_REFUSED/u);
    assert.throws(() => owned.transport.artifact(value), /BASELINE_TRANSPORT_REFUSED/u);
    assert.throws(() => owned.transport.attempt(1, value), /BASELINE_TRANSPORT_REFUSED/u);
  }
  for (const value of [0, 101, 1.5, '1', NaN]) {
    assert.throws(() => owned.transport.runs(value), /BASELINE_TRANSPORT_REFUSED/u);
    assert.throws(() => owned.transport.artifacts(1, value), /BASELINE_TRANSPORT_REFUSED/u);
  }
  assert.equal(owned.calls.length, before);
});

test('download cancels API redirect then uses a fresh credential-free signed HTTPS request', async () => {
  const redirect = streamed([new Uint8Array([1])], {
    status: 302,
    headers: { location: signedUrl },
    keepOpen: true,
  });
  const body = Buffer.from('downloaded archive bytes');
  const delivery = streamed([new Uint8Array(body)], {
    headers: { 'content-length': String(body.length) },
  });
  const owned = client((_url, _options, count) =>
    count === 1 ? redirect.response : delivery.response,
  );
  const result = await owned.transport.download(301);
  assert.equal(
    owned.calls[0].url,
    'https://api.github.com/repos/stynx-nyx/stynx/actions/artifacts/301/zip',
  );
  assert.equal(owned.calls[0].options.signal.aborted, true);
  assert.equal(redirect.state.cancelled, 1);
  assert.equal(owned.calls[1].url, signedUrl);
  assert.deepEqual(owned.calls[1].options.headers, { 'Accept-Encoding': 'identity' });
  assert.equal(owned.calls[1].options.credentials, 'omit');
  assert.equal(owned.calls[1].options.referrerPolicy, 'no-referrer');
  assert.equal(owned.calls[1].options.redirect, 'manual');
  assert.notEqual(owned.calls[1].options.signal, owned.calls[0].options.signal);
  assert.equal(owned.calls[1].options.signal.aborted, false);
  assert.deepEqual(result.bytes, body);
  assert.equal(result.sha256, hash(body));
  assert.equal(result.originVerified, false);
  assert.equal(result.signedHost, 'fixture.blob.core.windows.net');
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-test-signature|inspector-external-test-token/u,
  );
});

for (const location of [
  'http://fixture.blob.core.windows.net/a',
  'https://fixture.blob.core.windows.net:444/a',
  'https://user:password@fixture.blob.core.windows.net/a',
  'https://fixture.blob.core.windows.net/a#fragment',
  'https://blob.core.windows.net.evil.test/a',
  'https://evil.test/a',
  'https://blob.core.windows.net/a',
  'file:///private/artifact.zip',
  '/relative',
  'not a URL',
]) {
  test(`download refuses unsafe redirect ${location}`, async () => {
    const supplied = streamed([new Uint8Array([1])], {
      status: 302,
      headers: { location },
      keepOpen: true,
    });
    const owned = client(() => supplied.response);
    await assert.rejects(owned.transport.download(301), safeMessage);
    assert.equal(owned.calls.length, 1);
    assert.equal(owned.calls[0].options.signal.aborted, true);
    assert.equal(supplied.state.cancelled, 1);
  });
}

test('transport status, media type, encoding and declared length refusals abort and cancel active bodies', async () => {
  for (const options of [
    { status: 401 },
    { status: 403 },
    { status: 410 },
    { status: 429 },
    { status: 302 },
    { headers: {} },
    { headers: { 'content-type': 'text/html' } },
    { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } },
    { headers: { 'content-type': 'application/json', 'content-length': '999999999' } },
    { headers: { 'content-type': 'application/json', 'content-length': '01' } },
  ]) {
    const supplied = jsonResponse('{}', { ...options, keepOpen: true });
    const owned = client(() => supplied.response);
    await assert.rejects(owned.transport.workflow(), safeMessage);
    assert.equal(owned.calls[0].options.signal.aborted, true);
    assert.equal(supplied.state.cancelled, 1);
  }
});

test('second redirect and delivery errors never follow another location or disclose its signature', async () => {
  for (const status of [302, 401, 410, 429, 500]) {
    const api = streamed([], { status: 302, headers: { location: signedUrl }, keepOpen: true });
    const second = streamed([new Uint8Array([1])], {
      status,
      headers: { location: signedUrl + '-second' },
      keepOpen: true,
    });
    const owned = client((_url, _options, count) => (count === 1 ? api.response : second.response));
    await assert.rejects(owned.transport.download(301), safeMessage);
    assert.equal(owned.calls.length, 2);
    assert.equal(
      owned.calls.every(({ options }) => options.signal.aborted),
      true,
    );
    assert.equal(second.state.cancelled, 1);
  }
});

test('fetch failures abort their request and discard token/signed URL error causes', async () => {
  const owned = client(() => {
    throw new Error(`${TOKEN} ${signedUrl}`);
  });
  await assert.rejects(owned.transport.workflow(), safeMessage);
  assert.equal(owned.calls[0].options.signal.aborted, true);
  for (const token of ['', ' padded ', 'line\r\nheader', 'x'.repeat(4097), null]) {
    assert.throws(
      () => createGithubBaselineTransport(token, () => {}),
      /BASELINE_TRANSPORT_REFUSED/u,
    );
  }
});

test('stream limits reject empty, invalid, overflowing and excessive tiny chunks with cancellation', async () => {
  let traps = 0;
  const proxy = new Proxy(new Uint8Array([1]), {
    get() {
      traps += 1;
      throw new Error('chunk accessor');
    },
  });
  for (const chunks of [
    [new Uint8Array(0)],
    ['not bytes'],
    [proxy],
    [new Uint8Array(4 * 1024 * 1024 + 1)],
    (index) => (index < 65_537 ? new Uint8Array([32]) : undefined),
  ]) {
    const supplied = streamed(chunks, { keepOpen: true });
    const owned = client(() => supplied.response);
    await assert.rejects(owned.transport.workflow(), safeMessage);
    assert.equal(owned.calls[0].options.signal.aborted, true);
    assert.equal(supplied.state.cancelled, 1);
  }
  assert.equal(traps, 0);
  const bounded = streamed((index) =>
    index < 65_536 ? new Uint8Array([index === 0 ? 123 : index === 1 ? 125 : 32]) : undefined,
  );
  assert.deepEqual(
    Object.keys((await client(() => bounded.response).transport.workflow()).value),
    [],
  );
});

test('native streamed chunks ignore caller accessors and copied results remain detached', async () => {
  const chunk = new Uint8Array([123, 125]);
  let calls = 0;
  for (const name of ['length', 'buffer', Symbol.iterator]) {
    Object.defineProperty(chunk, name, {
      get() {
        calls += 1;
        throw new Error('chunk accessor');
      },
    });
  }
  const supplied = streamed([chunk]);
  const owned = client(() => supplied.response);
  const result = await owned.transport.workflow();
  assert.equal(calls, 0);
  chunk[0] = 0;
  assert.equal(result.bytes.toString(), '{}');
  assert.equal(Object.isFrozen(result), true);
  result.bytes[0] = 1;
  assert.notEqual(hash(result.bytes), result.sha256);
});

test('truncated declared bodies abort and malformed JSON/UTF-8 cannot bypass cleanup', async () => {
  const truncated = jsonResponse('{}', {
    headers: { 'content-type': 'application/json', 'content-length': '3' },
  });
  const short = client(() => truncated.response);
  await assert.rejects(short.transport.workflow(), safeMessage);
  assert.equal(short.calls[0].options.signal.aborted, true);
  for (const body of [
    Buffer.from('{"a":1,"a":2}'),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from('{}{}'),
  ]) {
    const supplied = streamed([new Uint8Array(body)]);
    const owned = client(() => supplied.response);
    await assert.rejects(owned.transport.workflow(), safeMessage);
    assert.equal(
      owned.calls[0].options.signal.aborted,
      true,
      'a refused JSON request must release its controller',
    );
  }
});

test('download accepts the other approved delivery domain but refuses missing redirects and archive overflow', async () => {
  const redirectUrl = 'https://objects.githubusercontent.com:443/archive?signature=external';
  const redirect = streamed([], {
    status: 302,
    headers: { location: redirectUrl },
    keepOpen: true,
  });
  const delivery = streamed([new Uint8Array([1, 2, 3])]);
  const accepted = client((_url, _options, count) =>
    count === 1 ? redirect.response : delivery.response,
  );
  assert.equal((await accepted.transport.download(1)).signedHost, 'objects.githubusercontent.com');
  assert.equal(accepted.calls[1].url, redirectUrl.replace(':443', ''));
  for (const headers of [{}, { location: signedUrl }]) {
    const api = streamed([], { status: 302, headers, keepOpen: true });
    const oversized = streamed([], {
      headers: { 'content-length': String(32 * 1024 * 1024 + 1) },
      keepOpen: true,
    });
    const refused = client((_url, _options, count) =>
      count === 1 ? api.response : oversized.response,
    );
    await assert.rejects(refused.transport.download(1), safeMessage);
    assert.equal(
      refused.calls.every(({ options }) => options.signal.aborted),
      true,
    );
    assert.equal(api.state.cancelled, 1);
    if (refused.calls.length === 2) assert.equal(oversized.state.cancelled, 1);
  }
});

test('delivery fetch and reader failures abort without disclosing external error contents', async () => {
  const redirect = streamed([], { status: 302, headers: { location: signedUrl }, keepOpen: true });
  const failedFetch = client((_url, _options, count) => {
    if (count === 1) return redirect.response;
    throw new Error(`${TOKEN} ${signedUrl}`);
  });
  await assert.rejects(failedFetch.transport.download(1), safeMessage);
  assert.equal(failedFetch.calls.length, 2);
  assert.equal(
    failedFetch.calls.every(({ options }) => options.signal.aborted),
    true,
  );
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.error(new Error(`${TOKEN} ${signedUrl}`));
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
  const failedRead = client(() => response);
  await assert.rejects(failedRead.transport.workflow(), safeMessage);
  assert.equal(failedRead.calls[0].options.signal.aborted, true);
});
