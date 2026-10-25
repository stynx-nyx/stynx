import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import {
  createReferenceLoopbackProtocol,
  createReferenceRuntimeProtocol,
  encodeOwnedReferenceLifecycleFrames,
  openReferenceLifecycleChannel,
  assertReferenceLifecycleChannel,
  emitReferenceLifecyclePhase,
  finishReferenceLifecycleChannel,
} from '../../scripts/lib/http-reference-loopback-protocol.mjs';
import {
  serializeHttpRuntimePlainJson,
  createHttpModuleSnapshotValidator,
  createHttpRuntimeProtocol,
} from '../../scripts/lib/http-runtime-protocol.mjs';
import { observeOwnedReferenceLoopback } from '../../scripts/lib/http-reference-lifecycle.mjs';
import {
  closeOwnedReferenceNetworkScope,
  installOwnedReferenceNetworkScope,
} from '../../scripts/lib/http-reference-network.mjs';
import { createProtocolFixture, moduleFacts } from './support/http-runtime-protocol-fixture.mjs';

// Parser/refusal tests consume production encoders and validators. Copied module
// facts below never stand for a live compiler, IPC worker, factory or custody.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx lifecycle wire espaço 日本語 ')));
after(() => rmSync(root, { recursive: true, force: true }));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const invalid = { code: 'HTTP_REFERENCE_LOOPBACK_PROTOCOL_INVALID' };
const mode = 'reference-owned-loopback';
const phases = [
  {
    phase: 'factory',
    actualFactoryInvoked: true,
    actualAdapterCount: 1,
    appRetainedBeforeFactoryReturn: true,
  },
  { phase: 'init', layerCount: 1, controllerCount: 1, routeCount: 1 },
  { phase: 'listen', host: '127.0.0.1', port: 12345 },
  {
    phase: 'healthz',
    path: '/healthz',
    status: 200,
    byteLength: 2,
    bodySha256: hash('{}'),
    headersSha256: hash('headers'),
    securityHeadersObserved: true,
    principalInjected: false,
  },
  {
    phase: 'profile',
    path: '/profile',
    status: 401,
    byteLength: 2,
    bodySha256: hash('{}'),
    headersSha256: hash('headers'),
    securityHeadersObserved: true,
    principalInjected: false,
  },
  { phase: 'close', actualAppCloseResolved: true, ownedSocketCloseEventsComplete: true },
  {
    phase: 'final',
    descriptorsRestored: true,
    registrySha256: hash('registry'),
    middlewareSha256: hash('middleware'),
    networkSha256: hash('network'),
  },
];
function component() {
  const job = {
    mode,
    compositionId: 'reference',
    candidateCommit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    nonce: randomUUID(),
    referenceFixture: { parserOnly: true },
    controls: { parserOnly: true },
  };
  const observation = {
    scope: mode,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
    phases: structuredClone(phases),
  };
  return { job, observation, ...encodeOwnedReferenceLifecycleFrames(job, observation) };
}
const copied = createProtocolFixture(repository, join(root, 'copied parser facts'));
for (const relative of [
  'scripts/lib/http-reference-loopback-protocol.mjs',
  'scripts/lib/http-reference-network.mjs',
  'scripts/lib/http-reference-registry.mjs',
  'scripts/lib/http-reference-lifecycle.mjs',
  'scripts/lib/http-reference-nest-guard.mjs',
  'scripts/lib/http-runtime-protocol.mjs',
]) {
  const bytes = readFileSync(join(repository, relative));
  const file = join(copied.template.cwd, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  const url = pathToFileURL(file).href;
  copied.template.roster.push({
    url,
    sha256: hash(bytes),
    byteLength: bytes.length,
    moduleKind: 'module',
  });
}
function full() {
  const moduleContext = copied.context();
  moduleContext.mode = mode;
  const callerPath = 'scripts/lib/http-reference-nest-guard.mjs';
  const file = join(moduleContext.bindings.cwd, callerPath);
  const bytes = readFileSync(file),
    stat = lstatSync(file);
  const literal = "createRequire(new URL('../../packages/flow/package.json', import.meta.url))";
  const text = bytes.toString();
  assert.equal(text.split(literal).length, 2);
  const start = text.indexOf(literal);
  moduleContext.bindings.resolutionAnchors.push({
    classification: 'NON_EVALUATED_RESOLUTION_ANCHOR',
    candidateCommit: moduleContext.candidateCommit,
    tree: moduleContext.bindings.tree,
    nonce: moduleContext.nonce,
    manifest: structuredClone(moduleContext.bindings.resolutionAnchors[1].manifest),
    caller: {
      path: callerPath,
      url: pathToFileURL(file).href,
      sha256: hash(bytes),
      byteLength: bytes.length,
      permissions: stat.mode & 0o7777,
      device: stat.dev,
      inode: stat.ino,
      mode: '100644',
      blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      callsite: { kind: 'DECLARED_REVIEWED_CALLSITE', start, end: start + literal.length, literal },
    },
    requests: [
      '@nestjs/core/nest-factory',
      '@nestjs/core/nest-application',
      '@nestjs/platform-express/adapters/express-adapter',
      '@nestjs/core/package.json',
      '@nestjs/platform-express/package.json',
    ],
    conditions: ['require', 'node', 'node-addons', 'module-sync'],
  });
  const value = component();
  value.context.nonce = moduleContext.nonce;
  value.context.moduleContext = moduleContext;
  value.context.observationArtifactPath = join(root, 'diagnostic-only.json');
  for (const frame of value.frames) frame.nonce = moduleContext.nonce;
  value.frames[0].body.componentOnly = false;
  value.frames[8].body = {
    phaseCount: 7,
    phaseSha256: hash(serializeHttpRuntimePlainJson(value.observation.phases)),
    observationArtifact: {
      path: value.context.observationArtifactPath,
      sha256: hash('diagnostic bytes not independently read here'),
      byteLength: 1,
      permissions: 0o600,
    },
    modules: moduleFacts(moduleContext),
    trustedBootstrap: structuredClone(moduleContext.bindings.trustedBootstrap),
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
    parentCorroborationRequired: true,
  };
  for (const row of moduleContext.bindings.roster.filter((entry) =>
    /http-reference-(loopback-protocol|network|registry|lifecycle|nest-guard)\.mjs$|http-runtime-protocol\.mjs$/u.test(
      entry.url,
    ),
  )) {
    value.frames[8].body.modules.evaluations.push({
      sequence: value.frames[8].body.modules.evaluations.length + 1,
      url: row.url,
      canonicalURL: row.url,
      sha256: row.sha256,
      byteLength: row.byteLength,
      observedFormat: row.moduleKind,
      moduleKind: row.moduleKind,
    });
  }
  return value;
}

test('actual component encoder binds candidate, input hashes and ordered phases without qualifying custody', () => {
  const { context, frames, job, observation } = component();
  assert.equal(frames.length, 9);
  assert.equal(context.fixtureSha256, hash(serializeHttpRuntimePlainJson(job.referenceFixture)));
  assert.equal(frames[8].body.resultSha256, hash(serializeHttpRuntimePlainJson(observation)));
  const protocol = createReferenceLoopbackProtocol(context);
  for (const frame of frames) assert.equal(protocol.accept(frame), true);
  const result = protocol.finish({
    code: 0,
    signal: null,
    workerPid: process.pid,
    parentCleanupVerified: true,
  });
  assert.equal(result.componentWireComplete, true);
  assert.equal(result.runtimeCustodyComplete, false);
  assert.equal(result.readinessPromoting, false);
});

test('full disjoint wire accepts bounded parser facts but retains parent and actual custody obligations', () => {
  const { context, frames } = full();
  const protocol = createReferenceRuntimeProtocol(context);
  for (const frame of frames) assert.equal(protocol.receive(frame), true);
  const result = protocol.finish({ code: 0, signal: null });
  assert.equal(result.parentCorroborationRequired, true);
  assert.equal(result.complete, false);
  assert.equal(result.runtimeCustodyComplete, false);
  assert.equal(result.performanceQualified, false);
  assert.equal(result.readinessPromoting, false);
  const capture = protocol.captureArtifact();
  assert.equal(capture.finished, true);
  assert.equal(capture.captureComplete, true);
  assert.equal(capture.refused, false);
  assert.deepEqual(capture.frames, frames);
});

// Actual public resolution results are parser inputs here; no load-hook or
// lexical execution completion is inferred from a successful require.resolve.
function fullResolutionFacts() {
  const value = full();
  const context = value.context.moduleContext;
  const modules = value.frames[8].body.modules;
  const anchor = context.bindings.resolutionAnchors[2];
  // Require-condition facts remain an explicit CJS fixture, independent of the
  // ESM host; changing the resolver would change what these parser rows mean.
  const resolved = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        "const { createRequire } = require('node:module'); const resolve = createRequire(new URL(process.argv[1])).resolve; process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(specifier => resolve(specifier))));",
        new URL('../../packages/flow/package.json', import.meta.url).href,
        JSON.stringify(anchor.requests),
      ],
      { encoding: 'utf8' },
    ),
  );
  let sequence = Math.max(...modules.evaluations.map((row) => row.sequence));
  for (const [index, specifier] of anchor.requests.entries()) {
    const file = realpathSync(resolved[index]);
    const bytes = readFileSync(file),
      url = pathToFileURL(file).href;
    if (!context.bindings.roster.some((row) => row.url === url))
      context.bindings.roster.push({
        url,
        sha256: hash(bytes),
        byteLength: bytes.length,
        moduleKind: file.endsWith('.json') ? 'json' : 'commonjs',
      });
    modules.resolutions.push({
      sequence: ++sequence,
      specifier,
      parentURL: anchor.manifest.url,
      conditions: [...anchor.conditions],
      url,
      builtin: false,
      canonicalURL: url,
    });
  }
  return { context, modules };
}

