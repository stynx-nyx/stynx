import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module';
import { OfflinePerformanceStorageInstaller } from './offline-storage';

@Module({
  imports: [AppModule, StynxOfflineSyncModule.forRoot()],
  providers: [OfflinePerformanceStorageInstaller],
})
export class OfflineE6ApplicationModule {}
