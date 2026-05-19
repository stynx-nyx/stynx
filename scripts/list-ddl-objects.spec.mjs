import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectDdlObjects, formatCsv } from './list-ddl-objects.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadObjects() {
  return collectDdlObjects({ repoRoot });
}

function findObject(objects, expected) {
  return objects.find((object) => (
    object.schema === expected.schema &&
    object.name === expected.name &&
    object.type === expected.type &&
    (expected.target === undefined || object.target === expected.target)
  ));
}

test('collectDdlObjects discovers representative extensions, functions, triggers, policies, and tables', () => {
  const objects = loadObjects();

  for (const expected of [
    { schema: 'public', name: 'pgcrypto', type: 'extension' },
    { schema: 'public', name: 'uuid-ossp', type: 'extension' },
    { schema: 'auth', name: 'set_user_context', type: 'function' },
    { schema: 'audit', name: 'verify_chain', type: 'function' },
    { schema: 'audit', name: 'audit_events_set_row_hash', type: 'trigger', target: 'audit.events' },
    { schema: 'audit', name: 'tenant_scope', type: 'policy', target: 'audit.events' },
    { schema: 'storage', name: 'files', type: 'table' },
  ]) {
    assert.ok(findObject(objects, expected), `expected ${expected.schema}.${expected.name} ${expected.type}`);
  }
});

test('collectDdlObjects includes helper-created trigger and RLS policy objects', () => {
  const objects = loadObjects();

  assert.ok(findObject(objects, {
    schema: 'storage',
    name: 'trig_storage_files_enforce_tenant',
    type: 'trigger',
    target: 'storage.files',
  }));
  assert.ok(findObject(objects, {
    schema: 'storage',
    name: 'tenant_scope',
    type: 'policy',
    target: 'storage.files',
  }));
  assert.ok(findObject(objects, {
    schema: 'auth',
    name: 'tenant_isolation',
    type: 'policy',
    target: 'auth.tenancies',
  }));
});

test('formatCsv emits the required stable CSV columns', () => {
  const objects = loadObjects();
  const csv = formatCsv(objects);

  assert.match(csv, /^schema,name,type,source_file,line,target\n/);
  assert.match(csv, /^public,pgcrypto,extension,db\/ddl\/00-extensions\.sql,4,/m);
  assert.match(csv, /^audit,audit_events_set_row_hash,trigger,db\/ddl\/02-audit\.sql,94,audit\.events$/m);
  assert.deepEqual(
    objects.map((object) => [object.source_file, object.line]),
    objects.map((object) => [object.source_file, object.line]).toSorted(([leftFile, leftLine], [rightFile, rightLine]) => (
      leftFile.localeCompare(rightFile) || leftLine - rightLine
    )),
  );
});
