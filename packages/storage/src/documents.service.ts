import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx/core';
import { Database, documents } from '@stynx/data';
import { eq } from 'drizzle-orm';
import {
  StorageCollectionNotFoundError,
  StorageDocumentNotFoundError,
  StorageTenantMismatchError,
  StorageValidationError,
} from './errors';
import { S3Service } from './s3.service';
import { STYNX_STORAGE_OPTIONS } from './tokens';
import type {
  CompleteDocumentHeaders,
  CompleteDocumentResult,
  DownloadDocumentResult,
  InitiateDocumentInput,
  InitiateDocumentResult,
  StynxStorageModuleOptions,
} from './types';

interface DocumentRow {
  id: string;
  tenantId: string;
  collection: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  scanStatus: string;
  scanDetail: Record<string, unknown>;
}

function sanitizeFilename(value: string): string {
  return basename(value).replace(/[^A-Za-z0-9._-]/g, '_');
}

function normalizeMime(value: string): string {
  return value.trim().toLowerCase();
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly requestContext: RequestContext,
    private readonly s3: S3Service,
    @Inject(STYNX_STORAGE_OPTIONS)
    private readonly options: StynxStorageModuleOptions,
  ) {}

  async initiate(input: InitiateDocumentInput): Promise<InitiateDocumentResult> {
    const tenantId = this.requireTenantId();
    const actorId = this.requireActorId();
    const collection = this.options.collections[input.collection];
    if (!collection) {
      throw new StorageCollectionNotFoundError(input.collection);
    }

    const mimeType = normalizeMime(input.mimeType);
    if (!collection.mimeAllowlist.map(normalizeMime).includes(mimeType)) {
      throw new StorageValidationError('MIME type is not allowed for this collection', {
        collection: input.collection,
        mimeType,
      });
    }
    if (input.byteSize > collection.maxBytes) {
      throw new StorageValidationError('Document exceeds the collection size limit', {
        collection: input.collection,
        byteSize: input.byteSize,
        maxBytes: collection.maxBytes,
      });
    }
    if (!/^[A-Fa-f0-9]{64}$/.test(input.checksumSha256)) {
      throw new StorageValidationError('checksum_sha256 must be a 64-character hex digest');
    }

    const id = randomUUID();
    const filename = sanitizeFilename(input.filename);
    const s3Key = this.buildObjectKey(tenantId, input.collection, id, filename);

    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      await trx.insert(documents).values({
        id,
        tenantId,
        collection: input.collection,
        s3Key,
        filename,
        mimeType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256.toLowerCase(),
        scanStatus: 'not_scanned',
        scanDetail: {},
        encryption: 'aws:kms',
        classification: input.classification ?? collection.classificationDefault,
        ownerUserId: actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    return {
      id,
      s3Key,
      upload: await this.s3.presignUpload({
        key: s3Key,
        contentType: mimeType,
        checksumSha256: input.checksumSha256.toLowerCase(),
      }),
    };
  }

  async complete(id: string, headers: CompleteDocumentHeaders = {}): Promise<CompleteDocumentResult> {
    const row = await this.requireOwnedDocument(id);
    const head = await this.s3.headObject(row.s3Key);
    const expectedMime = normalizeMime(row.mimeType);
    const actualMime = normalizeMime(head.contentType ?? headers.contentType ?? '');
    const actualChecksum = (head.metadata?.sha256 ?? headers.checksumSha256 ?? '').toLowerCase();

    const mismatchReasons: string[] = [];
    if (actualMime !== expectedMime) {
      mismatchReasons.push('content_type_mismatch');
    }
    if (actualChecksum !== row.checksumSha256) {
      mismatchReasons.push('checksum_mismatch');
    }

    const database = this.requireDatabase();
    if (mismatchReasons.length > 0) {
      await database.tx(async (trx) => {
        await trx
          .update(documents)
          .set({
            scanStatus: 'quarantined',
            scanDetail: {
              mismatchReasons,
              actualMime,
              actualChecksum,
            },
            updatedAt: new Date(),
          })
          .where(eq(documents.id, id));

        await trx.softDelete(documents as never, id);
      });
      return { id, scanStatus: 'quarantined' };
    }

    await database.tx(async (trx) => {
      await trx
        .update(documents)
        .set({
          scanStatus: 'completed',
          scanDetail: {
            actualMime,
            actualChecksum,
            ...(typeof head.contentLength === 'number' ? { contentLength: head.contentLength } : {}),
          },
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));
    });
    return { id, scanStatus: 'completed' };
  }

  async getDownloadUrl(id: string): Promise<DownloadDocumentResult> {
    const row = await this.requireOwnedDocument(id);
    const download = await this.s3.presignDownload({
      key: row.s3Key,
      filename: row.filename,
    });
    return {
      id,
      url: download.url,
      expiresInSeconds: download.expiresInSeconds,
    };
  }

  async softRemove(id: string): Promise<void> {
    await this.requireOwnedDocument(id);
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      await trx.softDelete(documents as never, id);
    });
  }

  async restore(id: string): Promise<void> {
    this.requireTenantId();
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      await trx.restoreFromArchive(documents as never, id);
    });
  }

  async hardRemove(id: string): Promise<void> {
    this.requireTenantId();
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      const archived = await trx.query<{
        archive_id: string;
        tenant_id: string;
        s3_key: string;
      }>(
        `
          select archive_id, tenant_id::text, s3_key
          from archive.storage_documents
          where id = $1::uuid
          limit 1
        `,
        [id],
      );
      const current = archived.rows[0];
      if (!current) {
        throw new StorageDocumentNotFoundError(id);
      }
      if (current.tenant_id !== this.requireTenantId()) {
        throw new StorageTenantMismatchError(id);
      }
      await this.s3.deleteAllVersions(current.s3_key);
      await trx.hardDeleteFromArchive(BigInt(current.archive_id), {
        archiveTable: 'archive.storage_documents',
        confirm: 'I understand this is irrecoverable',
      });
    });
  }

  private async requireOwnedDocument(id: string): Promise<DocumentRow> {
    const row = await this.loadLiveDocument(id);
    if (!row) {
      throw new StorageDocumentNotFoundError(id);
    }
    if (row.tenantId !== this.requireTenantId()) {
      throw new StorageTenantMismatchError(id);
    }
    return row;
  }

  private async loadLiveDocument(id: string): Promise<DocumentRow | null> {
    const database = this.requireDatabase();
    return database.tx(async (trx) => {
      const result = await trx
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
      const row = result[0];
      if (!row) {
        return null;
      }
      return row as DocumentRow;
    }, { readonly: true, role: 'reader', replica: false });
  }

  private buildObjectKey(tenantId: string, collection: string, id: string, filename: string): string {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${tenantId}/${collection}/${yyyy}/${mm}/${dd}/${id}/1/${filename}`;
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to DocumentsService');
    }
    return database;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new StorageValidationError('Tenant context is required');
    }
    return tenantId;
  }

  private requireActorId(): string {
    const actorId = this.requestContext.actorId;
    if (!actorId) {
      throw new StorageValidationError('Actor context is required');
    }
    return actorId;
  }
}
