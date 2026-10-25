import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { verifyDemoBookmarkStorage } from '../../scripts/lib/demo-bookmark-storage.mjs';

const verifierUrl = new URL('../../scripts/lib/demo-bookmark-storage.mjs', import.meta.url).href;
const versionSql = "select current_setting('server_version_num')::integer as version";
const rolesSql = `select rolname, rolcanlogin, rolsuper, rolbypassrls,
    rolcreaterole, rolcreatedb, rolreplication from pg_catalog.pg_roles
    where rolname = any($1::text[]) order by rolname`;
const roleNames = ['stynx_app', 'stynx_owner', 'stynx_reader'];
const historical = [
  'Drizzle tenant/user foreign keys are absent from historical SQL and the blueprint.',
  'The blueprint URL uniqueness description omits the installed deleted_at IS NULL predicate.',
  'The historical migration comment names an obsolete blueprint location.',
];
const role = (rolname) => ({
  rolname, rolcanlogin: true, rolsuper: false, rolbypassrls: false,
  rolcreaterole: false, rolcreatedb: false, rolreplication: false,
});

function recordingPort(versionRows, roleRows, failureAt = -1) {
  const calls = [];
  const failure = new Error(`driver-${failureAt}`);
  const queryable = {
    async query(sql, params) {
      assert.equal(this, queryable, 'query-only receiver must remain the actual supplied port');
      calls.push({ sql, params, argumentCount: arguments.length });
      if (calls.length === failureAt) throw failure;
      assert.ok(calls.length <= 2, 'wrong role population must stop before a third query');
      return { rows: calls.length === 1 ? versionRows : roleRows };
    },
  };
  return { queryable, calls, failure };
}

function assertExactCalls(calls) {
  assert.equal(calls.length, 2);
  assert.equal(calls[0].sql, versionSql);
  // Existing zero-argument call and the checked executor's [] both bind zero values.
  assert.deepEqual(calls[0].params ?? [], []);
  assert.equal(calls[1].sql, rolesSql);
  assert.deepEqual(calls[1].params, [roleNames]);
}

