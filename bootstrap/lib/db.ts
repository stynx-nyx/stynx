import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { Client } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  rootDatabase?: string; // default postgres
}

export interface DbOptions {
  dryRun?: boolean;
  debug?: boolean;
}

function buildClient(config: DatabaseConfig, database?: string): Client {
  return new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: database ?? config.database,
  });
}

async function execute(client: Client, sql: string, label: string, options: DbOptions) {
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.log(chalk.gray(`[db] ${label}`));
  }
  await client.query(sql);
}

export async function dropDatabase(config: DatabaseConfig, options: DbOptions = {}): Promise<void> {
  if (options.dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow('dry-run: skipping database drop'));
    return;
  }
  const dbName = config.database;
  const client = buildClient(config, config.rootDatabase || 'postgres');
  await client.connect();
  try {
    await execute(client, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}'`, 'terminate sessions', options);
    await execute(client, `DROP DATABASE IF EXISTS "${dbName}"`, 'drop database', options);
  } finally {
    await client.end();
  }
}

export async function createDatabase(config: DatabaseConfig, options: DbOptions = {}): Promise<void> {
  if (options.dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow('dry-run: skipping database create'));
    return;
  }
  const dbName = config.database;
  const client = buildClient(config, config.rootDatabase || 'postgres');
  await client.connect();
  try {
    await execute(client, `CREATE DATABASE "${dbName}" OWNER "${config.user}"`, 'create database', options);
  } finally {
    await client.end();
  }
}

export async function runSqlDirectory(config: DatabaseConfig, dir: string, options: DbOptions = {}): Promise<void> {
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  if (files.length === 0) {
    if (options.debug) {
      // eslint-disable-next-line no-console
      console.log(chalk.gray(`[db] no SQL files found in ${dir}`));
    }
    return;
  }
  if (options.dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`dry-run: skipping SQL apply for ${dir}`));
    return;
  }
  const client = buildClient(config);
  await client.connect();
  try {
    for (const file of files) {
      const filePath = path.join(dir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      await execute(client, sql, `apply ${file}`, options);
    }
  } finally {
    await client.end();
  }
}
