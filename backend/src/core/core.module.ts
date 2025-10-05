import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { RolesModule } from './roles/roles.module';
import { StorageModule } from './storage/storage.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LoggingModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    TenancyModule,
    StorageModule,
    HealthModule,
  ],
  exports: [
    LoggingModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    TenancyModule,
    StorageModule,
    HealthModule,
  ],
})
export class CoreModule {}
