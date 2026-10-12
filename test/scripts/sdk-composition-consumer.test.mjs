import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import * as ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const baseline = '03f9a6ae8938dfaa64a33870d60f9f8b448efe10';
let fixture;
let sdk;

before(async () => {
  fixture = mkdtempSync(join(tmpdir(), 'stynx-sdk-consumer-é '));
  const archiveDir = join(fixture, 'archives');
  mkdirSync(archiveDir);
  execFileSync('pnpm', ['pack', '--pack-destination', archiveDir], {
    cwd: join(root, 'packages-web/sdk'),
    stdio: 'pipe',
    timeout: 30000,
  });
  const archives = readdirSync(archiveDir).filter((file) => file.endsWith('.tgz'));
  assert.equal(archives.length, 1, 'consume exactly the real packed SDK');
  const installed = join(fixture, 'node_modules/@stynx-nyx/sdk');
  mkdirSync(installed, { recursive: true });
  execFileSync('tar', [
    '-xzf',
    join(archiveDir, archives[0]),
    '-C',
    installed,
    '--strip-components=1',
  ]);
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
  const require = createRequire(join(fixture, 'consumer.mjs'));
  sdk = await import(pathToFileURL(require.resolve('@stynx-nyx/sdk')).href);
});

after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

class CapturingRequest {
  constructor(config) {
    this.config = config;
    this.calls = [];
  }
  request(options) {
    this.calls.push(structuredClone(options));
    return Promise.resolve({ receivedByTransport: true });
  }
}

function historicalMethods() {
  const files = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', baseline, 'packages-web/sdk/src/generated/services'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return files.flatMap((file) => {
    const text = execFileSync('git', ['show', `${baseline}:${file}`], {
      cwd: root,
      encoding: 'utf8',
    });
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    return source.statements.filter(ts.isClassDeclaration).flatMap((declaration) =>
      declaration.members.filter(ts.isMethodDeclaration).map((member) => ({
        service: declaration.name.text,
        method: member.name.getText(source),
        file,
      })),
    );
  });
}

test('packed public SDK preserves every one of the 211 immutable historical service methods', () => {
  const methods = historicalMethods();
  assert.equal(methods.length, 211);
  const client = new sdk.GeneratedStynxSdk({}, CapturingRequest);
  for (const { service, method, file } of methods) {
    assert.equal(typeof sdk[service], 'function', `${file}: public service disappeared`);
    assert.equal(
      typeof sdk[service].prototype[method],
      'function',
      `${service}.${method} disappeared`,
    );
    assert.ok(
      Object.values(client).some(
        (value) => value instanceof sdk[service] && typeof value[method] === 'function',
      ),
      `${service}.${method} is no longer reachable from the public client`,
    );
  }
  assert.deepEqual(client.request.calls, [], 'discovery must not perform transport work');
});

const pairCalls = [
  {
    path: '/offline-sync/conflicts/{id}/resolve',
    suffix: 'PostOfflineSyncConflictsByIdResolveResolveConflict',
    id: '6cd451a8-0893-4c21-8a94-f4a29a537c80',
    body: { resolution: 'server-wins', description: 'Inspected consumer transport' },
  },
  {
    path: '/offline-sync/numbering-reservations',
    suffix: 'PostOfflineSyncNumberingReservationsReserveNumbering',
    body: { orgUnitId: 'unit-1', deviceId: 'device-1', entityType: 'document', requestedSize: 3 },
    e6: { shiftId: 'shift-1' },
    ctg9: { shiftId: null },
  },
  {
    path: '/offline-sync/numbering-reservations/{id}/cancel',
    suffix: 'PostOfflineSyncNumberingReservationsByIdCancelCancelNumbering',
    id: '29db1f3a-5665-4138-a981-a7c2c1f43b07',
    body: { reason: 'Cancelled by consumer request' },
  },
  {
    path: '/offline-sync/sync-batches',
    suffix: 'PostOfflineSyncSyncBatchesSubmitBatch',
    body: { orgUnitId: 'unit-1', deviceId: 'device-1', deviceBatchId: 'batch-1', items: [] },
  },
];

for (const pair of pairCalls) {
  test(`packed E6 and CTG9 clients execute distinct public methods for POST ${pair.path}`, async () => {
    assert.equal(typeof sdk.OfflineCtg9?.GeneratedOfflineCtg9Sdk, 'function');
    assert.notEqual(sdk.OfflineSyncService, sdk.OfflineCtg9.Ctg9OfflineSyncService);
    const clients = [
      {
        client: new sdk.GeneratedStynxSdk({}, CapturingRequest),
        service: 'offlineSync',
        prefix: 'offlineSync',
        extension: pair.e6,
      },
      {
        client: new sdk.OfflineCtg9.GeneratedOfflineCtg9Sdk({}, CapturingRequest),
        service: 'ctg9OfflineSync',
        prefix: 'ctg9OfflineSync',
        extension: pair.ctg9,
      },
    ];
    for (const { client, service, prefix, extension } of clients) {
      const body = { ...pair.body, ...extension };
      const method = `${prefix}${pair.suffix}`;
      assert.equal(typeof client[service][method], 'function', `public variant ${method} absent`);
      assert.deepEqual(
        await client[service][method]({ ...(pair.id ? { id: pair.id } : {}), requestBody: body }),
        { receivedByTransport: true },
      );
      assert.equal(client.request.calls.length, 1);
      const [call] = client.request.calls;
      assert.equal(call.method, 'POST');
      assert.equal(call.url, pair.path);
      assert.deepEqual(call.body, body);
      assert.equal(call.mediaType, 'application/json');
      if (pair.id) assert.deepEqual(call.path, { id: pair.id });
      else assert.equal(call.path, undefined);
    }
  });
}

test('packed declarations retain the E6 string shift and CTG9 nullable shift contracts', () => {
  const body = `import { GeneratedStynxSdk, OfflineCtg9 } from '@stynx-nyx/sdk';
const e6 = new GeneratedStynxSdk();
const ctg9 = new OfflineCtg9.GeneratedOfflineCtg9Sdk();
const base = { orgUnitId: 'unit-1', deviceId: 'device-1', entityType: 'document', requestedSize: 3 };
e6.offlineSync.offlineSyncPostOfflineSyncNumberingReservationsReserveNumbering({ requestBody: { ...base, shiftId: 'shift-1' } });
ctg9.ctg9OfflineSync.ctg9OfflineSyncPostOfflineSyncNumberingReservationsReserveNumbering({ requestBody: { orgUnitId: 'unit-1', deviceId: 'device-1', entityType: 'document', requestedSize: 3, shiftId: null } });
// @ts-expect-error E6 has never admitted a null shift.
e6.offlineSync.offlineSyncPostOfflineSyncNumberingReservationsReserveNumbering({ requestBody: { ...base, shiftId: null } });
`;
  writeFileSync(join(fixture, 'consumer.ts'), body);
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      'consumer.ts',
    ],
    {
      cwd: fixture,
      stdio: 'pipe',
      timeout: 30000,
    },
  );
});
