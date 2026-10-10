#!/usr/bin/env node
// Explicit generation from the complete canonical platform chain in a disposable DB.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStynxPgClient } from '../packages/data/src/client.ts';
import { collectStorageCatalog } from '../packages/data/src/storage-catalog.ts';
import { format } from 'prettier';

if (process.argv.length !== 3 || !['--write', '--check'].includes(process.argv[2]))
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
let client;
try {
  await admin.query(`create database "${database}"`);
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
    await client.query(sql);
    if (file === '0002_extensions.sql') await client.query('set role stynx_owner');
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
  await admin.query(`drop database if exists "${database}" with (force)`);
  await admin.end();
}
