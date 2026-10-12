export interface DemoBookmarkQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface DemoBookmarkStorageSource {
  readonly path:
    'domain/demo-bookmark/db/migration.sql' | 'domain/demo-bookmark/db/0002_tenant_rls.sql';
  readonly sha256: string;
}

export interface DemoBookmarkStorageVerification {
  readonly contractVersion: 'demo-bookmark-storage/1';
  readonly supported: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: 'pass' | 'fail';
    readonly actual: unknown;
  }[];
  readonly historicalModelDifferences: readonly string[];
}

export interface DemoBookmarkStoragePlan {
  readonly contractVersion: 'demo-bookmark-storage/1';
  readonly sources: readonly DemoBookmarkStorageSource[];
  readonly sql: string;
  readonly renderedSqlSha256: string;
  readonly historicalModelDifferences: readonly string[];
}

export interface DemoBookmarkStorageInstallation {
  readonly contractVersion: 'demo-bookmark-storage/1';
  readonly previousState: 'absent' | 'historical' | 'installed';
  readonly sources: readonly DemoBookmarkStorageSource[];
  readonly renderedSqlSha256: string;
  readonly verification: DemoBookmarkStorageVerification;
  readonly historicalModelDifferences: readonly string[];
}

export function renderDemoBookmarkStorage(): DemoBookmarkStoragePlan;
export function verifyDemoBookmarkStorage(
  queryable: DemoBookmarkQueryable,
): Promise<DemoBookmarkStorageVerification>;
/** Requires an independently owned stynx_owner transaction; propagate refusal
 * to its owner for rollback, then verify again after commit in a read-only tx.
 */
export function installDemoBookmarkStorage(
  queryable: DemoBookmarkQueryable,
): Promise<DemoBookmarkStorageInstallation>;