test('full-mode parser admits all five public resolver results through the reviewed guard relation', () => {
  const { context, modules } = fullResolutionFacts();
  assert.equal(context.bindings.resolutionAnchors.length, 3);
  assert.deepEqual(
    context.bindings.resolutionAnchors[1].manifest,
    context.bindings.resolutionAnchors[2].manifest,
  );
  assert.equal(modules.resolutions.length, 5);
  assert.equal(createHttpModuleSnapshotValidator(context).accepts(modules), true);
  assert.equal(
    modules.evaluations.some(
      (row) => row.canonicalURL === context.bindings.resolutionAnchors[2].manifest.url,
    ),
    false,
  );
  assert.equal(modules.complete, false);
  assert.equal(modules.readinessPromoting, false);
});

for (const kind of [
  'unlisted-request',
  'conditions',
  'missing-caller',
  'late-caller',
  'caller-bytes',
  'manifest-evaluation',
]) {
  test(`full-mode shared module parser refuses guard resolution ${kind}`, () => {
    const { context, modules } = fullResolutionFacts();
    const caller = context.bindings.resolutionAnchors[2].caller;
    const row = modules.evaluations.find((entry) => entry.canonicalURL === caller.url);
    if (kind === 'unlisted-request') modules.resolutions[0].specifier = '@nestjs/core/unreviewed';
    if (kind === 'conditions') modules.resolutions[0].conditions.push('unreviewed');
    if (kind === 'missing-caller')
      modules.evaluations = modules.evaluations.filter((entry) => entry !== row);
    if (kind === 'late-caller') modules.resolutions[0].sequence = row.sequence - 1;
    if (kind === 'caller-bytes') row.sha256 = hash('different caller bytes');
    if (kind === 'manifest-evaluation')
      modules.evaluations.push({
        sequence: 1000,
        url: context.bindings.resolutionAnchors[2].manifest.url,
        canonicalURL: context.bindings.resolutionAnchors[2].manifest.url,
        sha256: context.bindings.resolutionAnchors[2].manifest.sha256,
        byteLength: context.bindings.resolutionAnchors[2].manifest.byteLength,
        observedFormat: 'json',
        moduleKind: 'json',
      });
    assert.equal(createHttpModuleSnapshotValidator(context).accepts(modules), false);
  });
}

