import { Inject, Injectable } from '@nestjs/common';
import { StynxObjectStore } from '@stynx-nyx/storage';
import { STYNX_PRIVACY_OPTIONS } from './tokens';
import type { PrivacyObjectStore, StynxPrivacyModuleOptions } from './types';

@Injectable()
export class PrivacyObjectStoreService implements PrivacyObjectStore {
  private readonly objectStore: StynxObjectStore;

  constructor(
    @Inject(STYNX_PRIVACY_OPTIONS)
    private readonly options: StynxPrivacyModuleOptions,
  ) {
    this.objectStore = new StynxObjectStore({
      bucketName: options.bucketName ?? `stynx-privacy-${options.environment}`,
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle !== undefined ? { forcePathStyle: options.forcePathStyle } : {}),
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    expiresAt?: Date;
  }): Promise<void> {
    await this.objectStore.putObject(input);
  }

  async presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string> {
    return this.objectStore.presignDownload(input);
  }
}
