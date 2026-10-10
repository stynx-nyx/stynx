import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// ADR-PERF-0001: actual fresh Node workers and public synchronous loader hooks.
// No Node module API is replaced. This partial observer does not establish
// supervisor/preloader freshness, build/object custody or HTTP reachability.
const root = resolve(import.meta.dirname, '../..');
const helper = pathToFileURL(join(root, 'scripts/lib/http-module-custody.mjs')).href;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nodeSha256 = sha(readFileSync(realpathSync(process.execPath)));

const workerSource = `
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installHttpModuleCustody } from ${JSON.stringify(helper)};
const config = JSON.parse(readFileSync(0, 'utf8'));
const require = createRequire(import.meta.url);
const absolute = name => new URL(name, import.meta.url).href;
const errorRecord = error => ({code: error.code ?? null, message: error.message});
const result = {nodeVersion: process.versions.node, execArgv: process.execArgv, operations: []};
for (const name of config.preloadCjs ?? []) require(fileURLToPath(absolute(name)));
for (const name of config.preloadEsm ?? []) await import(absolute(name));
for (const [name, bytes] of Object.entries(config.beforeInstallWrites ?? {}))
  writeFileSync(new URL(name, import.meta.url), bytes);
let custody;
try { custody = installHttpModuleCustody(config.receipt); }
catch (error) { result.installError = errorRecord(error); }
if (custody) {
  try {
    for (const operation of config.operations ?? []) {
      try {
        let value;
        const specifier = operation.specifier ?? absolute(operation.file ?? 'entry.mjs');
        if (operation.type === 'import') {
          const namespace = await import(specifier);
          value = operation.call ? namespace[operation.call](...(operation.arguments ?? []))
            : namespace[operation.exportName ?? 'marker'];
        } else if (operation.type === 'require' || operation.type === 'createRequire') {
          const loader = operation.type === 'require' ? require
            : createRequire(new URL('./require-anchor.cjs', import.meta.url));
          const exports = loader(specifier.startsWith('file:') ? fileURLToPath(specifier) : specifier);
          value = operation.call ? exports[operation.call](...(operation.arguments ?? []))
            : exports[operation.exportName ?? 'marker'];
        } else if (operation.type === 'write') {
          writeFileSync(new URL(operation.file, import.meta.url), operation.bytes);
          value = 'written';
        } else if (operation.type === 'mutateReceipt') {
          config.receipt.nodeVersion = 'fabricated';
          config.receipt.nodeSha256 = '0'.repeat(64);
          config.receipt.files[0].sha256 = '0'.repeat(64);
          config.receipt.files[0].moduleKind = 'json';
          value = 'mutated';
        } else if (operation.type === 'snapshot') value = custody.snapshot();
        else if (operation.type === 'mutateSnapshot') {
          const previous = custody.snapshot();
          previous.nodeVersion = 'fabricated';
          previous.resolutions[0].conditions.push('fabricated');
          previous.resolutions[0].url = 'file:///fabricated';
          previous.evaluations[0].sha256 = '0'.repeat(64);
          previous.evaluations.push({sha256: 'fabricated'});
          value = custody.snapshot();
        } else if (operation.type === 'assertValid') { custody.assertValid(); value = 'valid'; }
        else if (operation.type === 'close') { custody.close(); value = 'closed'; }
        else throw new Error('Unknown test operation');
        result.operations.push({type: operation.type, value});
      } catch (error) { result.operations.push({type: operation.type, error: errorRecord(error)}); }
    }
  } finally { custody.close(); }
}
result.preloadWitness = globalThis.preloadWitness ?? null;
console.log(JSON.stringify(result));
`;

