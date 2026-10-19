import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { STYNX_DATA_OPTIONS, type StynxDataModuleOptions } from './tokens.js';
import { StynxPoolRegistry } from './pools.js';
import { applyRolePrefix, platformRoleNames, type PlatformRoleNames } from './platform-roles.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

async function resolvePlatformMigrationDir(): Promise<string> {
  for (const candidate of [
    resolve(moduleDir, '../migrations/platform'),
    resolve(moduleDir, '../../migrations/platform'),
    resolve(moduleDir, '../../../migrations/platform'),
    resolve(process.cwd(), 'packages/data/migrations/platform'),
    resolve(process.cwd(), 'migrations/platform'),
  ]) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return resolve(moduleDir, '../migrations/platform');
}

@Injectable()
export class StynxMigrationRunner implements OnModuleInit {
  constructor(
    @Inject(STYNX_DATA_OPTIONS)
    private readonly options: StynxDataModuleOptions,
    private readonly pools: StynxPoolRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.migrations?.enabled) {
      return;
    }
    await this.runPlatformMigrations();
    if (this.options.migrations.runner) {
      await this.options.migrations.runner(this.pools.pools);
    }
  }

  async runPlatformMigrations(): Promise<void> {
    const rolePrefix = this.options.migrations?.rolePrefix;
    const roles = platformRoleNames(rolePrefix);
    await this.pools.onModuleInit();
    const owner = this.pools.pools.owner;
    const client = await owner.connect();

    try {
      await client.query(`
        create schema if not exists core;
        create table if not exists core.schema_migrations (
          id text primary key,
          checksum text,
          applied_at timestamptz not null default clock_timestamp()
        );
      `);

      const migrationDir = await resolvePlatformMigrationDir();
      const filenames = (await readdir(migrationDir))
        .filter((entry) => entry.endsWith('.sql'))
        .sort();

      const applied = await client.query<{ id: string }>('select id from core.schema_migrations');
      const appliedIds = new Set(applied.rows.map((row) => row.id));
      const ownerRoleApplied = appliedIds.has('0002_extensions.sql');

      if (ownerRoleApplied) {
        await this.promoteBootstrapObjectsToOwner(client, roles);
      }

      for (const filename of filenames) {
        if (appliedIds.has(filename)) {
          continue;
        }

        // The checksum stays the file's: the prefix is applied, never recorded.
        const migrationSql = await readFile(resolve(migrationDir, filename), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(applyRolePrefix(migrationSql, rolePrefix));
          await client.query(
            `
              insert into core.schema_migrations (id, checksum, applied_at)
              values ($1, md5($2), clock_timestamp())
              on conflict (id) do nothing
            `,
            [filename, migrationSql],
          );
          if (filename === '0002_extensions.sql') {
            await this.promoteBootstrapObjectsToOwner(client, roles);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
    } finally {
      client.release();
    }
  }

  private async promoteBootstrapObjectsToOwner(
    client: { query: (sql: string) => Promise<unknown> },
    roles: PlatformRoleNames,
  ): Promise<void> {
    // `roles.owner` is a validated lower-case identifier (platform-roles.ts).
    await client.query(`ALTER SCHEMA core OWNER TO ${roles.owner}`);
    await client.query(`ALTER TABLE core.schema_migrations OWNER TO ${roles.owner}`);
    await client.query(`SET ROLE ${roles.owner}`);
  }
}
