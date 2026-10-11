import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module';
import { OfflinePerformanceStorageInstaller } from './offline-storage';
import { createOfflineBookmarkApplicationPorts } from './offline-bookmark';
import {
  createReferenceOfflineAgentResolver,
  OfflineReferenceAgentBindings,
} from './offline-agent';

@Module({
  imports: [
    AppModule,
    StynxOfflineSyncModule.forRoot({
      initialQueueStatus: 'pending',
      agentResolver: createReferenceOfflineAgentResolver(),
      policyResolver: { resolve: async () => ({}) },
      ...createOfflineBookmarkApplicationPorts(),
    }),
  ],
  providers: [OfflinePerformanceStorageInstaller, OfflineReferenceAgentBindings],
})
export class OfflineCTG9ApplicationModule {}
