import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { Client, type ClientConfig } from 'pg';

function localSocketDir(): string {
  return process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp';
}

function localUser(): string {
  return process.env.STYNX_TEST_PG_USER ?? userInfo().username;
}

function localPort(): number {
  return Number(process.env.STYNX_TEST_PG_PORT ?? '5432');
}

function localPassword(): string | undefined {
  return process.env.STYNX_TEST_PG_PASSWORD;
}

function localHost(): string | undefined {
  return process.env.STYNX_TEST_PG_HOST;
}

function databaseName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Optional migrated template database (ADR-CI-ECONOMY Decision 6a). When
 * set (the CI tier gate exports it after running
 * scripts/ci-local/prepare-int-template.mjs), new test databases are cloned
 * from the already-migrated template instead of being created empty, so the
 * per-suite StynxDataModule migration pass no-ops instead of replaying the
 * full platform migration set concurrently with every other suite.
 */
function templateDatabase(): string | undefined {
  const template = process.env.STYNX_TEST_PG_TEMPLATE;
  return template && template.length > 0 ? template : undefined;
}

function adminConfig(database = 'postgres'): ClientConfig {
  const host = localHost();
  if (host) {
    return {
      host,
      port: localPort(),
      user: localUser(),
      password: localPassword(),
      database,
    };
  }

  return {
    host: localSocketDir(),
    user: localUser(),
    database,
  };
}

function connectionString(database: string, applicationName: string): string {
  const host = localHost();
  if (host) {
    const url = new URL(`postgresql://${encodeURIComponent(localUser())}@${host}:${localPort()}/${database}`);
    const password = localPassword();
    if (password) {
      url.password = password;
    }
    url.searchParams.set('application_name', applicationName);
    return url.toString();
  }

  return `postgresql://${encodeURIComponent(localUser())}@/${encodeURIComponent(database)}?host=${encodeURIComponent(localSocketDir())}&application_name=${encodeURIComponent(applicationName)}`;
}

async function withClient<T>(config: ClientConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface PostgresTestDatabase {
  readonly database: string;
  connectionString(applicationName: string): string;
  adminConnectionString(applicationName: string): string;
  connectAsAdmin(): Promise<Client>;
  dispose(): Promise<void>;
}

export async function createPostgresTestDatabase(prefix = 'stynx_data'): Promise<PostgresTestDatabase> {
  const database = databaseName(prefix);
  const template = templateDatabase();

  await withClient(adminConfig(), async (client) => {
    if (template) {
      await client.query(`create database "${database}" template "${template}"`);
    } else {
      await client.query(`create database "${database}"`);
    }
  });

  return {
    database,
    connectionString(applicationName: string): string {
      return connectionString(database, applicationName);
    },
    adminConnectionString(applicationName: string): string {
      return connectionString(database, applicationName);
    },
    async connectAsAdmin(): Promise<Client> {
      const client = new Client(adminConfig(database));
      await client.connect();
      return client;
    },
    async dispose(): Promise<void> {
      await withClient(adminConfig(), async (client) => {
        await client.query(
          `
            select pg_terminate_backend(pid)
            from pg_stat_activity
            where datname = $1
              and pid <> pg_backend_pid()
          `,
          [database],
        );
        await client.query(`drop database if exists "${database}"`);
      });
    },
  };
}
