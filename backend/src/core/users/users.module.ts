import { Module } from '@nestjs/common';
import { DatabaseModule } from '@shared/database/database.module';
import { AuthModule } from '@core/auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
