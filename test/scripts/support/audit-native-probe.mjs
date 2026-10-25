// Executes the actual audit entrypoints with all child/filesystem effects intercepted.
// No package-manager audit, network, dependency installation or policy mutation occurs.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { createHash } from 'node:crypto';
const [sourceRoot] = process.argv.slice(2);
const observations = [];
async function load(kind, scenario = 'import') {
  const relative = `scripts/audit-${kind}-dependencies.mjs`;
  const source = readFileSync(path.join(sourceRoot, relative), 'utf8');
  const identifier = `file:///synthetic/stynx/${relative}`;
  const trace = [], stdout = [], stderr = [];
  const sentinel = new Error('audit child sentinel');
  let reads = 0;
  Object.defineProperty(sentinel, 'stdout', { get() {
    trace.push('error.stdout:' + ++reads);
    if (scenario === 'empty') return '';
    if (scenario === 'nonstring') return 7;
    return '{}';
  }});
  const fakeProcess = {
    argv: ['node', scenario === 'import' ? '/synthetic/no-entry' : url.fileURLToPath(identifier)],
    stdout: { write(value) { stdout.push(value); } },
    stderr: { write(value) { stderr.push(value); } },
    exit(code) { trace.push(['exit', code]); throw new Error('unexpected process exit'); },
  };
  const context = vm.createContext({ process: fakeProcess, URL });
  const child = { execFileSync(command, args, options) {
    trace.push(['spawn', command, args, options]);
    if (['recover', 'empty', 'nonstring'].includes(scenario)) throw sentinel;
    return '['; // Distinct parse signature from the invalid version document.
  }};
  const fs = { readFileSync(filename, encoding) {
    trace.push(['read', filename, encoding]);
    if (scenario === 'version-null') return 'null';
    if (scenario === 'version-invalid') return '{invalid-version';
    return '{"version":"2.265.0"}';
  }};
  const modules = new Map();
  const module = new vm.SourceTextModule(source, { context, identifier, initializeImportMeta(meta) { meta.url = identifier; } });
  await module.link(specifier => {
    const values = { 'node:child_process': child, 'node:fs': fs, 'node:path': path, 'node:url': url }[specifier];
    assert.ok(values, `unintercepted import ${specifier}`);
    if (!modules.has(specifier)) modules.set(specifier, new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }));
    return modules.get(specifier);
  });
  let error;
  try { await module.evaluate(); } catch (caught) { error = caught; }
  return { module, error, sentinel, trace, stdout, stderr, hash: createHash('sha256').update(source).digest('hex') };
}
const ws = await load('workspace'), cdk = await load('cdk');
assert.equal(ws.error, undefined); assert.equal(cdk.error, undefined);
const fresh = value => JSON.parse(JSON.stringify(value));
const advisory = paths => ({ github_advisory_id: 'GHSA-vfj7-8cjw-p6xm', module_name: 'braces', severity: 'high', patched_versions: '<0.0.0', findings: [{ paths }] });
const finding = overrides => ({ severity: 'high', nodes: ['node_modules/aws-cdk-lib/node_modules/brace-expansion'], via: [{ url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr' }], ...overrides });
function observe(name, fn) {
  try { observations.push({ name, value: JSON.parse(JSON.stringify(fn())) }); }
  catch (error) { observations.push({ name, error: { name: error.name, message: error.message, code: error.code } }); }
}
const workspace = value => ws.module.namespace.classifyWorkspaceAudit(fresh(value), { today: '2026-10-25' });
const classify = (value, version = '2.265.0') => cdk.module.namespace.classifyCdkAudit(fresh(value), version);
observe('workspace unknown severity skips malformed findings', () => workspace({ advisories: { one: { severity: 'unknown', findings: 'not-an-array' } } }));
observe('workspace scalar string paths remain flatMap success', () => workspace({ advisories: { one: advisory('docs/site > braces') } }));
observe('workspace numeric path retains native split refusal', () => workspace({ advisories: { one: advisory(7) } }));
observe('workspace string findings retain native flatMap refusal', () => workspace({ advisories: { one: { ...advisory([]), findings: 'bad' } } }));
observe('cdk unknown severity skips malformed nodes', () => classify({ vulnerabilities: { 'brace-expansion': { severity: 'unknown', nodes: null } } }));
observe('cdk version admission precedes malformed nodes', () => classify({ vulnerabilities: { 'brace-expansion': finding({ nodes: null }) } }, 'different'));
observe('cdk string nodes retain native every refusal', () => classify({ vulnerabilities: { 'brace-expansion': finding({ nodes: 'node_modules/aws-cdk-lib/node_modules/brace-expansion' }) } }));
observe('cdk null via retains native url read refusal', () => classify({ vulnerabilities: { 'brace-expansion': finding({ via: [null] }) } }));
for (const kind of ['workspace', 'cdk']) {
  for (const scenario of ['recover', 'empty', 'nonstring']) {
    const result = await load(kind, scenario);
    if (scenario === 'recover') assert.equal(result.error, undefined);
    else assert.equal(result.error, result.sentinel);
    const reads = result.trace.filter(row => typeof row === 'string');
    assert.equal(reads.length, scenario === 'recover' ? 3 : scenario === 'empty' ? 2 : 1);
    observations.push({ name: `${kind} CLI ${scenario}`, trace: result.trace, stdout: result.stdout, stderr: result.stderr, error: result.error ? { name: result.error.name, message: result.error.message, sameSentinel: result.error === result.sentinel } : null });
  }
}
for (const scenario of ['version-invalid', 'version-null']) {
  const result = await load('cdk', scenario);
  assert.ok(result.error);
  observations.push({ name: `cdk ${scenario} before malformed report`, trace: result.trace, stdout: result.stdout, stderr: result.stderr, error: { name: result.error.name, message: result.error.message } });
}
console.log(JSON.stringify({ sourceRoot, hashes: { workspace: ws.hash, cdk: cdk.hash }, actualEffects: [], observations }));