for (const kind of [
  'missing-mode',
  'wrong-mode',
  'wrong-manifest',
  'wrong-caller',
  'duplicate-relation',
]) {
  test(`full-mode shared module context refuses ${kind}`, () => {
    const { context } = fullResolutionFacts();
    if (kind === 'missing-mode') delete context.mode;
    if (kind === 'wrong-mode') context.mode = 'bootstrap-module-only';
    if (kind === 'wrong-manifest')
      context.bindings.resolutionAnchors[2].manifest.path = 'reference/api/package.json';
    if (kind === 'wrong-caller')
      context.bindings.resolutionAnchors[2].caller.path = 'scripts/lib/http-runtime-census.mjs';
    if (kind === 'duplicate-relation')
      context.bindings.resolutionAnchors.push(
        structuredClone(context.bindings.resolutionAnchors[2]),
      );
    assert.throws(() => createHttpModuleSnapshotValidator(context), {
      code: 'HTTP_RUNTIME_PROTOCOL_INVALID',
    });
  });
}

test('bootstrap parser retains exactly two reviewed resolver relations', () => {
  const { context } = fullResolutionFacts();
  context.mode = 'bootstrap-module-only';
  assert.throws(() => createHttpRuntimeProtocol(context), {
    code: 'HTTP_RUNTIME_PROTOCOL_INVALID',
  });
  context.bindings.resolutionAnchors.pop();
  assert.doesNotThrow(() => createHttpRuntimeProtocol(context));
});

