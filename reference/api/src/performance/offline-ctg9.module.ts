import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module.js';
import { OfflinePerformanceStorageInstaller } from './offline-storage.js';
import { createOfflineBookmarkApplicationPorts } from './offline-bookmark.js';
import {
  createReferenceOfflineAgentResolver,
  OfflineReferenceAgentBindings,
} from './offline-agent.js';

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
