import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Database, type StorageVerificationReport } from '@stynx-nyx/data';
import { renderOfflineStorage, verifyOfflineStorage } from '@stynx-nyx/offline-sync';

const migrations = [
  '0001_offline_sync.sql',
  '0002_durable_sync.sql',
  '0003_reservation_idempotency.sql',
  '0004_pending_state_and_conflict_actions.sql',
  '0005_initial_queue_status.sql',
  '0006_nullable_active_reservations.sql',
  '0007_range_administration.sql',
  '0008_import_receipts.sql',
].map((name) => `packages/offline-sync/migrations/${name}`);
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const binding = {
  ownerRole: 'stynx_owner',
  appRole: 'stynx_app',
  readerRole: 'stynx_reader',
  tenantTable: { schema: 'tenancy', table: 'tenants', column: 'id' },
};

/** Fresh fixture installation, distinct from populated upgrade and state import. */
@Injectable()
export class OfflinePerformanceStorageInstaller implements OnApplicationBootstrap {
  private installation?: {
    scope: 'fresh-offline-performance-installation';
    packageVersion: string;
    contractVersion: string;
    templateSha256: string;
    renderedSqlSha256: string;
    sourceMigrations: readonly { path: string; sha256: string }[];
    verification: StorageVerificationReport;
  };

  constructor(private readonly database: Database) {}

  async onApplicationBootstrap(): Promise<void> {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.STYNX_ENVIRONMENT !== 'http-fixture' ||
      this.installation
    ) {
      throw new Error('Offline performance storage requires one fresh owned fixture');
    }
    const artifact = renderOfflineStorage(binding);
    const sources = artifact.manifest.sources.filter((row) =>
      row.path.startsWith('packages/offline-sync/migrations/'),
    );
    if (
      sources.length !== migrations.length ||
      sources.some((row, index) => row.path !== migrations[index])
    ) {
      throw new Error('Offline performance storage migration population differs');
    }
    for (const row of sources) {
      const path = resolve(process.cwd(), row.path);
      if (
        !lstatSync(path).isFile() ||
        realpathSync(path) !== path ||
        sha256(readFileSync(path)) !== row.sha256
      ) {
        throw new Error('Offline performance storage migration source differs');
      }
    }
    const renderedSqlSha256 = sha256(artifact.objectsSql + '\n' + artifact.roleBindingsSql);
    const verification = await this.database.withSystemContext(
      'Install the canonical offline contract in a fresh owned performance database',
      async () => {
        await this.database.tx(
          async (trx) => {
            const admission = await trx.query<{ actor: string; schema_exists: boolean }>(
              `select current_user::text as actor, to_regnamespace('offline') is not null as schema_exists`,
            );
            if (
              admission.rows.length !== 1 ||
              admission.rows[0]!.actor !== binding.ownerRole ||
              admission.rows[0]!.schema_exists
            ) {
              throw new Error(
                'Offline performance installation requires the actual owner and an absent schema',
              );
            }
            await trx.query(artifact.objectsSql);
            await trx.query(artifact.roleBindingsSql);
            await trx.query(
              `insert into core.app_schema_migrations(scope,id,checksum)
             values('http-performance-offline-storage',$1,$2)`,
              [artifact.contractVersion, renderedSqlSha256],
            );
          },
          { role: 'owner', retry: false },
        );
        return this.database.tx((trx) => verifyOfflineStorage(trx, binding), {
          role: 'owner',
          readonly: true,
          retry: false,
        });
      },
    );
    if (
      !verification.supported ||
      verification.checks.length === 0 ||
      verification.checks.some((check) => check.status !== 'pass')
    ) {
      throw new Error('Canonical offline storage did not pass its read-only verifier');
    }
    this.installation = {
      scope: 'fresh-offline-performance-installation',
      packageVersion: artifact.packageVersion,
      contractVersion: artifact.contractVersion,
      templateSha256: artifact.manifest.templateSha256,
      renderedSqlSha256,
      sourceMigrations: sources,
      verification,
    };
  }

  snapshot() {
    if (!this.installation) throw new Error('Offline performance storage is not verified');
    return structuredClone(this.installation);
  }
}