const mutations = {
  'cross-candidate': (frames) => {
    frames[0].candidateCommit = 'c'.repeat(40);
  },
  'cross-tree': (frames) => {
    frames[1].tree = 'c'.repeat(40);
  },
  'cross-nonce': (frames) => {
    frames[1].nonce = randomUUID();
  },
  'cross-worker': (frames) => {
    frames[1].workerPid++;
  },
  'fixture-digest': (frames) => {
    frames[0].body.fixtureSha256 = hash('other');
  },
  'control-digest': (frames) => {
    frames[0].body.controlClosureSha256 = hash('other');
  },
  'component-only': (frames) => {
    frames[0].body.componentOnly = true;
  },
  'no-parent-corroboration': (frames) => {
    frames[0].body.parentCorroborationRequired = false;
  },
  'phase-reorder': (frames) => {
    [frames[2].body, frames[3].body] = [frames[3].body, frames[2].body];
  },
  'sequence-gap': (frames) => {
    frames[2].sequence++;
  },
  'non-loopback': (frames) => {
    frames[3].body.host = '0.0.0.0';
  },
  'principal-injection': (frames) => {
    frames[5].body.principalInjected = true;
  },
  'security-headers': (frames) => {
    frames[4].body.securityHeadersObserved = false;
  },
  'unfinished-close': (frames) => {
    frames[6].body.actualAppCloseResolved = false;
  },
  'unclosed-socket': (frames) => {
    frames[6].body.ownedSocketCloseEventsComplete = false;
  },
  'unrestored-descriptors': (frames) => {
    frames[7].body.descriptorsRestored = false;
  },
  'phase-digest': (frames) => {
    frames[8].body.phaseSha256 = hash('other');
  },
  'artifact-path': (frames) => {
    frames[8].body.observationArtifact.path += '.other';
  },
  'artifact-permissions': (frames) => {
    frames[8].body.observationArtifact.permissions = 0o644;
  },
  'artifact-empty': (frames) => {
    frames[8].body.observationArtifact.byteLength = 0;
  },
  'module-digest': (frames) => {
    frames[8].body.modules.evaluations[0].sha256 = hash('other');
  },
  'missing-factory-evaluation': (frames) => {
    frames[8].body.modules.evaluations.pop();
  },
  'trusted-control-substitution': (frames) => {
    frames[8].body.trustedBootstrap[0].sha256 = hash('other');
  },
  'complete-claim': (frames) => {
    frames[8].body.complete = true;
  },
  'custody-claim': (frames) => {
    frames[8].body.runtimeCustodyComplete = true;
  },
  'performance-claim': (frames) => {
    frames[8].body.performanceQualified = true;
  },
  'readiness-claim': (frames) => {
    frames[8].body.readinessPromoting = true;
  },
  'extra-terminal-key': (frames) => {
    frames[8].body.unreviewed = true;
  },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`full wire preserves and irrevocably refuses ${name}`, () => {
    const { context, frames } = full();
    mutate(frames);
    const protocol = createReferenceRuntimeProtocol(context);
    const admitted = frames.map((frame) => protocol.receive(frame));
    assert.equal(admitted.includes(false), true);
    assert.throws(() => protocol.finish({ code: 0, signal: null }), invalid);
    const capture = protocol.captureArtifact();
    assert.equal(capture.refused, true);
    assert.equal(capture.finished, false);
    assert.equal(capture.readinessPromoting, false);
    assert.deepEqual(capture.frames, frames);
    assert.equal(protocol.receive(frames[0]), false);
  });
}