function actualWorker(options = {}) {
  assert.equal(
    process.versions.node,
    '24.20.0',
    'these witnesses require the pinned real Node runtime',
  );
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'stynx module custódia ')));
  const sources = {
    'entry.mjs':
      "import bridge from './bridge.cjs'; import data from './data.json' with {type:'json'}; export const marker='entry'; export const calculate=n=>bridge.double(n)+data.delta;",
    'bridge.cjs':
      "const child = require('./child.js'); module.exports={marker:'bridge',double:child.double};",
    'child.cjs': "module.exports={marker:'child',double:n=>2*n};",
    'child.js': "module.exports={marker:'child',double:n=>2*n};",
    'data.json': '{"delta":7,"marker":"json"}',
    'late.mjs': "export const marker='late';",
    'outside.mjs': "globalThis.preloadWitness=true; export const marker='outside';",
    ...options.files,
  };
  try {
    for (const [name, bytes] of Object.entries(sources))
      writeFileSync(join(directory, name), bytes);
    const members = options.roster ?? [
      'entry.mjs',
      'bridge.cjs',
      'child.js',
      'data.json',
      'late.mjs',
    ];
    const receipt = {
      schemaVersion: 1,
      nodeVersion: process.versions.node,
      nodeSha256,
      files: members.map((name) => ({
        url: pathToFileURL(join(directory, name)).href,
        sha256: sha(readFileSync(join(directory, name))),
        moduleKind: name.endsWith('.json') ? 'json' : name.endsWith('.mjs') ? 'module' : 'commonjs',
      })),
      ...options.receipt,
    };
    if (options.alterReceipt) options.alterReceipt(receipt, directory);
    const worker = join(directory, 'worker.mjs');
    writeFileSync(worker, workerSource);
    const child = spawnSync(process.execPath, [...(options.execArgv ?? []), worker], {
      cwd: directory,
      input: JSON.stringify({
        receipt,
        operations: options.operations ?? [{ type: 'import' }, { type: 'snapshot' }],
        preloadCjs: options.preloadCjs,
        preloadEsm: options.preloadEsm,
        beforeInstallWrites: options.beforeInstallWrites,
      }),
      encoding: 'utf8',
      env: {
        NODE_DISABLE_COMPILE_CACHE: '1',
        ...(typeof options.environment === 'function'
          ? options.environment(directory)
          : options.environment),
      },
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, '');
    const observation = JSON.parse(child.stdout);
    assert.equal(observation.nodeVersion, '24.20.0');
    return { observation, receipt, sources, directory };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function refusedInstall(options, expression) {
  const { observation } = actualWorker(options);
  assert.equal(observation.installError?.code, 'HTTP_MODULE_CUSTODY_INVALID');
  assert.match(observation.installError.message, expression);
  assert.deepEqual(observation.operations, []);
}

test('real import to CJS require to CJS child forwards exports, JSON and raw undefined child format', () => {
  const { observation, receipt, sources } = actualWorker({
    operations: [{ type: 'import', call: 'calculate', arguments: [3] }, { type: 'snapshot' }],
  });
  assert.equal(observation.installError, undefined);
  assert.deepEqual(observation.execArgv, []);
  assert.equal(observation.operations[0].value, 13);
  const snapshot = observation.operations[1].value;
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.readinessPromoting, false);
  assert.equal(snapshot.nodeVersion, '24.20.0');
  assert.equal(snapshot.nodeSha256, nodeSha256);
  assert.equal(snapshot.evaluations.length, 4);
  for (const row of snapshot.evaluations) {
    const member = receipt.files.find(({ url }) => url === row.canonicalURL);
    assert.equal(row.sha256, member.sha256);
    const name = new URL(row.url).pathname.split('/').at(-1);
    assert.equal(row.byteLength, Buffer.byteLength(sources[name]));
  }
  const child = snapshot.evaluations.find(({ url }) => url.endsWith('/child.js'));
  assert.equal(child.observedFormat, null, 'preserve actual undefined raw Node child format');
  assert.equal(child.moduleKind, 'commonjs');
  assert.equal(
    snapshot.evaluations.find(({ url }) => url.endsWith('/data.json')).moduleKind,
    'json',
  );
  assert.ok(snapshot.resolutions.some(({ conditions }) => conditions.includes('require')));
  assert.ok(snapshot.resolutions.some(({ conditions }) => conditions.includes('import')));
  assert.ok(snapshot.resolutions.every(({ parentURL }) => parentURL.startsWith('file:')));
});

test('real require and createRequire retain evaluated bytes and actual CommonJS exports', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'require', file: 'bridge.cjs', call: 'double', arguments: [9] },
      { type: 'createRequire', file: 'child.js', call: 'double', arguments: [5] },
      { type: 'snapshot' },
    ],
  });
  assert.equal(observation.operations[0].value, 18);
  assert.equal(observation.operations[1].value, 10);
  assert.deepEqual(
    observation.operations[2].value.evaluations.map(({ moduleKind }) => moduleKind),
    ['commonjs', 'commonjs'],
  );
});

