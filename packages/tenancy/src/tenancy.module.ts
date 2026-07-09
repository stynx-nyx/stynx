import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { MembershipAccessCache } from './membership-cache';
import { TENANT_SYSTEM_OPERATION_SINK_PROVIDER, TenantSystemOperationSink } from './tenant-system-operation.sink';
import { TenancyController } from './tenancy.controller';
import { TenancyPlatformAdminGuard } from './tenancy-platform-admin.guard';
import { TenancyService } from './tenancy.service';
import {
  STYNX_TENANCY_OPTIONS,
  STYNX_TENANT_ARCHIVE_EXPORTER,
  STYNX_TENANT_INVITE_SENDER,
  STYNX_TENANT_MEMBERSHIP_CACHE,
  STYNX_TENANT_PREFIX_PROVISIONER,
  STYNX_TENANT_PURGE_DELEGATE,
} from './tokens';
import { resolveTenancyOptions, type StynxTenancyModuleOptions } from './types';

@Module({})
export class StynxTenancyModule {
  static forRoot(options: StynxTenancyModuleOptions): DynamicModule {
    return {
      module: StynxTenancyModule,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'tenancy',
          schema: z.object({}),
        }),
      ],
      controllers: [TenancyController],
      providers: [
        {
          provide: STYNX_TENANCY_OPTIONS,
          useValue: resolveTenancyOptions(options),
        },
        {
          provide: STYNX_TENANT_MEMBERSHIP_CACHE,
          useFactory: (resolved: ReturnType<typeof resolveTenancyOptions>) =>
            new MembershipAccessCache(resolved.membershipCacheTtlMs, resolved.membershipCacheMaxEntries),
          inject: [STYNX_TENANCY_OPTIONS],
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: TenantContextInterceptor,
        },
        TENANT_SYSTEM_OPERATION_SINK_PROVIDER,
        {
          provide: STYNX_TENANT_PREFIX_PROVISIONER,
          useValue: null,
        },
        {
          provide: STYNX_TENANT_INVITE_SENDER,
          useValue: null,
        },
        {
          provide: STYNX_TENANT_ARCHIVE_EXPORTER,
          useValue: null,
        },
        {
          provide: STYNX_TENANT_PURGE_DELEGATE,
          useValue: null,
        },
        TenantContextInterceptor,
        TenantSystemOperationSink,
        TenancyPlatformAdminGuard,
        TenancyService,
      ],
      exports: [
        StynxCoreModule,
        STYNX_TENANCY_OPTIONS,
        STYNX_TENANT_MEMBERSHIP_CACHE,
        STYNX_TENANT_PREFIX_PROVISIONER,
        STYNX_TENANT_INVITE_SENDER,
        STYNX_TENANT_ARCHIVE_EXPORTER,
        STYNX_TENANT_PURGE_DELEGATE,
        TenantContextInterceptor,
        TenancyPlatformAdminGuard,
        TenancyService,
      ],
    };
  }
}
