import { Module } from '@nestjs/common';
import { DatabaseModule } from '@shared/database/database.module';
import { AuthModule } from '@core/auth/auth.module';
import { TenancyController } from './tenancy.controller';
import { TenancyService } from './tenancy.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TenancyController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
