import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { observeFreshHttpReferenceBootstrap } from '../../scripts/lib/http-fresh-build.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nodePath = realpathSync(process.execPath);
const nodeSha256 = hash(readFileSync(nodePath));
const candidateCommit = 'a'.repeat(40);
const fixedRefusal = 'HTTP runtime bootstrap worker refused\n';

// These are real subprocess startup/refusal fixtures, not supervised builds or
// application substitutes. The positive module observation is a separate actual
// candidate prepare -> observe -> close run; it is not inferred from these cases.
function fixture(root, name) {
  const checkoutRoot = join(root, name);
  mkdirSync(join(checkoutRoot, 'scripts/lib'), { recursive: true });
  const controlFiles = [
    'http-runtime-worker.mjs',
    'http-module-custody.mjs',
    'http-runtime-bindings.mjs',
    'http-runtime-census.mjs',
  ];
  for (const file of controlFiles)
    copyFileSync(join(repository, 'scripts/lib', file), join(checkoutRoot, 'scripts/lib', file));
  const member = join(checkoutRoot, 'member.mjs');
  writeFileSync(member, 'export const diagnosticOnly = true;\n');
  const descriptorPath = join(checkoutRoot, 'job.json');
  const seed = {
    PATH: `${dirname(nodePath)}:/usr/bin:/bin`,
    LANG: 'C',
    LC_ALL: 'C',
    NODE_DISABLE_COMPILE_CACHE: '1',
  };
  // macOS injects __CF_USER_TEXT_ENCODING into new processes. Observe the actual
  // native environment from a credential-free child rather than guessing it.
  const probe = spawnSync(nodePath, ['-p', 'JSON.stringify(process.env)'], {
    env: seed,
    encoding: 'utf8',
  });
  assert.equal(probe.status, 0);
  const environment = JSON.parse(probe.stdout);
  const controlPaths = controlFiles.map((file) => `scripts/lib/${file}`);
  const controls = controlPaths.map((path) => {
    const actual = join(checkoutRoot, path);
    const bytes = readFileSync(actual);
    return {
      path,
      permissions: lstatSync(actual).mode & 0o7777,
      sha256: hash(bytes),
      byteLength: bytes.length,
      blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    };
  });
  const job = {
    schemaVersion: 1,
    mode: 'bootstrap-module-only',
    compositionId: 'reference',
    nonce: randomUUID(),
    candidateCommit,
    tree: 'b'.repeat(40),
    parentPid: process.pid,
    checkoutRoot,
    descriptorPath,
    nodePath,
    nodeSha256,
    platform: process.platform,
    arch: process.arch,
    environment: Object.fromEntries(
      Object.entries(environment).map(([name, value]) => [name, hash(value)]),
    ),
    controls,
    resolutionAnchors: [],
    receipt: {
      schemaVersion: 1,
      nodeVersion: process.versions.node,
      nodeSha256,
      files: [
        {
          url: pathToFileURL(member).href,
          sha256: hash(readFileSync(member)),
          moduleKind: 'module',
        },
      ],
    },
  };
  // Two source-bound resolution bases, never evaluated receipt modules. These
  // copies support only standalone startup/refusal witnesses, not a live handle.
  const anchorRules = [
    [
      'reference/api/package.json',
      'scripts/lib/http-module-custody.mjs',
      "createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata')",
      ['reflect-metadata'],
    ],
    [
      'packages/flow/package.json',
      'scripts/lib/http-runtime-census.mjs',
      "createRequire(new URL('../../packages/flow/package.json', import.meta.url))",
      [
        '@nestjs/core',
        '@nestjs/core/router/router-explorer',
        '@nestjs/core/adapters/http-adapter',
        '@nestjs/common',
        '@nestjs/common/constants',
        '@stynx-nyx/auth',
        '@nestjs/platform-express',
      ],
    ],
  ];
  const physical = (relative) => {
    const actual = join(checkoutRoot, relative),
      bytes = readFileSync(actual),
      stat = lstatSync(actual);
    return {
      path: relative,
      url: pathToFileURL(actual).href,
      sha256: hash(bytes),
      byteLength: bytes.length,
      permissions: stat.mode & 0o7777,
      device: stat.dev,
      inode: stat.ino,
      blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      mode: '100644',
    };
  };
  for (const [manifest, caller, literal, requests] of anchorRules) {
    mkdirSync(dirname(join(checkoutRoot, manifest)), { recursive: true });
    copyFileSync(join(repository, manifest), join(checkoutRoot, manifest));
    const source = readFileSync(join(checkoutRoot, caller), 'utf8'),
      start = source.indexOf(literal);
    assert.equal(start >= 0 && source.indexOf(literal, start + 1) === -1, true);
    job.resolutionAnchors.push({
      classification: 'NON_EVALUATED_RESOLUTION_ANCHOR',
      candidateCommit,
      tree: job.tree,
      nonce: job.nonce,
      manifest: physical(manifest),
      caller: {
        ...physical(caller),
        callsite: {
          kind: 'DECLARED_REVIEWED_CALLSITE',
          start,
          end: start + literal.length,
          literal,
        },
      },
      requests,
      conditions: ['require', 'node', 'node-addons', 'module-sync'],
    });
  }
  return {
    checkoutRoot,
    descriptorPath,
    environment,
    job,
    entry: join(checkoutRoot, 'scripts/lib/http-runtime-worker.mjs'),
    execArgv: [],
    extraArgv: [],
    ipc: true,
    descriptorMode: 0o600,
  };
}

