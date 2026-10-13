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
import { OFFLINE_STORAGE_CATALOG } from '../../packages/offline-sync/src/storage-catalog.generated.ts';

const root = resolve(import.meta.dirname, '../..');
const guard = 'scripts/verify-offline-storage-references.mjs';
function fixture(
  t,
  source = "const query = 'select id from offline.numbering_ranges';",
  sourcePath = 'packages/offline-sync/src/independent-probe.ts',
) {
  const directory = mkdtempSync(join(tmpdir(), 'stynx offline closure á-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'packages/offline-sync'), { recursive: true });
  cpSync(join(root, 'packages/offline-sync/src'), join(directory, 'packages/offline-sync/src'), {
    recursive: true,
  });
  for (const path of [guard, ...OFFLINE_STORAGE_CATALOG.sources.map((entry) => entry.path)]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(root, path), join(directory, path));
  }
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(join(directory, sourcePath)), { recursive: true });
  writeFileSync(join(directory, sourcePath), source);
  return directory;
}
function run(directory) {
  const result = spawnSync(process.execPath, [guard], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function alter(directory, path, before, after) {
  const full = join(directory, path),
    source = readFileSync(full, 'utf8');
  assert.ok(source.includes(before), `Missing intended fixture mutation: ${path}`);
  writeFileSync(full, source.replace(before, after));
}

test('offline closure accepts reporting/import labels and independent aliases in UNION and nested statements', (t) => {
  const directory = fixture(
    t,
    `import './offline.not-a-relation';
    const label = 'offline.numbering_ranges';
    const query = 'select r.id from offline.numbering_ranges r union all select r.id from offline.numbering_reservations r';
    const nested = 'select r.id from offline.numbering_ranges r where exists(select 1 from offline.numbering_reservations r where r.range_id is not null)';`,
  );
  const result = run(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Offline runtime references and manifest sources agree/u);
});

for (const [name, sql, finding] of [
  [
    'relation',
    'select * from offline.unregistered_history',
    /unknown offline object unregistered_history/u,
  ],
  [
    'column',
    'select r.unregistered_column from offline.numbering_ranges r',
    /unknown offline column numbering_ranges.unregistered_column/u,
  ],
  [
    'function',
    'select offline.unregistered_function(1)',
    /unknown offline function signature unregistered_function\/1/u,
  ],
])
  test(`offline closure rejects an unknown ${name}`, (t) => {
    const result = run(fixture(t, `const query = ${JSON.stringify(sql)};`));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, finding);
  });

test('offline closure rejects a new dynamic SQL producer even when its current relation could be known', (t) => {
  const result = run(fixture(t, 'const query = `select * from offline.${callerTable}`;'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unregistered dynamic offline SQL producer/u);
});

test('offline closure refuses changed producer inputs with unchanged reviewed SQL templates', (t) => {
  const directory = fixture(t);
  alter(
    directory,
    'packages/offline-sync/src/import-state.ts',
    'const row = { ...record.row }',
    'const row = { ...record.row, ...unreviewedInput }',
  );
  const result = run(directory);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /import-state\.ts: dynamic SQL producer source changed without review/u,
  );
});

test('offline closure rejects an import primary-key projection that differs from the closed catalog', (t) => {
  const directory = fixture(t);
  alter(
    directory,
    'packages/offline-sync/src/import-validation.ts',
    "ranges: ['id']",
    "ranges: ['tenant_id', 'id']",
  );
  const result = run(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Import primary-key projection differs: numbering_ranges/u);
});

test('offline closure rejects nullable import projection drift without accepting a narrower source DTO', (t) => {
  const directory = fixture(t);
  alter(
    directory,
    'packages/offline-sync/src/import-schema.generated.ts',
    "shift_id: { anyOf: [{ $ref: '#/$defs/text' }, { type: 'null' }] }",
    "shift_id: { $ref: '#/$defs/text' }",
  );
  const result = run(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /(?:null|schema|projection|source drift)/iu);
});

for (const [name, source, finding] of [
  [
    'output alias cannot authorize its nonexistent input column',
    "const query = 'select nonexistent as nonexistent from offline.numbering_ranges';",
    /unknown offline (?:input )?column (?:numbering_ranges\.)?nonexistent/u,
  ],
  [
    'unqualified column must exist across joined offline relations',
    "const query = 'select nonexistent from offline.numbering_ranges r join offline.numbering_reservations s on s.range_id=r.id';",
    /(?:unknown|unresolved|ambiguous).*column.*nonexistent/iu,
  ],
  [
    'function parameter shadowing cannot use a file-global literal binding',
    "const relation='numbering_ranges'; function read(relation) { return database.query(`select * from offline.${relation}`); }",
    /(?:unregistered dynamic|unresolved)/iu,
  ],
  [
    'array join cannot hide a caller-selected SQL relation',
    "database.query(['select * from ', 'offline', '.', callerTable].join(''));",
    /(?:unregistered dynamic|unresolved)/iu,
  ],
])
  test(`offline closure rejects: ${name}`, (t) => {
    const result = run(fixture(t, source));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, finding);
  });

