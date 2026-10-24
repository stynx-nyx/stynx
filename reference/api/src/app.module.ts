import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module, UseGuards } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PermissionGuard, StynxAuthGuard, StynxAuthModule } from '@stynx-nyx/auth';
import {
  StynxPlatformPipelineModule,
  AuditInterceptor,
  STYNX_AUDIT_SINK,
} from '@stynx-nyx/backend';
import { Database, StynxDataModule, createScopedQueryExecutor, executeRawScript, executeTypedQuery } from '@stynx-nyx/data';
import { appliedReferenceMigrationsQuery, legacySampleTablesQuery, recordLegacyMigrationQuery, recordReferenceMigrationQuery } from './migration.repository.js';
import { StynxFlowModule } from '@stynx-nyx/flow';
import { StynxHealthModule } from '@stynx-nyx/health';
import { StynxLoggingModule } from '@stynx-nyx/logging';
import { PreferencesController, StynxPreferencesModule } from '@stynx-nyx/preferences';
import {
  DeterministicSessionProviderFake,
  StynxSessionControlModule,
  StynxSessionsModule,
} from '@stynx-nyx/sessions';
import { StynxStorageModule } from '@stynx-nyx/storage';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import { AuditSqlSink, StynxAuditModule as StynxAuditApiModule } from '@stynx-nyx/audit';
import { SampleModule } from './sample/sample.module.js';

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function buildDefaultKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    currentKid: 'reference-api-dev-key',
    keys: [
      {
        kid: 'reference-api-dev-key',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

function resolveSessionKeySet() {
  const raw = process.env.STYNX_SESSION_KEY_SET_JSON;
  if (!raw) {
    return buildDefaultKeySet();
  }
  return JSON.parse(raw) as ReturnType<typeof buildDefaultKeySet>;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveReferenceMigrationDir(): string {
  for (const candidate of [
    resolve(moduleDir, '../migrations'),
    resolve(moduleDir, '../../migrations'),
    resolve(process.cwd(), 'migrations'),
    resolve(process.cwd(), 'reference/api/migrations'),
  ]) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return resolve(moduleDir, '../migrations');
}

async function bootstrapLegacyReferenceMigrationState(
  owner: {
    query: <TRow = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: TRow[] }>;
  },
  scope: string,
): Promise<void> {
  const existingSampleTables = await executeTypedQuery(owner, legacySampleTablesQuery, []);
  if (existingSampleTables.length !== 5) return;
  await executeTypedQuery(owner, recordLegacyMigrationQuery, [scope]);
}

async function runReferenceApiMigrations(
  pools: Record<
    'owner' | 'app' | 'reader',
    {
      connect: () => Promise<{
        query: <TRow = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ) => Promise<{ rows: TRow[] }>;
        release: () => void;
      }>;
    }
  >,
): Promise<void> {
  const owner = await pools.owner.connect();
  try {
    await executeRawScript(owner, `
      create schema if not exists core;
      create table if not exists core.app_schema_migrations (
        scope text not null,
        id text not null,
        checksum text not null,
        applied_at timestamptz not null default clock_timestamp(),
        primary key (scope, id)
      );
    `);

    const migrationDir = resolveReferenceMigrationDir();
    const filenames = readdirSync(migrationDir)
      .filter((entry) => entry.endsWith('.sql') && !entry.endsWith('.down.sql'))
      .sort();
    const scope = 'reference-api';
    await bootstrapLegacyReferenceMigrationState(owner, scope);
    const applied = await executeTypedQuery(owner, appliedReferenceMigrationsQuery, [scope]);
    const appliedIds = new Set(applied.map((row) => row.id));

    for (const filename of filenames) {
      if (appliedIds.has(filename)) {
        continue;
      }

      const sql = readFileSync(resolve(migrationDir, filename), 'utf8');
      await executeRawScript(owner, 'BEGIN');
      try {
        await executeRawScript(owner, sql);
        await executeTypedQuery(owner, recordReferenceMigrationQuery, [scope, filename, sql]);
        await executeRawScript(owner, 'COMMIT');
      } catch (error) {
        await executeRawScript(owner, 'ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  } finally {
    owner.release();
  }
}

@UseGuards(StynxAuthGuard)
export class GuardedPreferencesController extends PreferencesController {}

@Module({
  imports: [
    StynxLoggingModule.forRoot(),
    StynxDataModule.forRoot({
      connections: {
        owner: {
          connectionString: env(
            'STYNX_OWNER_DATABASE_URL',
            'postgresql://postgres:postgres@localhost:5432/postgres',
          ),
        },
        app: {
          connectionString: env(
            'STYNX_APP_DATABASE_URL',
            'postgresql://postgres:postgres@localhost:5432/postgres',
          ),
        },
        reader: {
          connectionString: env(
            'STYNX_READER_DATABASE_URL',
            'postgresql://postgres:postgres@localhost:5432/postgres',
          ),
        },
      },
      migrations: {
        enabled: true,
        runner: runReferenceApiMigrations,
      },
    }),
    StynxAuthModule.forRoot({
      stynx: {
        issuer: env('STYNX_STYNX_ISSUER', 'https://stynx.local'),
      },
      cognito: {
        issuer: env('STYNX_COGNITO_ISSUER', 'https://cognito.local'),
        ...(process.env.STYNX_COGNITO_JWKS_URI
          ? { jwksUri: process.env.STYNX_COGNITO_JWKS_URI }
          : {}),
      },
      ...(process.env.STYNX_REDIS_URL
        ? {
            redis: {
              url: process.env.STYNX_REDIS_URL,
            },
          }
        : {}),
    }),
    StynxSessionsModule.forRoot({
      issuer: env('STYNX_STYNX_ISSUER', 'https://stynx.local'),
      redis: {
        url: env('STYNX_REDIS_URL', 'redis://127.0.0.1:6379'),
      },
      jwt: {
        keySet: resolveSessionKeySet(),
      },
    }),
    StynxSessionControlModule.forRoot({
      registry: 'postgres',
      provider: new DeterministicSessionProviderFake(),
    }),
    StynxTenancyModule.forRoot({}),
    StynxPreferencesModule.forRoot({ mountController: false }),
    StynxAuditApiModule.forRoot({
      dailyDetachEnabled: false,
    }),
    StynxHealthModule.forRoot({
      appInfo: {
        app: 'reference-api',
      },
    }),
    StynxStorageModule.forRoot({
      environment: env('STYNX_ENVIRONMENT', 'local'),
      region: env('STYNX_STORAGE_REGION', 'us-east-1'),
      kmsAlias: env('STYNX_KMS_ALIAS', 'stynx-local'),
      bucketName: env(
        'STYNX_STORAGE_BUCKET',
        `stynx-docs-${env('STYNX_ENVIRONMENT', 'local')}-${env('STYNX_STORAGE_REGION', 'us-east-1')}`,
      ),
      collections: {
        records: {
          mimeAllowlist: ['application/pdf', 'image/png', 'image/jpeg'],
          maxBytes: 25 * 1024 * 1024,
          classificationDefault: 'internal',
        },
      },
      ...(process.env.STYNX_STORAGE_ENDPOINT
        ? { endpoint: process.env.STYNX_STORAGE_ENDPOINT }
        : {}),
      ...(process.env.STYNX_STORAGE_FORCE_PATH_STYLE === 'true' ? { forcePathStyle: true } : {}),
    }),
    StynxPlatformPipelineModule.forRoot({
      rateLimit: {
        defaultLimit: 120,
        defaultWindowSeconds: 60,
        ...(process.env.STYNX_REDIS_URL
          ? {
              redis: {
                url: process.env.STYNX_REDIS_URL,
              },
            }
          : {}),
      },
      idempotency: {
        ttlMs: 24 * 60 * 60 * 1000,
        ...(process.env.STYNX_REDIS_URL
          ? {
              redis: {
                url: process.env.STYNX_REDIS_URL,
              },
            }
          : {}),
      },
    }),
    StynxFlowModule,
    SampleModule,
  ],
  controllers: [GuardedPreferencesController],
  providers: [
    StynxAuthGuard,
    PermissionGuard,
    {
      provide: STYNX_AUDIT_SINK,
      inject: [Database],
      useFactory: (database: Database) =>
        new AuditSqlSink(
          createScopedQueryExecutor((consume) =>
            database.withSystemContext('reference-api audit sink', async () =>
              database.tx((trx) => consume(trx), {
                role: 'owner',
                readonly: false,
              }),
            ),
          ),
          { mode: 'audit_write_function' },
        ),
    },
    AuditInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: AuditInterceptor,
    },
  ],
})
export class AppModule {}
