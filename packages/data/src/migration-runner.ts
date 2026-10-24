import { executeRawScript, executeTypedQuery } from './checked-executor.js';
import { appliedMigrations, recordMigration } from './migration.repository.js';
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
      const { owner, app, reader } = this.pools.pools;
      if (owner === undefined || app === undefined || reader === undefined) {
        throw new TypeError('Migration pools are not initialized');
      }
      await this.options.migrations.runner({ owner, app, reader });
    }
  }

  async runPlatformMigrations(): Promise<void> {
    const rolePrefix = this.options.migrations?.rolePrefix;
    const roles = platformRoleNames(rolePrefix);
    await this.pools.onModuleInit();
    const owner = this.pools.pools.owner;
    if (owner === undefined) throw new TypeError('Migration owner pool is not initialized');
    const client = await owner.connect();

    try {
      await executeRawScript(client, `
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

      const applied = await executeTypedQuery(client, appliedMigrations, []);
      const appliedIds = new Set(applied.map((row) => row.id));
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
        await executeRawScript(client, 'BEGIN');
        try {
          await executeRawScript(client, applyRolePrefix(migrationSql, rolePrefix));
          await executeTypedQuery(client, recordMigration, [filename, migrationSql]);
          if (filename === '0002_extensions.sql') {
            await this.promoteBootstrapObjectsToOwner(client, roles);
          }
          await executeRawScript(client, 'COMMIT');
        } catch (error) {
          await executeRawScript(client, 'ROLLBACK').catch(() => undefined);
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
    await executeRawScript(client, `ALTER SCHEMA core OWNER TO ${roles.owner}`);
    await executeRawScript(client, `ALTER TABLE core.schema_migrations OWNER TO ${roles.owner}`);
    await executeRawScript(client, `SET ROLE ${roles.owner}`);
  }
}
