#!/usr/bin/env node
// Explicit generation from the complete canonical platform chain in a disposable DB.
import { catalogSetOwner } from '../tools/database-tooling/dist/catalog-control.repository.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStynxPgClient, executeTypedQuery, executeRawScript } from '../packages/data/dist/data/src/index.js';
import { executeRootDatabaseOperation } from '../packages/data/dist/data/src/checked-executor.js';
import { collectStorageCatalog } from '../packages/data/dist/data/src/storage-catalog.js';
import { format } from 'prettier';

const mode = process.argv[2];
if (process.argv.length !== 3 || mode === undefined || !['--write', '--check'].includes(mode))
  throw new Error('Use exactly --write or --check');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'packages/data/migrations/platform');
const config = {
  host: process.env.STYNX_TEST_PG_HOST ?? process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
  user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
  port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
  password: process.env.STYNX_TEST_PG_PASSWORD,
};
const database = `stynx_storage_generation_${randomUUID().replaceAll('-', '')}`;
const admin = createStynxPgClient({ ...config, database: 'postgres' });
await admin.connect();
/** @type {import('../packages/data/dist/data/src/client.js').StynxPgClient | undefined} */
let client;
try {
  await executeRootDatabaseOperation(admin, 'outbox-catalog-create', database);
  client = createStynxPgClient({ ...config, database });
  await client.connect();
  const sources = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    sources.push({
      path: `packages/data/migrations/platform/${file}`,
      sha256: createHash('sha256').update(sql).digest('hex'),
    });
    await executeRawScript(client, sql);
    if (file === '0002_extensions.sql') await executeTypedQuery(client, catalogSetOwner, []);
  }
  const entries = await collectStorageCatalog(client, 'outbox');
  for (const path of [
    'scripts/outbox-storage-catalog-generate.mjs',
    'packages/data/src/storage-catalog.ts',
  ]) {
    sources.push({
      path,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(root, path)))
        .digest('hex'),
    });
  }
  const body = await format(
    `// Generated from canonical platform migrations; do not edit.\nexport const OUTBOX_STORAGE_CATALOG = ${JSON.stringify({ sources, entries }, null, 2)} as const;\n`,
    { parser: 'typescript', singleQuote: true, printWidth: 100 },
  );
  const target = resolve(root, 'packages/outbox/src/storage-catalog.generated.ts');
  if (process.argv[2] === '--check') {
    if (readFileSync(target, 'utf8') !== body)
      throw new Error('Outbox storage catalog generation drift');
  } else {
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, target);
  }
} finally {
  if (client) await client.end();
  await executeRootDatabaseOperation(admin, 'outbox-catalog-drop-force', database);
  await admin.end();
}