for (const exit of [
  { code: 1, signal: null },
  { code: 0, signal: 'SIGTERM' },
  { code: 0, signal: null, extra: true },
]) {
  test(`full wire refuses non-exact successful exit ${JSON.stringify(exit)}`, () => {
    const { context, frames } = full();
    const protocol = createReferenceRuntimeProtocol(context);
    for (const frame of frames) assert.equal(protocol.receive(frame), true);
    assert.throws(() => protocol.finish(exit), invalid);
    assert.equal(protocol.captureArtifact().refused, true);
  });
}

test('full wire refuses premature exit, duplicate terminal and post-finish replay', () => {
  for (const kind of ['premature', 'duplicate', 'finished']) {
    const { context, frames } = full();
    const protocol = createReferenceRuntimeProtocol(context);
    for (const frame of frames.slice(0, kind === 'premature' ? 8 : 9))
      assert.equal(protocol.receive(frame), true);
    if (kind === 'premature')
      assert.throws(() => protocol.finish({ code: 0, signal: null }), invalid);
    if (kind === 'finished') protocol.finish({ code: 0, signal: null });
    assert.equal(protocol.receive(frames[8]), false);
    assert.throws(() => protocol.finish({ code: 0, signal: null }), invalid);
    assert.equal(protocol.captureArtifact().refused, true);
  }
});

test('full wire rejects an accessor without invoking it and declares capture incomplete', () => {
  const { context, frames } = full();
  let reads = 0;
  Object.defineProperty(frames[0], 'body', {
    enumerable: true,
    get() {
      reads++;
      return {};
    },
  });
  const protocol = createReferenceRuntimeProtocol(context);
  assert.equal(protocol.receive(frames[0]), false);
  assert.equal(reads, 0);
  const capture = protocol.captureArtifact();
  assert.equal(capture.refused, true);
  assert.equal(capture.captureComplete, false);
  assert.equal(capture.frames.length, 0);
});

test('component context and full context remain disjoint; missing control roster refuses before frames', () => {
  const { context } = component();
  assert.throws(() => createReferenceRuntimeProtocol(context), invalid);
  const value = full();
  assert.throws(() => createReferenceLoopbackProtocol(value.context), invalid);
  value.context.moduleContext.bindings.roster = value.context.moduleContext.bindings.roster.filter(
    (row) => !row.url.endsWith('/http-reference-lifecycle.mjs'),
  );
  assert.throws(() => createReferenceRuntimeProtocol(value.context), invalid);
});

test('live channel requires actual IPC and opaque handles; serialized wire grants no factory authority', async () => {
  const { job } = component();
  assert.equal(typeof process.send, 'undefined');
  await assert.rejects(openReferenceLifecycleChannel(job), invalid);
  assert.throws(() => assertReferenceLifecycleChannel({}, job), invalid);
  await assert.rejects(emitReferenceLifecyclePhase({}, phases[0]), invalid);
  await assert.rejects(finishReferenceLifecycleChannel({}, {}), invalid);
});

