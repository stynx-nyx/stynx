import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';
import { AppModule } from '../app.module';

@Module({
  imports: [
    AppModule,
    StynxOfflineSyncModule.forRoot({
      initialQueueStatus: 'pending',
      policyResolver: { resolve: async () => ({}) },
    }),
  ],
})
export class OfflineCTG9ApplicationModule {}