test('native module import remains pure: no connection, build, child command or filesystem write', () => {
  const program = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import net from 'node:net';
    import tls from 'node:tls';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const effects = [];
    const block = (target, key, label) => {
      target[key] = function () { effects.push(label); throw new Error('Impure import: ' + label); };
    };
    for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) block(childProcess, key, 'process.' + key);
    for (const key of ['connect', 'createConnection']) block(net, key, 'net.' + key);
    block(net.Socket.prototype, 'connect', 'socket.connect');
    block(tls, 'connect', 'tls.connect');
    for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync', 'unlink', 'unlinkSync', 'rm', 'rmSync', 'createWriteStream']) block(fs, key, 'fs.' + key);
    for (const key of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rm']) block(fs.promises, key, 'fs.promises.' + key);
    syncBuiltinESMExports();
    const imported = await import(${JSON.stringify(verifierUrl)});
    assert.equal(typeof imported.verifyDemoBookmarkStorage, 'function');
    assert.equal(typeof imported.renderDemoBookmarkStorage, 'function');
    assert.equal(typeof imported.installDemoBookmarkStorage, 'function');
    assert.deepEqual(effects, []);
    process.stdout.write(JSON.stringify({ pure: true, effects, node: process.version }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.pure, true);
  assert.deepEqual(result.effects, []);
  assert.match(result.node, /^v24\./u);
});

for (const count of [0, 1, 2, 4]) {
  test(`wrong fixed-role population ${count} stops after exactly two actual queries`, async () => {
    const rows = Array.from({ length: count }, (_unused, index) => role(roleNames[index] ?? 'extra-role'));
    const port = recordingPort([{ version: 170000 }], rows);
    const result = await verifyDemoBookmarkStorage(port.queryable);
    assertExactCalls(port.calls);
    assert.deepEqual(Object.keys(result), ['contractVersion', 'supported', 'checks', 'historicalModelDifferences']);
    assert.equal(result.contractVersion, 'demo-bookmark-storage/1');
    assert.equal(result.supported, false);
    assert.deepEqual(result.checks.map(({ id, status }) => ({ id, status })), [
      { id: 'supported-postgresql', status: 'pass' }, { id: 'fixed-roles', status: 'fail' },
    ]);
    assert.equal(result.checks[0].actual, 170000);
    assert.equal(result.checks[1].actual, rows);
    assert.deepEqual(result.historicalModelDifferences, historical);
  });
}

for (const version of [0, -1, 150000, 159999, 190000, 200000]) {
  test(`physical unsupported server version ${version} becomes report FAIL, never a validation exception`, async () => {
    const port = recordingPort([{ version }], [role('stynx_app')]);
    const result = await verifyDemoBookmarkStorage(port.queryable);
    assertExactCalls(port.calls);
    assert.deepEqual(result.checks[0], { id: 'supported-postgresql', status: 'fail', actual: version });
    assert.equal(result.supported, false);
  });
}

for (const version of [160000, 169999, 170000, 180000, 189999]) {
  test(`supported physical server version ${version} retains report PASS before role refusal`, async () => {
    const port = recordingPort([{ version }], []);
    const result = await verifyDemoBookmarkStorage(port.queryable);
    assertExactCalls(port.calls);
    assert.deepEqual(result.checks[0], { id: 'supported-postgresql', status: 'pass', actual: version });
    assert.equal(result.supported, false);
  });
}

for (const rows of [[], [{ version: 170000 }, { version: 180000 }]]) {
  test(`version cardinality ${rows.length} is a caller FAIL and keeps the first observation`, async () => {
    const port = recordingPort(rows, []);
    const result = await verifyDemoBookmarkStorage(port.queryable);
    assertExactCalls(port.calls);
    assert.deepEqual(result.checks[0], { id: 'supported-postgresql', status: 'fail', actual: rows[0]?.version });
  });
}

test('reported actual evidence retains original outer-array, row, nested and own __proto__ identity', async () => {
  const opaque = { bigint: 1n, date: new Date(0), absent: undefined };
  const rows = [role('stynx_reader'), role('stynx_owner')];
  rows[0].extra_value = opaque;
  Object.defineProperty(rows[0], '__proto__', { value: opaque, enumerable: true });
  Object.defineProperty(rows, 'opaque_array_property', { value: opaque, enumerable: true });
  const port = recordingPort([{ version: 170000, version_metadata: opaque }], rows);
  const result = await verifyDemoBookmarkStorage(port.queryable);
  assertExactCalls(port.calls);
  const actual = result.checks[1].actual;
  assert.equal(actual, rows);
  assert.equal(actual[0], rows[0]);
  assert.equal(actual[1], rows[1]);
  assert.equal(actual[0].extra_value, opaque);
  assert.equal(Object.getOwnPropertyDescriptor(actual[0], '__proto__').value, opaque);
  assert.equal(actual.opaque_array_property, opaque);
  assert.deepEqual(actual.map((row) => row.rolname), ['stynx_reader', 'stynx_owner']);
  assert.equal(Object.isFrozen(actual), false);
});

for (const failureAt of [1, 2]) {
  test(`query ${failureAt} error identity is propagated without another query`, async () => {
    const port = recordingPort([{ version: 170000 }], [], failureAt);
    await assert.rejects(verifyDemoBookmarkStorage(port.queryable), (error) => error === port.failure);
    assert.equal(port.calls.length, failureAt);
    assert.equal(port.calls[0].sql, versionSql);
    if (failureAt === 2) assertExactCalls(port.calls);
  });
}

for (const queryable of [null, undefined, {}, { query: true }]) {
  test(`invalid queryable ${String(queryable)} retains the original refusal`, async () => {
    await assert.rejects(verifyDemoBookmarkStorage(queryable), { message: 'Demo storage verifier requires a queryable' });
  });
}