test('public lifecycle refuses invalid job, environment, forged network and forged IPC before any factory', async () => {
  await assert.rejects(observeOwnedReferenceLoopback({}, {}, {}, {}), {
    code: 'HTTP_REFERENCE_LIFECYCLE_JOB',
  });
  const { job } = component();
  job.referenceRegistry = { candidateCommit: job.candidateCommit, tree: job.tree };
  job.referenceFixture = {
    identity: { candidateCommit: job.candidateCommit, tree: job.tree, nonce: job.nonce },
    environment: { STYNX_INSPECTOR_ABSENT_ENVIRONMENT: hash('must be absent') },
  };
  assert.equal(process.env.STYNX_INSPECTOR_ABSENT_ENVIRONMENT, undefined);
  await assert.rejects(observeOwnedReferenceLoopback(job, {}, {}, {}), {
    code: 'HTTP_REFERENCE_LIFECYCLE_FIXTURE_ENVIRONMENT',
  });
  job.referenceFixture.environment = {};
  await assert.rejects(observeOwnedReferenceLoopback(job, {}, {}, {}), /Unknown or closed/u);
  const handle = installOwnedReferenceNetworkScope({ postgresPort: 1, redisPort: 2 });
  try {
    await assert.rejects(observeOwnedReferenceLoopback(job, handle, {}, {}), invalid);
  } finally {
    const closed = closeOwnedReferenceNetworkScope(handle);
    assert.deepEqual(closed, {
      closed: true,
      parentCorroborationRequired: true,
      readinessPromoting: false,
    });
  }
});

for (const kind of ['oversized-frame', 'frame-count']) {
  test(`full wire capture fails closed at ${kind} bound`, () => {
    const { context, frames } = full();
    const protocol = createReferenceRuntimeProtocol(context);
    if (kind === 'oversized-frame') {
      const oversized = structuredClone(frames[0]);
      oversized.body.unadmitted = 'x'.repeat(32 * 1024 * 1024);
      assert.equal(protocol.receive(oversized), false);
    } else {
      for (let i = 0; i < 1025; i++) protocol.receive(frames[0]);
    }
    const capture = protocol.captureArtifact();
    assert.equal(capture.refused, true);
    assert.equal(capture.captureComplete, false);
    assert.equal(capture.readinessPromoting, false);
    assert.equal(capture.frames.length, kind === 'oversized-frame' ? 0 : 1024);
    assert.equal(capture.observedFrames, kind === 'oversized-frame' ? 1 : 1025);
    assert.throws(() => protocol.finish({ code: 0, signal: null }), invalid);
  });
}

for (const key of ['candidateCommit', 'nonce', 'pid']) {
  test(`full wire refuses module context ${key} from another worker before frame receipt`, () => {
    const { context } = full();
    context.moduleContext[key] =
      key === 'pid' ? process.pid + 1 : key === 'nonce' ? randomUUID() : 'c'.repeat(40);
    assert.throws(() => createReferenceRuntimeProtocol(context), invalid);
  });
}

