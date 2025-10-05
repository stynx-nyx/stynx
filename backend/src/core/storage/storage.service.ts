import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

export interface StorageFile {
  fileId: string;
  bucket: string;
  objectKey: string;
  filename: string;
  mimeType: string | null;
  ownerId: string | null;
  createdAt: Date;
}

@Injectable()
export class StorageService {
  constructor(private readonly db: DatabaseService) {}

  async listFiles(tenantId: string): Promise<StorageFile[]> {
    const result = await this.db.query<StorageFile>(
      `SELECT file_id as "fileId",
              bucket,
              object_key as "objectKey",
              filename,
              mime_type as "mimeType",
              owner_id as "ownerId",
              created_at as "createdAt"
         FROM storage.files
        WHERE tenancy_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 200`,
      [tenantId],
      { tenantId },
    );
    return result.rows;
  }

  async registerFile(payload: {
    tenantId: string;
    ownerId?: string;
    bucket: string;
    objectKey: string;
    filename: string;
    mimeType?: string;
  }): Promise<StorageFile> {
    const result = await this.db.query<StorageFile>(
      `INSERT INTO storage.files (tenancy_id, owner_id, bucket, object_key, filename, mime_type)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING file_id as "fileId",
                 bucket,
                 object_key as "objectKey",
                 filename,
                 mime_type as "mimeType",
                 owner_id as "ownerId",
                 created_at as "createdAt"`,
      [
        payload.tenantId,
        payload.ownerId ?? null,
        payload.bucket,
        payload.objectKey,
        payload.filename,
        payload.mimeType ?? null,
      ],
      { tenantId: payload.tenantId, userId: payload.ownerId },
    );
    return result.rows[0];
  }

  async markDeleted(tenantId: string, fileId: string, actorId: string): Promise<void> {
    await this.db.query(
      `UPDATE storage.files
          SET deleted_at = now(),
              updated_by = $3
        WHERE file_id = $2 AND tenancy_id = $1`,
      [tenantId, fileId, actorId],
      { tenantId, userId: actorId },
    );
  }
}