test('builtins resolve under the bound executable but cannot substitute for a bound file evaluation', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'import', specifier: 'node:path', exportName: 'sep' },
      { type: 'require', specifier: 'node:fs', exportName: 'constants' },
      { type: 'snapshot' },
      { type: 'import', file: 'late.mjs' },
      { type: 'snapshot' },
    ],
  });
  assert.equal(observation.operations[0].value, '/');
  assert.equal(typeof observation.operations[1].value.F_OK, 'number');
  assert.match(observation.operations[2].error.message, /evaluated no bound modules/u);
  assert.equal(observation.operations[4].value.evaluations.length, 1);
  assert.ok(
    observation.operations[4].value.resolutions.some(
      ({ builtin, url }) => builtin && url === 'node:path',
    ),
  );
});

test('delayed imports stay observed, and snapshot mutation cannot change internal observations', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'import', file: 'late.mjs' },
      { type: 'snapshot' },
      { type: 'import' },
      { type: 'snapshot' },
      { type: 'mutateSnapshot' },
      { type: 'assertValid' },
    ],
  });
  assert.equal(observation.operations[1].value.evaluations.length, 1);
  assert.equal(observation.operations[3].value.evaluations.length, 5);
  assert.deepEqual(observation.operations[4].value, observation.operations[3].value);
  assert.equal(observation.operations[5].value, 'valid');
});

test('validated Node identity and file roster are copied rather than read back from mutable receipt', () => {
  const { observation, receipt } = actualWorker({
    operations: [{ type: 'mutateReceipt' }, { type: 'import' }, { type: 'snapshot' }],
  });
  const snapshot = observation.operations[2].value;
  assert.equal(snapshot.nodeVersion, receipt.nodeVersion);
  assert.equal(snapshot.nodeSha256, receipt.nodeSha256);
  assert.equal(
    snapshot.evaluations.find(({ url }) => url.endsWith('/entry.mjs')).sha256,
    receipt.files[0].sha256,
  );
});

