import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { installHttpModuleCustody } from './http-module-custody.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error(message);
};
let custody;
let job;
let terminalSent = false;

function send(kind, result) {
  if (!process.send || terminalSent) fail('Worker has no private channel or already terminated');
  const frame = {
    schemaVersion: 1,
    kind,
    nonce: job.nonce,
    candidateCommit: job.candidateCommit,
    pid: process.pid,
    result,
  };
  if (Buffer.byteLength(JSON.stringify(frame)) > 32 * 1024 * 1024)
    fail('Worker result exceeds supported bound');
  if (kind === 'terminal') terminalSent = true;
  return new Promise((accept, reject) =>
    process.send(frame, (error) => (error ? reject(error) : accept())),
  );
}

try {
  if (process.argv.length !== 3 || process.execArgv.length || !process.send)
    fail('Worker requires exact private startup');
  const descriptor = realpathSync(process.argv[2]);
  const stat = lstatSync(descriptor);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 64 * 1024 * 1024)
    fail('Invalid private worker descriptor');
  const bytes = readFileSync(descriptor);
  if (digest(bytes) !== process.env.STYNX_HTTP_JOB_SHA256)
    fail('Private worker descriptor changed');
  job = JSON.parse(bytes.toString('utf8'));
  if (
    job.schemaVersion !== 1 ||
    job.mode !== 'bootstrap-module-only' ||
    job.compositionId !== 'reference' ||
    !/^[a-f0-9]{40}$/u.test(job.candidateCommit) ||
    !/^[a-f0-9]{40}$/u.test(job.tree) ||
    !/^[a-f0-9-]{36}$/u.test(job.nonce) ||
    job.parentPid !== process.ppid ||
    job.descriptorPath !== descriptor ||
    process.cwd() !== job.checkoutRoot ||
    realpathSync(process.cwd()) !== job.checkoutRoot ||
    realpathSync(process.execPath) !== job.nodePath ||
    digest(readFileSync(process.execPath)) !== job.nodeSha256 ||
    process.versions.node !== '24.20.0' ||
    process.platform !== job.platform ||
    process.arch !== job.arch ||
    process.argv[1] !== fileURLToPath(import.meta.url) ||
    JSON.stringify(
      Object.keys(process.env)
        .filter((name) => name !== 'STYNX_HTTP_JOB_SHA256')
        .sort(),
    ) !== JSON.stringify(Object.keys(job.environment).sort())
  )
    fail('Private worker process context differs');
  for (const [name, sha256] of Object.entries(job.environment))
    if (digest(process.env[name] ?? '') !== sha256) fail('Private worker environment changed');
  for (const row of job.controls) {
    const path = resolve(job.checkoutRoot, row.path);
    const actual = lstatSync(path);
    const contents = readFileSync(path);
    if (
      !actual.isFile() ||
      realpathSync(path) !== path ||
      (actual.mode & 0o7777) !== row.permissions ||
      contents.length !== row.byteLength ||
      digest(contents) !== row.sha256
    )
      fail('Private worker control bytes changed');
  }
  custody = installHttpModuleCustody(job.receipt);
  await send('start', { mode: job.mode });
  // No application/dependency static import precedes custody installation.
  createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata');
  await import('./http-runtime-census.mjs');
  const { observeReferenceBootstrapModule } = await import('./http-runtime-bindings.mjs');
  const observation = await observeReferenceBootstrapModule(job);
  custody.assertValid();
  const modules = custody.snapshot();
  for (const path of [
    'scripts/lib/http-runtime-census.mjs',
    'scripts/lib/http-runtime-bindings.mjs',
    job.bootstrap.emitted.path,
  ]) {
    const url = pathToFileURL(resolve(job.checkoutRoot, path)).href;
    if (!modules.evaluations.some((row) => row.canonicalURL === url))
      fail('Required runtime module evaluation missing');
  }
  await send('terminal', {
    observation,
    modules,
    trustedBootstrap: job.controls.filter((row) =>
      ['scripts/lib/http-runtime-worker.mjs', 'scripts/lib/http-module-custody.mjs'].includes(
        row.path,
      ),
    ),
    readinessPromoting: false,
    runtimeCustodyComplete: false,
  });
  custody.assertValid();
  if (!isDeepStrictEqual(custody.snapshot(), modules))
    fail('Runtime module population changed during terminal delivery');
  custody.close();
  custody = undefined;
  process.disconnect();
} catch {
  // Candidate/runtime exception messages can contain private configuration.
  // The parent receives only a fixed diagnostic, never arbitrary raw errors.
  process.stderr.write('HTTP runtime bootstrap worker refused\n');
  process.exitCode = 1;
  custody?.close();
  if (process.connected) process.disconnect();
}
