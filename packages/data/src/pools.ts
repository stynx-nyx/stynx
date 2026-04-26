import { SecretLoader } from '@stynx/core';
import { Injectable, Inject, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool, type PoolConfig } from 'pg';
import { STYNX_DATA_OPTIONS, type StynxDataModuleOptions, type StynxDataRole } from './tokens';

function parseSecretConnection(secret: string): string {
  try {
    const parsed = JSON.parse(secret) as { connectionString?: string; url?: string };
    if (typeof parsed.connectionString === 'string' && parsed.connectionString.length > 0) {
      return parsed.connectionString;
    }
    if (typeof parsed.url === 'string' && parsed.url.length > 0) {
      return parsed.url;
    }
  } catch {
    return secret;
  }

  return secret;
}

async function resolveConnectionString(
  loader: SecretLoader,
  options: StynxDataModuleOptions['connections'][StynxDataRole],
): Promise<string> {
  if (options.connectionString) {
    return options.connectionString;
  }
  if (options.secretId) {
    const secret = await loader.getSecretString(options.secretId);
    return parseSecretConnection(secret);
  }
  throw new Error('Each stynx/data connection requires either connectionString or secretId');
}

function createPoolConfig(
  role: StynxDataRole,
  connectionString: string,
  options: StynxDataModuleOptions['connections'][StynxDataRole],
): PoolConfig {
  return {
    connectionString,
    max: options.max ?? (role === 'owner' ? 2 : 20),
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    application_name: options.applicationName ?? `@stynx/data:${role}`,
  };
}

function createPool(
  role: StynxDataRole,
  connectionString: string,
  options: StynxDataModuleOptions['connections'][StynxDataRole],
): Pool {
  const pool = new Pool(createPoolConfig(role, connectionString, options));
  pool.on('error', () => undefined);
  return pool;
}

@Injectable()
export class StynxPoolRegistry implements OnModuleInit, OnModuleDestroy {
  readonly pools: Record<StynxDataRole, Pool>;
  private initialized = false;

  constructor(
    @Inject(STYNX_DATA_OPTIONS)
    private readonly options: StynxDataModuleOptions,
    private readonly secretLoader: SecretLoader,
  ) {
    this.pools = {} as Record<StynxDataRole, Pool>;
  }

  async onModuleInit(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.pools.owner = createPool(
      'owner',
      await resolveConnectionString(this.secretLoader, this.options.connections.owner),
      this.options.connections.owner,
    );
    this.pools.app = createPool(
      'app',
      await resolveConnectionString(this.secretLoader, this.options.connections.app),
      this.options.connections.app,
    );
    this.pools.reader = createPool(
      'reader',
      await resolveConnectionString(this.secretLoader, this.options.connections.reader),
      this.options.connections.reader,
    );
    this.initialized = true;
  }

  get(role: StynxDataRole, replica = false): Pool {
    if (replica || role === 'reader') {
      return this.pools.reader;
    }
    return this.pools[role];
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Object.values(this.pools)
        .filter((pool): pool is Pool => pool !== undefined)
        .map((pool) => pool.end()),
    );
  }
}
