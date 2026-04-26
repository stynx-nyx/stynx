import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { Client, type ClientConfig } from 'pg';

function localSocketDir(): string {
  return process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp';
}

function localUser(): string {
  return process.env.STYNX_TEST_PG_USER ?? userInfo().username;
}

function databaseName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function adminConfig(database = 'postgres'): ClientConfig {
  return {
    host: localSocketDir(),
    user: localUser(),
    database,
  };
}

function connectionString(database: string, applicationName: string): string {
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

  await withClient(adminConfig(), async (client) => {
    await client.query(`create database "${database}"`);
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