for (const specifier of ['outside.mjs', 'unbuilt.ts', 'native.node']) {
  test(`actual ${specifier} outside roster refuses and remains latched after a swallowed failure`, () => {
    const { observation } = actualWorker({
      files: {
        'unbuilt.ts': "export const marker: string = 'ts';",
        'native.node': 'not a native addon',
      },
      operations: [
        { type: 'import', file: specifier },
        { type: 'import', file: 'late.mjs' },
        { type: 'snapshot' },
        { type: 'assertValid' },
      ],
    });
    assert.equal(observation.operations[0].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
    assert.equal(observation.operations[1].value, 'late');
    assert.equal(observation.operations[2].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
    assert.equal(observation.operations[3].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
  });
}

for (const specifier of [
  'data:text/javascript,export const marker=1',
  'https://unbound.invalid/module.mjs',
]) {
  test(`unsupported ${specifier.split(':')[0]} import refuses before unbound module evaluation`, () => {
    const { observation } = actualWorker({
      operations: [
        { type: 'import', specifier },
        { type: 'import', file: 'late.mjs' },
        { type: 'snapshot' },
      ],
    });
    assert.equal(observation.operations[0].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
    assert.equal(observation.operations[1].value, 'late');
    assert.equal(observation.operations[2].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
  });
}

for (const suffix of ['?alternate=1', '#alternate']) {
  test(`actual file import with ${suffix} refuses even when its physical file is rostered`, () => {
    const { observation } = actualWorker({
      operations: [{ type: 'import', file: `late.mjs${suffix}` }, { type: 'snapshot' }],
    });
    assert.equal(observation.operations[0].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
    assert.match(observation.operations[1].error.message, /unsupported module URL/u);
  });
}

test('native Node resolution errors are latched even when later rostered imports succeed', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'import', file: 'missing.mjs' },
      { type: 'import', file: 'late.mjs' },
      { type: 'snapshot' },
    ],
  });
  assert.equal(observation.operations[0].error.code, 'ERR_MODULE_NOT_FOUND');
  assert.equal(observation.operations[1].value, 'late');
  assert.match(observation.operations[2].error.message, /module resolution failed/u);
});

test('stale bytes before installation refuse without installing an observation', () => {
  refusedInstall(
    { beforeInstallWrites: { 'entry.mjs': "export const marker='changed';" } },
    /changed before worker loading/u,
  );
});

test('actual changed load bytes are refused and cannot be rescued by later valid evaluation', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'write', file: 'entry.mjs', bytes: "export const marker='changed';" },
      { type: 'import' },
      { type: 'import', file: 'late.mjs' },
      { type: 'snapshot' },
    ],
  });
  assert.equal(observation.operations[1].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
  assert.match(observation.operations[1].error.message, /evaluated bytes differ/u);
  assert.equal(observation.operations[2].value, 'late');
  assert.equal(observation.operations[3].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
});

for (const receipt of [
  { schemaVersion: 2 },
  { nodeVersion: '24.19.0' },
  { nodeSha256: '0'.repeat(64) },
  { nodeSha256: 'A'.repeat(64) },
  { nodeSha256: 'a'.repeat(63) },
]) {
  test(`wrong executable/version identity refuses ${JSON.stringify(receipt)}`, () => {
    refusedInstall({ receipt }, /Unbound HTTP worker Node executable/u);
  });
}

for (const files of [[], null, {}]) {
  test(`missing or malformed closed roster refuses ${JSON.stringify(files)}`, () => {
    refusedInstall({ receipt: { files } }, /Missing HTTP build module roster/u);
  });
}

for (const kind of ['typescript', 'addon', 'wasm', 'json']) {
  test(`unadmitted module kind ${kind} refuses rather than selecting a transform`, () => {
    refusedInstall(
      {
        alterReceipt: (receipt) => {
          receipt.files[0].moduleKind = kind;
        },
      },
      /Malformed|Unsupported/u,
    );
  });
}

test('malformed and incorrect member digests refuse before loading', () => {
  for (const digest of ['0'.repeat(64), 'A'.repeat(64), 'short']) {
    refusedInstall(
      {
        alterReceipt: (receipt) => {
          receipt.files[0].sha256 = digest;
        },
      },
      /Malformed|changed before/u,
    );
  }
});

test('duplicate roster members refuse canonical path ambiguity', () => {
  refusedInstall(
    {
      alterReceipt: (receipt) => {
        receipt.files.push({ ...receipt.files[0] });
      },
    },
    /duplicated/u,
  );
});

test('symlink roster aliases refuse while an actual Node import alias remains bound to canonical bytes', () => {
  refusedInstall(
    {
      alterReceipt: (receipt, directory) => {
        symlinkSync(join(directory, 'late.mjs'), join(directory, 'alias.mjs'));
        receipt.files[0].url = pathToFileURL(join(directory, 'alias.mjs')).href;
      },
    },
    /canonical real path/u,
  );
  const { observation } = actualWorker({
    alterReceipt: (_receipt, directory) => {
      symlinkSync(join(directory, 'late.mjs'), join(directory, 'alias.mjs'));
    },
    operations: [{ type: 'import', file: 'alias.mjs' }, { type: 'snapshot' }],
  });
  assert.equal(observation.operations[0].value, 'late');
  assert.ok(observation.operations[1].value.evaluations[0].canonicalURL.endsWith('/late.mjs'));
});

