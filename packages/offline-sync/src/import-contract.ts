import type { StorageVerifierTransaction } from '@stynx-nyx/data';
import type { OfflineStorageOptions } from './storage';
import type {
  OfflineImportArchive,
  OfflineImportBatchesKey,
  OfflineImportManifest,
  OfflineImportRecord,
  OfflineImportTransportKeysRow,
} from './import-schema.generated';

export type OfflineArchivedResponse = OfflineImportArchive;
export type OfflineImportRecordKind = OfflineImportRecord['kind'];
export interface OfflineArchiveVerification {
  readonly verdict: 'verified' | 'unverified';
  readonly sourceSha256: string;
  readonly manifestSha256: string;
  readonly mappingSha256: string;
  readonly batch: OfflineImportBatchesKey;
  readonly responseBodySha256: string;
  readonly responseHeadersSha256: string;
  readonly evidenceId: string;
}
export interface OfflineArchiveVerificationPort {
  verify(
    archive: OfflineArchivedResponse,
    context: {
      readonly source: OfflineImportManifest['source'];
      readonly manifestSha256: string;
      readonly mappingSha256: string;
      readonly batch: OfflineImportBatchesKey;
      readonly transportKeys: readonly OfflineImportTransportKeysRow[];
    },
  ): Promise<OfflineArchiveVerification>;
}
export interface OfflineImportOptions {
  readonly storage?: OfflineStorageOptions;
  readonly verifyArchive?: OfflineArchiveVerificationPort;
}
export interface OfflineImportReceipt {
  readonly source: OfflineImportManifest['source'];
  readonly manifestSha256: string;
  readonly mappingSha256: string;
  readonly importedBy: string;
  readonly importedAt: string;
  readonly recordCounts: Readonly<Record<OfflineImportRecordKind, number>>;
  readonly archives: readonly {
    readonly batch: OfflineImportBatchesKey;
    readonly verdict: 'verified' | 'unverified';
    readonly responseBodySha256: string | null;
    readonly responseHeadersSha256: string | null;
    readonly evidenceId: string | null;
  }[];
}
export type OfflineImportErrorReason =
  | 'invalid-manifest'
  | 'source-conflict'
  | 'storage-unsupported'
  | 'maintenance-required'
  | 'record-conflict'
  | 'invariant-violation'
  | 'archive-invalid';
export class OfflineImportError extends Error {
  constructor(
    readonly reason: OfflineImportErrorReason,
    readonly object: string,
  ) {
    super(`Offline import refused: ${reason} (${object})`);
    this.name = 'OfflineImportError';
  }
}
/** Structural caller-owned transaction. No connection/transaction lifecycle is delegated. */
export type OfflineImportTransaction = StorageVerifierTransaction;
