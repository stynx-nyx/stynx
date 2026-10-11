import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { createHttpRuntimeProtocol } from '../../scripts/lib/http-runtime-protocol.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx IPC component espaço 日本語 ')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceHash = hash(readFileSync(join(repository, 'scripts/lib/http-runtime-protocol.mjs')));
const frameLimit = 32 * 1024 * 1024;
const captureLimit = 64 * 1024 * 1024;
const results = [];
let ordinal = 0;
const context = () => ({
  nonce: randomUUID(),
  candidateCommit: 'a'.repeat(40),
  pid: process.pid,
  mode: 'bootstrap-module-only',
});
const frame = (expected, kind, result) => ({
  schemaVersion: 1,
  kind,
  nonce: expected.nonce,
  candidateCommit: expected.candidateCommit,
  pid: expected.pid,
  result,
});
const start = (expected) => frame(expected, 'start', { mode: expected.mode });
const terminal = (expected) =>
  frame(expected, 'terminal', {
    observation: {
      scope: expected.mode,
      factoryInvoked: false,
      actualNamedExportObserved: true,
    },
    modules: { complete: false, readinessPromoting: false, resolutions: [], evaluations: [] },
    trustedBootstrap: [],
    readinessPromoting: false,
    runtimeCustodyComplete: false,
  });
const cleanExit = { code: 0, signal: null };
const invalid = { code: 'HTTP_RUNTIME_PROTOCOL_INVALID' };

