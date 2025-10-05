import { Module } from '@nestjs/common';
import { DatabaseModule } from '@shared/database/database.module';
import { AuthModule } from '@core/auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