for (const kind of ['success', 'phase-order', 'binding', 'send-drift', 'reentrant']) {
  test(`actual owned IPC child ${kind} preserves chronological sends and exits without resources`, async (t) => {
    const { job } = component();
    const messages = [];
    let stderr = '',
      stdout = '',
      closed = false;
    const child = fork(
      join(repository, 'test/scripts/support/http-reference-channel-child.mjs'),
      [],
      {
        cwd: root,
        execPath: process.execPath,
        execArgv: [],
        env: {
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        serialization: 'json',
      },
    );
    assert(Number.isSafeInteger(child.pid));
    const exited = new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        closed = true;
        accept({ code, signal });
      });
    });
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    child.on('message', (message) => messages.push(message));
    let timer;
    try {
      await new Promise((accept, reject) =>
        child.send({ kind, job, phases }, (error) => (error ? reject(error) : accept())),
      );
      const exit = await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Owned IPC child exceeded finite deadline')),
            5000,
          );
        }),
      ]);
      assert.deepEqual(exit, { code: 0, signal: null }, stderr);
      assert.equal(stdout, '');
      assert.equal(stderr, '');
      assert.equal(closed, true);
      assert.equal(child.connected, false);
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
      const result = messages.at(-1);
      assert.equal(result.inspectorResult, 'PASS');
      assert.equal(result.pid, child.pid);
      assert.equal(result.actualFactoryInvoked, false);
      assert.equal(result.runtimeCustodyComplete, false);
      assert.equal(result.readinessPromoting, false);
      const frames = messages.slice(0, -1);
      assert.equal(frames.length, kind === 'success' ? 9 : kind === 'reentrant' ? 2 : 1);
      for (const [index, frame] of frames.entries()) {
        assert.equal(frame.sequence, index + 1);
        assert.equal(frame.workerPid, child.pid);
        assert.equal(frame.candidateCommit, job.candidateCommit);
        assert.equal(frame.tree, job.tree);
        assert.equal(frame.nonce, job.nonce);
      }
      assert.equal(frames[0].body.componentOnly, false);
      assert.equal(
        frames[0].body.fixtureSha256,
        hash(serializeHttpRuntimePlainJson(job.referenceFixture)),
      );
      assert.equal(
        frames[0].body.controlClosureSha256,
        hash(serializeHttpRuntimePlainJson(job.controls)),
      );
      if (kind === 'success') {
        assert.deepEqual(
          frames.slice(1, -1).map((frame) => frame.body),
          phases,
        );
        assert.equal(frames[8].body.phaseSha256, hash(serializeHttpRuntimePlainJson(phases)));
        assert.equal(frames[8].body.runtimeCustodyComplete, false);
        assert.equal(frames[8].body.readinessPromoting, false);
        // Channel transport does not admit this deliberately unqualified body.
        assert.deepEqual(frames[8].body.modules, { diagnosticOnly: true });
      }
      t.diagnostic(
        JSON.stringify({
          kind,
          actualPid: child.pid,
          closeObserved: closed,
          absence: 'ESRCH',
          frames: frames.length,
          actualFactoryInvoked: false,
          fixedWorkerCustody: false,
          readinessPromoting: false,
        }),
      );
    } finally {
      clearTimeout(timer);
      if (!closed) {
        child.kill('SIGKILL');
        await exited;
      }
      assert.equal(closed, true);
      assert.equal(child.connected, false);
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    }
  });
}

for (const constructorMode of ['reference-owned-loopback', 'http-endpoint-qualification']) {
  test(`${constructorMode} constructor detaches native JSON without invoking inherited serializers`, () => {
    const expected = full().context.moduleContext;
    expected.mode = constructorMode;
    expected.bindings.observation.sourceDeclaration.start = -0;
    const modules = moduleFacts(JSON.parse(serializeHttpRuntimePlainJson(expected)));
    const prototypes = [Object.prototype, Array.prototype];
    const descriptors = prototypes.map((prototype) =>
      Object.getOwnPropertyDescriptor(prototype, 'toJSON'),
    );
    let calls = 0;
    let validator;
    const sentinel = new Error('inherited constructor serializer');
    try {
      for (const prototype of prototypes)
        Object.defineProperty(prototype, 'toJSON', {
          configurable: true,
          get() {
            calls++;
            throw sentinel;
          },
        });
      validator = createHttpModuleSnapshotValidator(expected);
    } finally {
      for (const [index, prototype] of prototypes.entries()) {
        const descriptor = descriptors[index];
        if (descriptor) Object.defineProperty(prototype, 'toJSON', descriptor);
        else delete prototype.toJSON;
      }
    }
    assert.equal(calls, 0);
    expected.nonce = 'caller mutation';
    expected.bindings.observation.sourceDeclaration.start = 999999;
    assert.equal(validator.accepts(modules), true);
  });

  for (const anchor of [null, 7]) {
    test(`${constructorMode} preserves ${anchor === null ? 'null native manifest read' : 'primitive anchor admission'} refusal`, () => {
      const expected = full().context.moduleContext;
      expected.mode = constructorMode;
      expected.bindings.resolutionAnchors[1] = anchor;
      assert.throws(
        () => createHttpModuleSnapshotValidator(expected),
        anchor === null
          ? { name: 'TypeError', message: "Cannot read properties of null (reading 'manifest')" }
          : { code: 'HTTP_RUNTIME_PROTOCOL_INVALID' },
      );
    });
  }
}
