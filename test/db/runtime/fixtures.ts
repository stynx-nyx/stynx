import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../packages/data/test/support/postgres';

const repoRoot = resolve(__dirname, '../../..');
type AdminClient = Awaited<ReturnType<PostgresTestDatabase['connectAsAdmin']>>;

export const canonicalSeedIds = {
  tenancy: '00000000-0000-0000-0000-000000000001',
  roles: {
    platformSuperadmin: '00000000-0000-0000-0000-000000000101',
    platformAdmin: '00000000-0000-0000-0000-000000000102',
    tenantAdmin: '00000000-0000-0000-0000-000000000103',
    tenantUser: '00000000-0000-0000-0000-000000000104',
  },
  groups: {
    platformAdmins: '00000000-0000-0000-0000-000000000201',
    tenantAdmins: '00000000-0000-0000-0000-000000000202',
  },
  user: '00000000-0000-0000-0000-000000001111',
  membership: '00000000-0000-0000-0000-000000003001',
} as const;

export interface DbRuntimeFixture {
  readonly database: PostgresTestDatabase;
  readonly client: AdminClient;
  readonly appliedFiles: string[];
  dispose(): Promise<void>;
}

async function sqlFilenames(relativeDirectory: string): Promise<string[]> {
  const directory = resolve(repoRoot, relativeDirectory);
  const entries = await readdir(directory);

  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => resolve(directory, entry));
}

async function applySqlFiles(client: AdminClient, relativeDirectory: string): Promise<string[]> {
  const filenames = await sqlFilenames(relativeDirectory);

  for (const filename of filenames) {
    await client.query(await readFile(filename, 'utf8'));
  }

  return filenames.map((filename) => filename.slice(repoRoot.length + 1));
}

export async function createDbRuntimeFixture(prefix = 'stynx_db_runtime'): Promise<DbRuntimeFixture> {
  const database = await createPostgresTestDatabase(prefix);
  const client = await database.connectAsAdmin();

  try {
    const appliedFiles = [
      ...(await applySqlFiles(client, 'db/ddl')),
      ...(await applySqlFiles(client, 'db/seed')),
    ];

    return {
      database,
      client,
      appliedFiles,
      async dispose(): Promise<void> {
        await client.end();
        await database.dispose();
      },
    };
  } catch (error) {
    await client.end().catch(() => undefined);
    await database.dispose();
    throw error;
  }
}
