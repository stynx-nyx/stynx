import { Module } from '@nestjs/common';
import { DatabaseModule } from '@shared/database/database.module';
import { AuthModule } from '@core/auth/auth.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
