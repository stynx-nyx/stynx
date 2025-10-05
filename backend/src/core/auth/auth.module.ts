import { Module } from '@nestjs/common';
import { AuditModule } from '@core/audit/audit.module';
import { DatabaseModule } from '@shared/database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BiometricService } from './biometric.service';
import { CognitoSyncService } from './cognito-sync.service';
import { DigitalSigningService } from './digital-signing.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RoleGuard } from './guards/role.guard';
import { TenancyGuard } from './guards/tenancy.guard';
import { UserGuard } from './guards/user.guard';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CognitoSyncService,
    JwtAuthGuard,
    UserGuard,
    RoleGuard,
    TenancyGuard,
    BiometricService,
    DigitalSigningService,
  ],
  exports: [
    AuthService,
    CognitoSyncService,
    JwtAuthGuard,
    UserGuard,
    RoleGuard,
    TenancyGuard,
    BiometricService,
    DigitalSigningService,
  ],
})
export class AuthModule {}
