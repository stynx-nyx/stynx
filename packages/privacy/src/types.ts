export type PrivacyStrategy = 'nullify' | 'hash_with_salt' | 'tombstone' | 'delete_row';
export type PrivacyExportFormat = 'json' | 'csv';
export type PrivacyRetentionTarget = 'live' | 'archive' | 'both';

export interface PrivacyRetentionRule {
  timestampColumn: string;
  olderThanDays: number;
  target?: PrivacyRetentionTarget;
  reason?: string;
}

export interface PrivacyRule {
  tableSchema: string;
  tableName: string;
  columnName: string;
  strategy: PrivacyStrategy;
  category?: string;
  notes?: string;
  subjectColumn?: string;
  tenantColumn?: string;
  retention?: PrivacyRetentionRule;
}

export interface PrivacyMapOverrideFile {
  rules: PrivacyRule[];
}

export interface StynxPrivacyModuleOptions {
  environment: string;
  region: string;
  erasureSalt: string;
  appRoot?: string;
  bucketName?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  exportTtlSeconds?: number;
}

export interface PrivacyObjectStore {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    expiresAt?: Date;
  }): Promise<void>;
  presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string>;
}

export interface PrivacyCognitoAdmin {
  disableUser(subjectUserId: string): Promise<void>;
}

export interface PrivacyExportRequest {
  subjectUserId?: string;
  tenantId?: string;
  format: PrivacyExportFormat;
}

export interface PrivacyExportResult {
  exportId: string;
  objectKey: string;
  downloadUrl: string;
  expiresInSeconds: number;
  tables: Array<{ table: string; liveRows: number; archiveRows: number }>;
}

export interface PrivacyErasureRequest {
  subjectUserId: string;
}

export interface PrivacyErasureResult {
  subjectUserId: string;
  actions: Array<{
    table: string;
    column: string;
    strategy: PrivacyStrategy;
    liveAffected: number;
    archiveAffected: number;
  }>;
}

export interface PrivacyRetentionPlanItem {
  table: string;
  target: PrivacyRetentionTarget;
  strategy: PrivacyStrategy;
  affectedRows: number;
  reason: string;
}

export interface PrivacyRetentionResult {
  dryRun: boolean;
  actions: PrivacyRetentionPlanItem[];
}