async function execute(f, mutate = () => {}) {
  mutate(f);
  const body = JSON.stringify(f.job);
  writeFileSync(f.descriptorPath, body, { mode: 0o600 });
  chmodSync(f.descriptorPath, f.descriptorMode);
  const env = { ...f.environment, STYNX_HTTP_JOB_SHA256: hash(body), ...f.extraEnvironment };
  if (f.badDescriptorHash) env.STYNX_HTTP_JOB_SHA256 = '0'.repeat(64);
  const child = spawn(nodePath, [...f.execArgv, f.entry, f.descriptorPath, ...f.extraArgv], {
    cwd: f.checkoutRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe', ...(f.ipc ? ['ipc'] : [])],
    serialization: 'json',
  });
  const frames = [];
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('message', (frame) => {
    frames.push(frame);
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  const status = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => accept({ code, signal }));
  }).finally(() => clearTimeout(timer));
  const result = { ...status, pid: child.pid, frames, stdout, stderr };
  writeFileSync(join(f.checkoutRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(f.checkoutRoot, 'stdout.log'), stdout);
  writeFileSync(join(f.checkoutRoot, 'stderr.log'), stderr);
  assert.deepEqual(status, { code: 1, signal: null });
  assert.equal(stdout, '');
  assert.equal(stderr, fixedRefusal);
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  return result;
}

function bindEnvironment(f, name, value) {
  f.environment[name] = value;
  f.job.environment[name] = hash(value);
}

test('runtime observation rejects caller-supplied handles and arguments', async () => {
  await assert.rejects(
    observeFreshHttpReferenceBootstrap({}),
    /Unknown, closed, or refused fresh build handle/u,
  );
  await assert.rejects(
    observeFreshHttpReferenceBootstrap(JSON.parse('{"candidateCommit":"a"}')),
    /Unknown, closed, or refused fresh build handle/u,
  );
  await assert.rejects(
    observeFreshHttpReferenceBootstrap({}, { compositionId: 'reference' }),
    /exactly one private handle/u,
  );
});

