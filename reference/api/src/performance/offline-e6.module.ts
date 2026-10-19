import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module.js';
import { OfflinePerformanceStorageInstaller } from './offline-storage.js';

@Module({
  imports: [AppModule, StynxOfflineSyncModule.forRoot()],
  providers: [OfflinePerformanceStorageInstaller],
})
export class OfflineE6ApplicationModule {}
