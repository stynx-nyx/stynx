import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { OUTBOX_STORAGE_CATALOG } from '../../packages/outbox/src/storage-catalog.generated.ts';

const root = resolve(import.meta.dirname, '../..');
const guard = 'scripts/verify-outbox-storage-references.mjs';

function fixture(t, source, sourcePath = 'packages/outbox/src/probe.ts') {
  const directory = mkdtempSync(join(tmpdir(), 'stynx outbox closure á-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const path of [guard, 'packages/outbox/src/storage-catalog.generated.ts']) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(root, path), join(directory, path));
  }
  for (const entry of OUTBOX_STORAGE_CATALOG.sources) {
    mkdirSync(dirname(join(directory, entry.path)), { recursive: true });
    cpSync(join(root, entry.path), join(directory, entry.path));
  }
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(join(directory, sourcePath)), { recursive: true });
  writeFileSync(join(directory, sourcePath), source);
  return directory;
}
function run(directory) {
  const result = spawnSync(process.execPath, [guard], { cwd: directory, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test('runtime closure accepts relative import paths and reporting labels alongside known SQL', (t) => {
  const directory = fixture(
    t,
    `import './outbox.consumer-not-a-table';
    const label = 'outbox.events';
    const query = 'select event_id from outbox.event_retirements';`,
  );
  const result = run(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /references and manifest sources agree/u);
});

test('runtime closure rejects a genuine undeclared SQL relation', (t) => {
  const result = run(fixture(t, `const query = 'select * from outbox.unregistered_evidence';`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown outbox object unregistered_evidence/u);
});

test('runtime closure rejects interpolated relation names outside the registered lock', (t) => {
  const result = run(fixture(t, 'const query = `select * from outbox.${callerTable}`;'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unregistered dynamic outbox SQL reference/u);
});

test('runtime closure admits only closed known cutover lock targets', (t) => {
  const known = run(
    fixture(
      t,
      "const targets = ['events', 'event_delivery']; const query = `lock table outbox.${target} in access exclusive mode`;",
    ),
  );
  assert.equal(known.status, 0, known.stderr);
  const unknown = run(
    fixture(
      t,
      "const targets = ['events', 'unregistered_evidence']; const query = `lock table outbox.${target} in access exclusive mode`;",
    ),
  );
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /cutover targets outside closed inventory/u);
});

test('runtime closure refuses drift in a digest-bound migration source', (t) => {
  const directory = fixture(t, "const query = 'select * from outbox.events';");
  const migration = 'packages/data/migrations/platform/0026_outbox_event_retirement.sql';
  writeFileSync(
    join(directory, migration),
    readFileSync(join(directory, migration), 'utf8') + '\n-- drift\n',
  );
  const result = run(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifest source drift: .*0026_outbox_event_retirement/u);
});

test('runtime closure parses quoted identifiers, folded SQL case, and source files nested below src', (t) => {
  const accepted = run(
    fixture(
      t,
      `const query = 'SELECT e.id FROM "outbox"."events" e';
    const other = 'SELECT event_id FROM OUTBOX.EVENT_RETIREMENTS';`,
      'packages/outbox/src/nested/probe.ts',
    ),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const rejected = run(
    fixture(
      t,
      `const query = 'select * from "outbox"."Unregistered"';`,
      'packages/outbox/src/nested/probe.ts',
    ),
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unknown outbox object Unregistered/u);
});

test('runtime closure resolves literal concatenation and rejects a caller-controlled relation suffix', (t) => {
  const accepted = run(
    fixture(
      t,
      `const table = 'event_retirements'; const query = 'select ' + 'event_id from outbox.' + table;`,
    ),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const rejected = run(fixture(t, `const query = 'select * from outbox.' + callerTable;`));
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unregistered dynamic outbox SQL reference/u);
});

test('runtime closure resolves constant template relations before validating their columns', (t) => {
  const accepted = run(
    fixture(t, "const table = 'events'; const query = `select id from outbox.${table}`;"),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const rejected = run(
    fixture(
      t,
      "const table = 'events'; const query = `select unregistered_column from outbox.${table}`;",
    ),
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unknown outbox column events.unregistered_column/u);
});

test('runtime closure rejects missing SELECT, INSERT and UPDATE columns and incorrect function arity', (t) => {
  for (const [sql, finding] of [
    [
      'select e.unregistered_column from outbox.events e',
      /unknown outbox column events.unregistered_column/u,
    ],
    [
      "insert into outbox.event_retirements(unregistered_column) values ('x')",
      /unknown outbox column event_retirements.unregistered_column/u,
    ],
    [
      "update outbox.event_delivery set unregistered_column='x'",
      /unknown outbox column event_delivery.unregistered_column/u,
    ],
    ['select outbox.event_uuid(1)', /unknown outbox function signature event_uuid\/1/u],
  ]) {
    const result = run(fixture(t, `const query = ${JSON.stringify(sql)};`));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, finding);
  }
});