test('offline closure refuses even constant array joins until that SQL builder is explicitly reviewed', (t) => {
  const result = run(
    fixture(t, "database.query(['select id from ', 'offline', '.', 'numbering_ranges'].join(''));"),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unresolved/iu);
});

for (const [name, source] of [
  [
    'String.raw SQL builder',
    'database.query(String.raw`select id from offline.numbering_ranges`);',
  ],
  [
    'same-name output alias on batches',
    "const query='select future_missing as future_missing from offline.sync_batches';",
  ],
  [
    'correlated nonexistent input',
    "const query='select r.id from offline.numbering_ranges r where exists(select 1 from offline.numbering_reservations s where r.future_missing=s.range_id)';",
  ],
])
  test(`offline closure rejects ${name}`, (t) => {
    const result = run(fixture(t, source));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(?:unresolved|unknown.*column)/iu);
  });
for (const [name, before, after] of [
  [
    'missing persisted instant',
    "sync_batches: ['lease_expires_at', 'created_at', 'updated_at']",
    "sync_batches: ['lease_expires_at', 'updated_at']",
  ],
  [
    'wrong instant column',
    "sync_item_attempts: ['created_at']",
    "sync_item_attempts: ['idempotency_key']",
  ],
])
  test(`offline closure rejects ${name} coverage in a reviewed dynamic producer`, (t) => {
    const directory = fixture(t);
    alter(directory, 'packages/offline-sync/src/storage-invariants.ts', before, after);
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(?:source changed without review|instant|column)/iu);
  });

for (const [name, source] of [
  ['element query call', "trx['query']('select bad_column from offline.sync_batches');"],
  [
    'bound query alias',
    "const invoke=trx.query.bind(trx); invoke('select id from offline.numbering_ranges');",
  ],
  [
    'destructured query alias',
    "const {query}=trx; query('select id from offline.numbering_ranges');",
  ],
])
  test(`offline closure rejects ${name} outside its reviewed direct-call boundary`, (t) => {
    const result = run(fixture(t, source));
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /(?:unknown.*column|unresolved|method|query.*alias|extraction|unsupported computed invocation)/iu,
    );
  });

for (const [name, source] of [
  [
    'quoted destructured query method',
    "const {'query':execute}=trx; execute('select id from offline.numbering_ranges');",
  ],
  [
    'mutable computed invocation',
    "let method='query'; trx[method]('select id from offline.numbering_ranges');",
  ],
])
  test(`offline closure rejects ${name} outside registered producer source`, (t) => {
    const result = run(fixture(t, source));
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /(?:unresolved|method|query.*alias|extraction|unsupported computed invocation)/iu,
    );
  });
test('offline closure refuses a changed SQL helper even when every caller template is unchanged', (t) => {
  const directory = fixture(t);
  const path = 'packages/offline-sync/src/listing.ts';
  alter(directory, path, '${column} at time zone', 'unreviewed_column at time zone');
  const result = run(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /listing\.ts: dynamic SQL producer source changed without review/u);
});

