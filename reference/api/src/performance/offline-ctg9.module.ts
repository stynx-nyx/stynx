import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module';
import { OfflinePerformanceStorageInstaller } from './offline-storage';
import { createOfflineBookmarkApplicationPorts } from './offline-bookmark';

@Module({
  imports: [
    AppModule,
    StynxOfflineSyncModule.forRoot({
      initialQueueStatus: 'pending',
      policyResolver: { resolve: async () => ({}) },
      ...createOfflineBookmarkApplicationPorts(),
    }),
  ],
  providers: [OfflinePerformanceStorageInstaller],
})
export class OfflineCTG9ApplicationModule {}