test('query, hash and non-file roster URLs refuse independently of import resolution', () => {
  for (const suffix of ['?query=1', '#fragment']) {
    refusedInstall(
      {
        alterReceipt: (receipt) => {
          receipt.files[0].url += suffix;
        },
      },
      /plain file URL/u,
    );
  }
  refusedInstall(
    {
      alterReceipt: (receipt) => {
        receipt.files[0].url = 'data:text/javascript,export{}';
      },
    },
    /plain file URL/u,
  );
});

test('a real ambiguous .js parsed as ESM cannot satisfy a CommonJS build declaration', () => {
  const { observation } = actualWorker({
    files: { 'ambiguous.js': "export const marker='esm';" },
    roster: ['ambiguous.js'],
    alterReceipt: (receipt) => {
      receipt.files[0].moduleKind = 'commonjs';
    },
    operations: [{ type: 'import', file: 'ambiguous.js' }, { type: 'snapshot' }],
  });
  assert.match(observation.operations[0].error.message, /unexpected module format/u);
  assert.equal(observation.operations[1].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
});

for (const name of ['unbuilt.ts', 'native.node', 'binary.wasm']) {
  test(`roster admission refuses unsupported actual ${name} extensions`, () => {
    refusedInstall(
      { files: { [name]: 'unadmitted bytes' }, roster: [name] },
      /Unsupported HTTP build module kind/u,
    );
  });
}

for (const environment of [
  { NODE_OPTIONS: '--no-warnings' },
  { NODE_PATH: '/explicit/unreviewed/path' },
  { NODE_COMPILE_CACHE: 'unreviewed-cache' },
  { NODE_DISABLE_COMPILE_CACHE: '0' },
]) {
  test(`ambient Node/cache configuration refuses ${Object.keys(environment)[0]}`, () => {
    refusedInstall({ environment }, /fresh worker/u);
  });
}

test('real execArgv and real CJS preloading are refused without replacing module APIs', () => {
  refusedInstall({ execArgv: ['--no-warnings'] }, /fresh worker/u);
  refusedInstall({ preloadCjs: ['child.cjs'] }, /fresh worker/u);
});

test('real NODE_OPTIONS preload executes before observer and is explicitly refused', () => {
  refusedInstall(
    {
      environment: (directory) => ({
        NODE_OPTIONS: '--require ' + JSON.stringify(join(directory, 'child.cjs')),
      }),
    },
    /fresh worker/u,
  );
});

test('ESM preimport remains an explicit supervisor/preloader limitation, never complete custody', () => {
  const { observation } = actualWorker({ preloadEsm: ['outside.mjs'] });
  assert.equal(observation.preloadWitness, true);
  const snapshot = observation.operations[1].value;
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.readinessPromoting, false);
  assert.equal(
    snapshot.evaluations.some(({ url }) => url.endsWith('/outside.mjs')),
    false,
  );
});

test('close deregisters actual hooks, is idempotent and invalidates all subsequent snapshots', () => {
  const { observation } = actualWorker({
    operations: [
      { type: 'import', file: 'late.mjs' },
      { type: 'snapshot' },
      { type: 'close' },
      { type: 'close' },
      { type: 'import', file: 'outside.mjs' },
      { type: 'snapshot' },
      { type: 'assertValid' },
    ],
  });
  assert.equal(observation.operations[2].value, 'closed');
  assert.equal(observation.operations[3].value, 'closed');
  assert.equal(observation.operations[4].value, 'outside');
  assert.match(observation.operations[5].error.message, /observation ended/u);
  assert.equal(observation.operations[6].error.code, 'HTTP_MODULE_CUSTODY_INVALID');
});