for (const [name, addition, finding] of [
  [
    'quoted role literal',
    "DO $$ BEGIN PERFORM 'stynx_owner'; END $$;",
    /Unsupported quoted offline role token/u,
  ],
  [
    'reader-only policy',
    'CREATE POLICY future_reader_only ON offline.sync_batches TO stynx_reader USING (true);',
    /Unsupported offline policy role binding/u,
  ],
  [
    'unreviewed policy role',
    'CREATE POLICY future_custom ON offline.sync_batches TO stynx_app, unreviewed_role USING (true);',
    /Unsupported offline policy role binding/u,
  ],
])
  test(`offline generator rejects ${name} and leaves its last valid artifact unchanged`, (t) => {
    const directory = fixture(t);
    for (const path of [
      'scripts/offline-storage-generate.mjs',
      'tools/migration-linter/src/sql.ts',
      'packages/offline-sync/package.json',
    ]) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      cpSync(join(root, path), join(directory, path));
    }
    const target = join(directory, 'packages/offline-sync/src/storage-template.generated.ts');
    const original = readFileSync(target);
    const migration = join(directory, 'packages/offline-sync/migrations/0008_import_receipts.sql');
    writeFileSync(migration, `${readFileSync(migration, 'utf8')}\n${addition}\n`);
    const result = spawnSync(
      process.execPath,
      ['scripts/offline-storage-generate.mjs', '--write'],
      { cwd: directory, encoding: 'utf8', timeout: 30000 },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, finding);
    assert.deepEqual(readFileSync(target), original);
  });

for (const permission of ['omitted', 'true'])
  test(`import schema generator refuses ${permission} object closure without replacing its valid artifact`, (t) => {
    const directory = fixture(t);
    for (const path of [
      'scripts/offline-import-schema-generate.mjs',
      'law/schemas/offline-import.schema.json',
      'packages/offline-sync/src/import-schema.generated.ts',
    ]) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      cpSync(join(root, path), join(directory, path));
    }
    const schemaPath = join(directory, 'law/schemas/offline-import.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    if (permission === 'omitted') delete schema.$defs.headers.additionalProperties;
    else schema.$defs.headers.additionalProperties = true;
    writeFileSync(schemaPath, JSON.stringify(schema));
    const target = join(directory, 'packages/offline-sync/src/import-schema.generated.ts');
    const original = readFileSync(target);
    const result = spawnSync(
      process.execPath,
      ['scripts/offline-import-schema-generate.mjs', '--write'],
      { cwd: directory, encoding: 'utf8', timeout: 30000 },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Import object rules require false or a schema/u);
    assert.deepEqual(readFileSync(target), original);
  });

// INV-OFFLINE-001: application event identifiers are not truncated into SQL names.
test('offline closure accepts a hyphenated application event while still checking complete relation names', (t) => {
  const accepted = run(
    fixture(
      t,
      "const event = { entity: 'offline.sync-conflict' }; const query = 'select id from offline.numbering_reconciliations';",
    ),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const rejected = run(
    fixture(t, 'const query = \'select * from offline."unregistered-history"\';'),
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unknown offline object unregistered-history/u);
  const exact = run(fixture(t, "const query = 'select * from offline.sync';"));
  assert.notEqual(exact.status, 0);
  assert.match(exact.stderr, /unknown offline object sync/u);
});

test('offline closure refuses changed reconciliation SQL expansion and producer inputs', (t) => {
  const directory = fixture(t);
  alter(
    directory,
    'packages/offline-sync/src/postgres-reconciliation.ts',
    "pgSortInstant('created_at')",
    'pgSortInstant(unreviewedColumn)',
  );
  const rejected = run(directory);
  assert.notEqual(rejected.status, 0);
  assert.match(
    rejected.stderr,
    /postgres-reconciliation\.ts: dynamic SQL producer source changed without review/u,
  );
  assert.match(rejected.stderr, /unregistered dynamic offline SQL producer/u);
});
