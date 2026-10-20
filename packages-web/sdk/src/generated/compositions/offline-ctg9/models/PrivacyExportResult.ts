/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PrivacyExportResult = {
  downloadUrl: string;
  expiresInSeconds: number;
  exportId: string;
  objectKey: string;
  tables: Array<{
    archiveRows: number;
    liveRows: number;
    table: string;
  }>;
};