test('actual worker startup enforces descriptor, process and control custody', async (t) => {
  assert.equal(process.versions.node, '24.20.0', 'This acceptance requires the pinned real Node');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx worker refusals espaço 日本語 ')));
  t.diagnostic(`Nonqualified standalone fixtures and raw IPC/logs: ${root}`);
  await t.test(
    'valid startup emits one identity-bound start then refuses missing installed dependency',
    async () => {
      const f = fixture(root, 'valid-start-no-dependencies');
      const result = await execute(f);
      assert.equal(result.frames.length, 1);
      assert.deepEqual(result.frames[0], {
        schemaVersion: 1,
        kind: 'start',
        nonce: f.job.nonce,
        candidateCommit,
        pid: result.pid,
        result: { mode: 'bootstrap-module-only', resolutionAnchors: f.job.resolutionAnchors },
      });
    },
  );
  const cases = [
    [
      'no private IPC channel',
      (f) => {
        f.ipc = false;
      },
    ],
    [
      'extra argv',
      (f) => {
        f.extraArgv = ['unreviewed'];
      },
    ],
    [
      'unexpected execArgv',
      (f) => {
        f.execArgv = ['--trace-warnings'];
      },
    ],
    [
      'descriptor digest changed',
      (f) => {
        f.badDescriptorHash = true;
      },
    ],
    [
      'descriptor not private',
      (f) => {
        f.descriptorMode = 0o644;
      },
    ],
    [
      'wrong schema',
      (f) => {
        f.job.schemaVersion = 2;
      },
    ],
    [
      'unknown composition',
      (f) => {
        f.job.compositionId = 'caller-root';
      },
    ],
    [
      'wrong observation mode',
      (f) => {
        f.job.mode = 'invoke-factory';
      },
    ],
    [
      'invalid candidate',
      (f) => {
        f.job.candidateCommit = 'main';
      },
    ],
    [
      'invalid tree',
      (f) => {
        f.job.tree = 'z'.repeat(40);
      },
    ],
    [
      'invalid nonce',
      (f) => {
        f.job.nonce = 'caller';
      },
    ],
    [
      'wrong parent process',
      (f) => {
        f.job.parentPid += 1;
      },
    ],
    [
      'wrong descriptor location',
      (f) => {
        f.job.descriptorPath += '.other';
      },
    ],
    [
      'wrong checkout',
      (f) => {
        f.job.checkoutRoot = root;
      },
    ],
    [
      'wrong Node bytes',
      (f) => {
        f.job.nodeSha256 = '0'.repeat(64);
      },
    ],
    [
      'extra environment key',
      (f) => {
        f.extraEnvironment = { UNADMITTED_FIXTURE: 'not-a-secret' };
      },
    ],
    [
      'environment value drift',
      (f) => {
        f.environment.LANG = 'en_US';
      },
    ],
    [
      'control bytes drift',
      (f) => {
        writeFileSync(
          join(f.checkoutRoot, 'scripts/lib/http-runtime-bindings.mjs'),
          'export const changed = true;\n',
        );
      },
    ],
    [
      'control permissions drift',
      (f) => {
        chmodSync(join(f.checkoutRoot, 'scripts/lib/http-runtime-bindings.mjs'), 0o700);
      },
    ],
    [
      'linked control path',
      (f) => {
        symlinkSync(
          join(f.checkoutRoot, 'scripts/lib/http-runtime-bindings.mjs'),
          join(f.checkoutRoot, 'linked.mjs'),
        );
        f.job.controls[2].path = 'linked.mjs';
      },
    ],
    [
      'missing resolution anchor pair',
      (f) => {
        delete f.job.resolutionAnchors;
      },
    ],
    [
      'incomplete resolution anchor population',
      (f) => {
        f.job.resolutionAnchors.pop();
      },
    ],
    [
      'resolution anchor manifest bytes drift',
      (f) => {
        writeFileSync(join(f.checkoutRoot, 'reference/api/package.json'), '{}\n');
      },
    ],
    [
      'resolution anchor caller span drift',
      (f) => {
        f.job.resolutionAnchors[0].caller.callsite.start++;
      },
    ],
    [
      'resolution anchor request drift',
      (f) => {
        f.job.resolutionAnchors[0].requests = ['unreviewed'];
      },
    ],
    [
      'resolution anchor condition drift',
      (f) => {
        f.job.resolutionAnchors[0].conditions = ['import'];
      },
    ],
    [
      'resolution anchor claims evaluated manifest',
      (f) => {
        const anchor = f.job.resolutionAnchors[0];
        f.job.receipt.files.push({
          url: anchor.manifest.url,
          sha256: anchor.manifest.sha256,
          moduleKind: 'json',
        });
      },
    ],
    [
      'actual ambient preload',
      (f) => {
        const preload = join(f.checkoutRoot, 'preload.mjs');
        const marker = join(f.checkoutRoot, 'preload-observed.txt');
        writeFileSync(
          preload,
          `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'actual preload');\n`,
        );
        bindEnvironment(f, 'NODE_OPTIONS', `--import=${pathToFileURL(preload).href}`);
        f.preloadMarker = marker;
      },
    ],
    [
      'ambient Node options',
      (f) => {
        bindEnvironment(f, 'NODE_OPTIONS', '--no-warnings');
      },
    ],
    [
      'ambient module search path',
      (f) => {
        bindEnvironment(f, 'NODE_PATH', f.checkoutRoot);
      },
    ],
    [
      'ambient compile cache',
      (f) => {
        bindEnvironment(f, 'NODE_COMPILE_CACHE', join(f.checkoutRoot, 'cache'));
      },
    ],
    [
      'compile cache not explicitly disabled',
      (f) => {
        bindEnvironment(f, 'NODE_DISABLE_COMPILE_CACHE', '0');
      },
    ],
    [
      'missing module receipt',
      (f) => {
        f.job.receipt.files = [];
      },
    ],
    [
      'receipt module bytes differ',
      (f) => {
        f.job.receipt.files[0].sha256 = '0'.repeat(64);
      },
    ],
  ];
  for (const [name, mutation] of cases)
    await t.test(name, async () => {
      const f = fixture(root, name.replaceAll(' ', '-'));
      const result = await execute(f, mutation);
      if (f.preloadMarker) assert.equal(readFileSync(f.preloadMarker, 'utf8'), 'actual preload');
      assert.deepEqual(result.frames, [], 'No application/module-start frame is admitted');
    });
});