function save(name, value) {
  const path = join(root, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(value)}\n`);
  return path;
}

function requireRefusal(protocol) {
  assert.throws(() => protocol.finish(cleanExit), invalid);
  assert.equal(protocol.snapshot().refused, true);
}

async function componentCase(t, name, action) {
  await t.test(name, async () => {
    const expected = context();
    const protocol = createHttpRuntimeProtocol(expected);
    const id = `${++ordinal}-${name.replaceAll(/[^a-zA-Z0-9-]/gu, '-')}`;
    let outcome = 'PASS';
    try {
      await action(protocol, expected, id);
    } catch (error) {
      outcome = 'FAIL';
      throw error;
    } finally {
      const artifact = save(id, {
        scope: 'Protocol component only; caller context does not prove worker/process custody',
        outcome,
        sourceHash,
        snapshot: protocol.snapshot(),
      });
      results.push({ name, outcome, artifact });
    }
  });
}

after(() => {
  save('summary', {
    sourceHash,
    results,
    readinessPromoting: false,
    processCustodyQualified: false,
  });
});

test('protocol context is closed and detached from caller mutation', (t) => {
  t.diagnostic(`Protocol semantic captures (not Node wire bytes): ${root}`);
  const expected = context();
  const original = structuredClone(expected);
  const p = createHttpRuntimeProtocol(expected);
  expected.nonce = randomUUID();
  expected.pid += 1;
  assert.deepEqual(p.snapshot().expected, original);
  assert.equal(Object.isFrozen(p), true);
  for (const bad of [
    null,
    undefined,
    [],
    {},
    { ...original, extra: true },
    { ...original, candidateCommit: 'main' },
    { ...original, nonce: 'wrong' },
    { ...original, pid: '1' },
    { ...original, pid: 0 },
    { ...original, pid: Number.MAX_SAFE_INTEGER + 1 },
    { ...original, mode: 'invoke-factory' },
  ])
    assert.throws(() => createHttpRuntimeProtocol(bad), invalid);
  assert.throws(() => createHttpRuntimeProtocol(), invalid);
  assert.throws(() => createHttpRuntimeProtocol(original, {}), invalid);
  let getters = 0;
  const accessor = { ...original };
  Object.defineProperty(accessor, 'pid', {
    enumerable: true,
    get() {
      getters++;
      return original.pid;
    },
  });
  assert.throws(() => createHttpRuntimeProtocol(accessor), invalid);
  assert.equal(getters, 0);
  let traps = 0;
  const proxy = new Proxy(original, {
    ownKeys() {
      traps++;
      return [];
    },
  });
  assert.throws(() => createHttpRuntimeProtocol(proxy), invalid);
  assert.equal(traps, 0);
});

test('complete protocol remains nonqualifying and returns independent snapshots', async (t) => {
  await componentCase(t, 'start-terminal-clean-exit', (p, expected) => {
    const first = start(expected),
      last = terminal(expected);
    const original = [structuredClone(first), structuredClone(last)];
    assert.equal(p.receive(first), true);
    assert.equal(p.receive(last), true);
    first.nonce = 'mutated';
    last.result.observation.factoryInvoked = true;
    const snapshot = p.snapshot();
    assert.deepEqual(snapshot.frames, original);
    assert.equal(snapshot.observedFrames, 2);
    assert.equal(
      snapshot.observedBytes,
      original.reduce((sum, value) => sum + Buffer.byteLength(JSON.stringify(value)), 0),
    );
    assert.match(snapshot.representation, /parsed JSON reserialization; not transport wire bytes/u);
    assert.equal(snapshot.processCustodyQualified, false);
    assert.equal(snapshot.readinessPromoting, false);
    snapshot.expected.pid = -1;
    snapshot.frames[1].result.modules.evaluations.push({ fabricated: true });
    const result = p.finish(cleanExit);
    assert.deepEqual(result, original[1].result);
    result.observation.factoryInvoked = true;
    assert.deepEqual(p.snapshot().frames, original);
    assert.equal(p.snapshot().finished, true);
    assert.throws(() => p.finish(cleanExit), invalid);
    assert.equal(p.snapshot().refused, true);
  });
});

test('identities, envelope closure and ordering refuse irreversibly', async (t) => {
  const mutations = [
    [
      'wrong version',
      (f) => {
        f.schemaVersion = 2;
      },
    ],
    [
      'string version',
      (f) => {
        f.schemaVersion = '1';
      },
    ],
    [
      'wrong candidate',
      (f) => {
        f.candidateCommit = 'b'.repeat(40);
      },
    ],
    [
      'wrong nonce',
      (f) => {
        f.nonce = randomUUID();
      },
    ],
    [
      'wrong child pid',
      (f) => {
        f.pid += 1;
      },
    ],
    [
      'string child pid',
      (f) => {
        f.pid = String(f.pid);
      },
    ],
    [
      'missing identity',
      (f) => {
        delete f.nonce;
      },
    ],
    [
      'extra envelope key',
      (f) => {
        f.unreviewed = true;
      },
    ],
    [
      'unknown frame kind',
      (f) => {
        f.kind = 'ready';
      },
    ],
    [
      'wrong start mode',
      (f) => {
        f.result.mode = 'invoke-factory';
      },
    ],
    [
      'extra start field',
      (f) => {
        f.result.factory = 'caller';
      },
    ],
  ];
  for (const [name, mutate] of mutations)
    await componentCase(t, name, (p, expected) => {
      const bad = start(expected);
      mutate(bad);
      assert.equal(p.receive(bad), false);
      assert.equal(p.receive(start(expected)), false);
      assert.equal(p.receive(terminal(expected)), false);
      requireRefusal(p);
      assert.deepEqual(p.snapshot().frames[0], bad);
    });
  for (const value of [null, false, 0, '', [], {}])
    await componentCase(t, `invalid outer ${JSON.stringify(value)}`, (p, expected) => {
      assert.equal(p.receive(value), false);
      assert.equal(p.receive(start(expected)), false);
      requireRefusal(p);
      assert.deepEqual(p.snapshot().frames[0], value);
    });
  await componentCase(t, 'terminal-before-start', (p, expected) => {
    assert.equal(p.receive(terminal(expected)), false);
    assert.equal(p.receive(start(expected)), false);
    assert.equal(p.receive(terminal(expected)), false);
    requireRefusal(p);
  });
  await componentCase(t, 'duplicate-start', (p, expected) => {
    assert.equal(p.receive(start(expected)), true);
    assert.equal(p.receive(start(expected)), false);
    requireRefusal(p);
  });
  for (const kind of ['start', 'terminal', 'unknown'])
    await componentCase(t, `${kind}-after-terminal`, (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      assert.equal(p.receive(terminal(expected)), true);
      const bad = kind === 'start' ? start(expected) : terminal(expected);
      bad.kind = kind;
      assert.equal(p.receive(bad), false);
      requireRefusal(p);
    });
  for (const value of [null, false, 0, '', [], {}])
    await componentCase(t, `first-terminal-${JSON.stringify(value)}-then-valid`, (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      assert.equal(p.receive(frame(expected, 'terminal', value)), false);
      assert.equal(p.receive(terminal(expected)), false);
      requireRefusal(p);
      assert.equal(p.snapshot().terminalSeen, true);
      assert.deepEqual(p.snapshot().frames[1].result, value);
    });
});

test('terminal claims and required nested facts cannot be substituted', async (t) => {
  const mutations = [
    [
      'readiness claim',
      (r) => {
        r.readinessPromoting = true;
      },
    ],
    [
      'custody claim',
      (r) => {
        r.runtimeCustodyComplete = true;
      },
    ],
    [
      'missing readiness claim',
      (r) => {
        delete r.readinessPromoting;
      },
    ],
    [
      'extra terminal field',
      (r) => {
        r.extra = true;
      },
    ],
    [
      'wrong observation scope',
      (r) => {
        r.observation.scope = 'full-http';
      },
    ],
    [
      'factory invocation claim',
      (r) => {
        r.observation.factoryInvoked = true;
      },
    ],
    [
      'unobserved named export',
      (r) => {
        r.observation.actualNamedExportObserved = false;
      },
    ],
    [
      'complete modules claim',
      (r) => {
        r.modules.complete = true;
      },
    ],
    [
      'promoting modules claim',
      (r) => {
        r.modules.readinessPromoting = true;
      },
    ],
    [
      'nonarray resolutions',
      (r) => {
        r.modules.resolutions = {};
      },
    ],
    [
      'nonarray evaluations',
      (r) => {
        r.modules.evaluations = null;
      },
    ],
    [
      'nonarray trusted bootstrap',
      (r) => {
        r.trustedBootstrap = {};
      },
    ],
    [
      'missing observation fact',
      (r) => {
        delete r.observation.factoryInvoked;
      },
    ],
    [
      'missing module fact',
      (r) => {
        delete r.modules.complete;
      },
    ],
  ];
  for (const [name, mutate] of mutations)
    await componentCase(t, name, (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      const bad = terminal(expected);
      mutate(bad.result);
      assert.equal(p.receive(bad), false);
      assert.equal(p.receive(terminal(expected)), false);
      requireRefusal(p);
    });
  await componentCase(
    t,
    'observation facts must be own even with ambient prototype data',
    (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      const bad = terminal(expected);
      bad.result.observation = {};
      const facts = {
        scope: expected.mode,
        factoryInvoked: false,
        actualNamedExportObserved: true,
      };
      let admitted;
      try {
        for (const [key, value] of Object.entries(facts))
          Object.defineProperty(Object.prototype, key, { value, configurable: true });
        admitted = p.receive(bad);
      } finally {
        for (const key of Object.keys(facts)) delete Object.prototype[key];
      }
      assert.equal(admitted, false, 'Missing JSON fields cannot inherit qualifying claims');
      requireRefusal(p);
    },
  );
  await componentCase(
    t,
    'module facts must be own even with ambient prototype data',
    (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      const bad = terminal(expected);
      delete bad.result.modules.complete;
      let admitted;
      try {
        Object.defineProperty(Object.prototype, 'complete', { value: false, configurable: true });
        admitted = p.receive(bad);
      } finally {
        delete Object.prototype.complete;
      }
      assert.equal(admitted, false, 'Module completeness must be present in parsed JSON');
      requireRefusal(p);
    },
  );
});

test('direct non-JSON caller objects refuse without executing user behavior', async (t) => {
  await componentCase(t, 'accessor is not invoked', (p, expected) => {
    const value = start(expected);
    let reads = 0;
    Object.defineProperty(value, 'result', {
      enumerable: true,
      get() {
        reads++;
        throw new Error('getter');
      },
    });
    assert.equal(p.receive(value), false);
    assert.equal(reads, 0);
    assert.equal(p.snapshot().captureComplete, false);
    requireRefusal(p);
  });
  await componentCase(t, 'proxy traps are not invoked', (p, expected) => {
    let traps = 0;
    const value = new Proxy(start(expected), {
      ownKeys() {
        traps++;
        throw new Error('trap');
      },
    });
    assert.equal(p.receive(value), false);
    assert.equal(traps, 0);
    requireRefusal(p);
  });
  await componentCase(t, 'toJSON is not invoked', (p, expected) => {
    const value = start(expected);
    let calls = 0;
    value.toJSON = () => {
      calls++;
      return start(expected);
    };
    assert.equal(p.receive(value), false);
    assert.equal(calls, 0);
    requireRefusal(p);
  });
  await componentCase(t, 'array iterator is not invoked', (p, expected) => {
    const value = terminal(expected);
    let calls = 0;
    value.result.modules.evaluations[Symbol.iterator] = () => {
      calls++;
      return [][Symbol.iterator]();
    };
    assert.equal(p.receive(value), false);
    assert.equal(calls, 0);
    requireRefusal(p);
  });
  const mutations = [
    [
      'sparse array',
      (v) => {
        v.result.modules.evaluations.length = 1;
      },
    ],
    [
      'extended array',
      (v) => {
        v.result.modules.evaluations.extra = true;
      },
    ],
    [
      'nonfinite number',
      (v) => {
        v.result.observation.value = Infinity;
      },
    ],
    [
      'undefined member',
      (v) => {
        v.result.observation.value = undefined;
      },
    ],
    [
      'cycle',
      (v) => {
        v.result.observation.value = v;
      },
    ],
    [
      'nonplain object',
      (v) => {
        v.result.observation.value = new Date();
      },
    ],
    [
      'hidden property',
      (v) => {
        Object.defineProperty(v, 'hidden', { value: true });
      },
    ],
  ];
  for (const [name, mutate] of mutations)
    await componentCase(t, name, (p, expected) => {
      const value = terminal(expected);
      mutate(value);
      assert.equal(p.receive(value), false);
      assert.equal(p.snapshot().captureComplete, false);
      requireRefusal(p);
    });
});

test('clean exit is mandatory and finalization cannot be repeated or repaired', async (t) => {
  const exits = [
    null,
    {},
    [],
    { code: 1, signal: null },
    { code: null, signal: 'SIGTERM' },
    { code: 0 },
    { code: '0', signal: null },
    { code: 0, signal: null, extra: true },
  ];
  for (const exit of exits)
    await componentCase(t, `exit-${JSON.stringify(exit)}`, (p, expected) => {
      assert.equal(p.receive(start(expected)), true);
      assert.equal(p.receive(terminal(expected)), true);
      assert.throws(() => p.finish(exit), invalid);
      assert.throws(() => p.finish(cleanExit), invalid);
      assert.equal(p.snapshot().refused, true);
    });
  for (const stage of ['empty', 'start-only'])
    await componentCase(t, stage, (p, expected) => {
      if (stage === 'start-only') assert.equal(p.receive(start(expected)), true);
      requireRefusal(p);
      assert.equal(p.receive(terminal(expected)), false);
    });
  await componentCase(t, 'frame-after-successful-finish', (p, expected) => {
    assert.equal(p.receive(start(expected)), true);
    assert.equal(p.receive(terminal(expected)), true);
    assert.deepEqual(p.finish(cleanExit), terminal(expected).result);
    assert.equal(p.receive(start(expected)), false);
    requireRefusal(p);
  });
});

function sizedTerminal(expected, size) {
  const value = terminal(expected);
  value.result.observation.blockedOn = [''];
  const remaining = size - Buffer.byteLength(JSON.stringify(value));
  value.result.observation.blockedOn[0] =
    'é'.repeat(Math.floor(remaining / 2)) + (remaining % 2 ? 'x' : '');
  assert.equal(Buffer.byteLength(JSON.stringify(value)), size);
  return value;
}

test('UTF-8 frame bytes, cumulative capture and message count are bounded without truncation', async (t) => {
  await componentCase(
    t,
    'exact frame byte limit accepts structural protocol only',
    (p, expected, id) => {
      assert.equal(p.receive(start(expected)), true);
      const value = sizedTerminal(expected, frameLimit);
      save(`${id}-input`, value);
      assert.ok(
        JSON.stringify(value).length < frameLimit,
        'Multibyte characters make byte and character bounds different',
      );
      assert.equal(p.receive(value), true);
      assert.equal(p.finish(cleanExit).runtimeCustodyComplete, false);
      assert.equal(p.snapshot().captureComplete, true);
    },
  );
  await componentCase(t, 'one UTF-8 byte beyond frame bound refuses', (p, expected, id) => {
    const value = sizedTerminal(expected, frameLimit + 1);
    save(`${id}-input`, value);
    assert.equal(p.receive(value), false);
    assert.equal(p.snapshot().captureComplete, false);
    assert.equal(p.snapshot().frames.length, 0);
    assert.equal(p.snapshot().observedBytes, frameLimit + 1);
    requireRefusal(p);
  });
  for (const overflow of [0, 1])
    await componentCase(t, `cumulative capture bound plus ${overflow}`, (p, expected, id) => {
      const first = start(expected),
        last = sizedTerminal(expected, frameLimit);
      assert.equal(p.receive(first), true);
      assert.equal(p.receive(last), true);
      const remaining =
        captureLimit - Buffer.byteLength(JSON.stringify(first)) - frameLimit + overflow;
      const third = sizedTerminal(expected, remaining);
      save(`${id}-input`, third);
      assert.equal(
        p.receive(third),
        false,
        'Duplicate terminal never becomes valid at either byte boundary',
      );
      const snapshot = p.snapshot();
      assert.equal(snapshot.observedBytes, captureLimit + overflow);
      assert.equal(snapshot.captureComplete, overflow === 0);
      assert.equal(snapshot.frames.length, overflow === 0 ? 3 : 2);
      requireRefusal(p);
    });
  await componentCase(t, '1025th parsed frame refuses bounded capture', (p, expected) => {
    for (let count = 0; count < 1024; count++) p.receive(start(expected));
    assert.equal(p.snapshot().observedFrames, 1024);
    assert.equal(p.snapshot().frames.length, 1024);
    assert.equal(p.snapshot().captureComplete, true);
    assert.equal(p.receive(start(expected)), false);
    assert.equal(p.snapshot().observedFrames, 1025);
    assert.equal(p.snapshot().frames.length, 1024);
    assert.equal(p.snapshot().captureComplete, false);
    requireRefusal(p);
  });
});

// This child is an explicitly hostile transport fixture. It is neither the
// product worker nor a substituted app factory, and its frames cannot qualify
// any fresh-build handle or candidate runtime observation.
const transportChild = `
const options = JSON.parse(process.argv[1]);
const { expected, scenario } = options;
const frame = (kind,result) => ({schemaVersion:1,kind,nonce:expected.nonce,candidateCommit:expected.candidateCommit,pid:process.pid,result});
const first = frame('start',{mode:expected.mode});
const last = frame('terminal',options.result);
let frames = [first,last];
if (scenario === 'falsy-first') frames = [first,frame('terminal',false),last];
if (scenario === 'wrong-nonce') frames = [{...first,nonce:'wrong'},first,last];
if (scenario === 'wrong-pid') frames = [{...first,pid:process.pid+1},first,last];
if (scenario === 'duplicate-terminal') frames = [first,last,last];
if (scenario === 'stdout-only') { console.log(JSON.stringify(last)); frames=[]; }
for (const value of frames) await new Promise((accept,reject)=>process.send(value,error=>error?reject(error):accept()));
process.disconnect();
if (scenario === 'signal') process.kill(process.pid,'SIGTERM');
if (scenario === 'exit-failure') process.exitCode=7;
`;

test('real hostile-child IPC exercises the production component without worker substitution', async (t) => {
  for (const scenario of [
    'valid',
    'falsy-first',
    'wrong-nonce',
    'wrong-pid',
    'duplicate-terminal',
    'stdout-only',
    'exit-failure',
    'signal',
  ])
    await t.test(scenario, async () => {
      const directory = join(root, `transport-${scenario}`);
      mkdirSync(directory);
      const expected = context();
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          transportChild,
          JSON.stringify({ expected, scenario, result: terminal(expected).result }),
        ],
        {
          cwd: directory,
          env: {
            PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
            LANG: 'C',
            NODE_DISABLE_COMPILE_CACHE: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          serialization: 'json',
        },
      );
      expected.pid = child.pid;
      const protocol = createHttpRuntimeProtocol(expected);
      const received = [],
        admissions = [];
      let stdout = '',
        stderr = '';
      child.on('message', (value) => {
        received.push(value);
        admissions.push(protocol.receive(value));
      });
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      const status = await new Promise((accept, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => accept({ code, signal }));
      }).finally(() => clearTimeout(timer));
      let finished;
      try {
        if (scenario === 'valid') {
          finished = protocol.finish(status);
          assert.deepEqual(status, cleanExit);
          assert.deepEqual(admissions, [true, true]);
          assert.deepEqual(finished, terminal(expected).result);
          assert.equal(protocol.snapshot().processCustodyQualified, false);
        } else {
          assert.throws(() => protocol.finish(status), invalid);
          assert.equal(protocol.snapshot().refused, true);
          if (scenario === 'falsy-first') {
            assert.deepEqual(admissions, [true, false, false]);
            assert.equal(received[1].result, false);
          }
          if (scenario === 'stdout-only') {
            assert.equal(received.length, 0);
            assert.equal(JSON.parse(stdout).kind, 'terminal');
          }
        }
        assert.equal(stderr, '');
        assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
      } finally {
        writeFileSync(join(directory, 'stdout.log'), stdout);
        writeFileSync(join(directory, 'stderr.log'), stderr);
        writeFileSync(
          join(directory, 'semantic-frames.json'),
          `${JSON.stringify({
            representation:
              'Received Node IPC parsed values, JSON reserialized; not transport wire bytes',
            scope: 'Hostile child/component transport fixture; nonqualifying',
            actualChildPid: child.pid,
            expected,
            received,
            admissions,
            status,
            snapshot: protocol.snapshot(),
            finished,
          })}\n`,
        );
      }
    });
});

test('artifact capture uses the actual bounded compact serializer', async (t) => {
  await componentCase(
    t,
    'compact capture preserves depth-500 JSON without pretty expansion',
    (p, expected, id) => {
      const first = start(expected),
        last = terminal(expected);
      let nested = { value: 'ação 日本語' };
      for (let depth = 0; depth < 500; depth++) nested = { next: nested };
      last.result.modules.evaluations.push(nested);
      assert.equal(p.receive(first), true);
      assert.equal(p.receive(last), true);
      assert.deepEqual(p.finish(cleanExit), last.result);
      const artifact = p.captureArtifact(null);
      writeFileSync(join(root, `${id}-capture-artifact.json`), artifact.body);
      assert.equal(artifact.overflowed, false);
      assert.equal(artifact.byteLength, Buffer.byteLength(artifact.body));
      assert.equal(artifact.body.includes('\n'), false);
      assert.equal(JSON.stringify(JSON.parse(artifact.body)), artifact.body);
      assert.ok(artifact.byteLength < Buffer.byteLength(JSON.stringify([first, last])) + 4096);
      const parsed = JSON.parse(artifact.body);
      assert.deepEqual(parsed.frames, [first, last]);
      assert.equal(parsed.supervisorFailure, null);
      assert.equal(parsed.captureComplete, true);
      assert.equal(parsed.processCustodyQualified, false);
      assert.equal(parsed.readinessPromoting, false);
    },
  );
  await componentCase(t, 'capture failure labels and arity are closed', (p, expected) => {
    assert.equal(p.receive(start(expected)), true);
    for (const failure of [null, 'HTTP_RUNTIME_WORKER_INVALID', 'HTTP_RUNTIME_CAPTURE_INVALID'])
      assert.equal(JSON.parse(p.captureArtifact(failure).body).supervisorFailure, failure);
    for (const bad of [
      undefined,
      '',
      'untrusted provider diagnostic',
      false,
      {},
      new Error('untrusted diagnostic'),
    ])
      assert.throws(() => p.captureArtifact(bad), invalid);
    assert.throws(() => p.captureArtifact(), invalid);
    assert.throws(() => p.captureArtifact(null, {}), invalid);
  });
  for (const overflow of [0, 1])
    await componentCase(
      t,
      `actual full UTF-8 artifact limit plus ${overflow}`,
      (p, expected, id) => {
        const first = start(expected),
          last = sizedTerminal(expected, frameLimit);
        // Calibrate using the real method on a separate component. This measures
        // the full envelope; no test-local copy of its serialization algorithm.
        const calibration = createHttpRuntimeProtocol(expected);
        calibration.receive(first);
        calibration.receive(last);
        calibration.receive(sizedTerminal(expected, 1024));
        const measured = calibration.captureArtifact('HTTP_RUNTIME_WORKER_INVALID');
        assert.equal(measured.overflowed, false);
        const thirdSize = 1024 + captureLimit + overflow - measured.byteLength;
        assert.ok(thirdSize <= frameLimit);
        const third = sizedTerminal(expected, thirdSize);
        assert.equal(p.receive(first), true);
        assert.equal(p.receive(last), true);
        assert.equal(p.receive(third), false, 'Duplicate terminal remains a protocol refusal');
        const before = p.snapshot();
        assert.equal(before.captureComplete, true);
        assert.ok(
          before.observedBytes < captureLimit,
          'This exercises artifact envelope overflow, not receive overflow',
        );
        const artifact = p.captureArtifact('HTTP_RUNTIME_WORKER_INVALID');
        writeFileSync(join(root, `${id}-capture-artifact.json`), artifact.body);
        assert.equal(artifact.byteLength, Buffer.byteLength(artifact.body));
        const parsed = JSON.parse(artifact.body);
        assert.equal(artifact.overflowed, overflow === 1);
        assert.equal(parsed.observedFrames, 3);
        assert.equal(parsed.observedBytes, before.observedBytes);
        assert.equal(parsed.processCustodyQualified, false);
        assert.equal(parsed.readinessPromoting, false);
        if (overflow === 0) {
          assert.ok(
            artifact.body.length < artifact.byteLength,
            'Count actual multibyte UTF-8 artifact bytes',
          );
          assert.equal(artifact.byteLength, captureLimit);
          assert.deepEqual(parsed.frames, [first, last, third]);
          assert.equal(parsed.captureComplete, true);
        } else {
          assert.equal(
            artifact.body.length,
            artifact.byteLength,
            'Overflow metadata is ASCII after the Unicode frames are omitted',
          );
          assert.ok(artifact.byteLength < 4096);
          assert.equal(parsed.captureOmittedReason, 'ARTIFACT_BYTE_LIMIT');
          assert.equal(parsed.captureComplete, false);
          assert.equal(parsed.refused, true);
          assert.equal(parsed.supervisorFailure, 'HTTP_RUNTIME_CAPTURE_INVALID');
          assert.equal(
            Object.hasOwn(parsed, 'frames'),
            false,
            'Omitted frames are not described as an empty complete population',
          );
          assert.equal(p.snapshot().captureComplete, false);
          assert.equal(p.snapshot().refused, true);
          assert.equal(p.receive(terminal(expected)), false);
          requireRefusal(p);
        }
      },
    );
  await componentCase(
    t,
    'capture and frame snapshots have no mutable shared history',
    (p, expected) => {
      const first = start(expected),
        last = terminal(expected);
      assert.equal(p.receive(first), true);
      assert.equal(p.receive(last), true);
      const initial = p.captureArtifact(null);
      const returned = JSON.parse(initial.body);
      returned.expected.pid = -1;
      returned.frames[1].result.modules.evaluations.push({ fabricated: true });
      initial.body = 'caller replacement';
      initial.byteLength = 0;
      initial.overflowed = true;
      const after = p.captureArtifact(null);
      assert.deepEqual(JSON.parse(after.body).frames, [first, last]);
      assert.deepEqual(JSON.parse(after.body).expected, expected);
      assert.equal(after.overflowed, false);
      assert.deepEqual(p.finish(cleanExit), last.result);
    },
  );
});

test('malformed deep caller values refuse with the fixed typed boundary', async (t) => {
  let deep = {};
  for (let depth = 0; depth < 20000; depth++) deep = { next: deep };
  assert.throws(() => createHttpRuntimeProtocol({ ...context(), unexpected: deep }), invalid);
  await componentCase(
    t,
    'deep received value refuses without escaping event handler',
    (p, expected) => {
      const value = terminal(expected);
      value.result.observation.extra = deep;
      assert.equal(p.receive(value), false);
      assert.equal(p.snapshot().captureComplete, false);
      requireRefusal(p);
    },
  );
  await componentCase(t, 'deep malformed exit refuses without raw RangeError', (p, expected) => {
    assert.equal(p.receive(start(expected)), true);
    assert.equal(p.receive(terminal(expected)), true);
    assert.throws(() => p.finish({ ...cleanExit, unexpected: deep }), invalid);
  });
});

test('inherited JSON hooks cannot execute or rewrite parsed IPC semantics', async (t) => {
  await componentCase(
    t,
    'inherited toJSON getter is never invoked on receive',
    (p, expected, id) => {
      let reads = 0,
        admitted;
      try {
        Object.defineProperty(Object.prototype, 'toJSON', {
          configurable: true,
          get() {
            reads++;
            return undefined;
          },
        });
        admitted = p.receive(start(expected));
      } finally {
        delete Object.prototype.toJSON;
      }
      save(`${id}-getter-witness`, { reads, admitted });
      assert.equal(reads, 0);
    },
  );
  await componentCase(
    t,
    'inherited toJSON function cannot rewrite invalid frame as valid start',
    (p, expected, id) => {
      const original = { untrustedEnvelope: true };
      let calls = 0,
        admitted;
      try {
        Object.defineProperty(Object.prototype, 'toJSON', {
          configurable: true,
          value() {
            calls++;
            return Object.hasOwn(this, 'untrustedEnvelope') ? start(expected) : this;
          },
        });
        admitted = p.receive(original);
      } finally {
        delete Object.prototype.toJSON;
      }
      save(`${id}-rewrite-witness`, { calls, admitted, original });
      assert.equal(calls, 0);
      assert.equal(admitted, false);
      requireRefusal(p);
    },
  );
  await componentCase(
    t,
    'inherited toJSON getter is never invoked by captureArtifact',
    (p, expected, id) => {
      assert.equal(p.receive(start(expected)), true);
      let reads = 0,
        artifact,
        error;
      try {
        Object.defineProperty(Object.prototype, 'toJSON', {
          configurable: true,
          get() {
            reads++;
            return undefined;
          },
        });
        try {
          artifact = p.captureArtifact(null);
        } catch (caught) {
          error = caught.code;
        }
      } finally {
        delete Object.prototype.toJSON;
      }
      save(`${id}-getter-witness`, { reads, error, artifact });
      assert.equal(reads, 0);
      if (error) assert.equal(error, invalid.code);
      else assert.deepEqual(JSON.parse(artifact.body).frames, [start(expected)]);
    },
  );
});

test('inherited object and array serializers never execute across admission and capture', async (t) => {
  for (const [label, prototype] of [
    ['Object', Object.prototype],
    ['Array', Array.prototype],
  ]) {
    for (const kind of ['getter', 'function']) {
      await componentCase(
        t,
        `${label} inherited toJSON ${kind} preserves nested data`,
        (p, expected, id) => {
          const first = start(expected);
          const last = terminal(expected);
          const row = JSON.parse('{"__proto__":{"label":"ação 日本語"},"values":[1,null,"é"]}');
          last.result.modules.resolutions.push(row);
          last.result.modules.evaluations.push({ nested: [row, ['preserved']] });
          let calls = 0;
          const hook =
            kind === 'getter'
              ? {
                  get() {
                    calls++;
                    return undefined;
                  },
                }
              : {
                  value() {
                    calls++;
                    return 'inherited replacement';
                  },
                };
          let firstAccepted, lastAccepted, artifact, completed;
          const beforeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'toJSON');
          try {
            Object.defineProperty(prototype, 'toJSON', { configurable: true, ...hook });
            firstAccepted = p.receive(first);
            lastAccepted = p.receive(last);
            artifact = p.captureArtifact(null);
            completed = p.finish(cleanExit);
          } finally {
            if (beforeDescriptor) Object.defineProperty(prototype, 'toJSON', beforeDescriptor);
            else delete prototype.toJSON;
          }
          save(`${id}-hook-witness`, { calls, firstAccepted, lastAccepted, artifact });
          assert.equal(calls, 0);
          assert.equal(firstAccepted, true);
          assert.equal(lastAccepted, true);
          assert.equal(artifact.overflowed, false);
          assert.equal(artifact.byteLength, Buffer.byteLength(artifact.body));
          assert.deepEqual(JSON.parse(artifact.body).frames, [first, last]);
          assert.deepEqual(completed, last.result);
          assert.equal(Object.hasOwn(completed.modules.resolutions[0], '__proto__'), true);
          assert.deepEqual(completed.modules.resolutions[0].__proto__, { label: 'ação 日本語' });
          assert.equal(Object.getPrototypeOf(completed.modules.resolutions[0]), Object.prototype);
          assert.equal(Object.getOwnPropertyDescriptor(prototype, 'toJSON'), beforeDescriptor);
        },
      );
    }
  }
});
