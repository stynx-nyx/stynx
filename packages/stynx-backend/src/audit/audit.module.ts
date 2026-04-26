import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { AuditSink } from '@stech/stynx-contracts';
import { AuditInterceptor } from './audit.interceptor';
import { STYNX_AUDIT_METADATA_REDACTION_POLICY, STYNX_AUDIT_SINK } from './constants';
import type { AuditMetadataRedactionPolicy } from './redaction-policy';

export interface StynxAuditModuleOptions {
  sink: AuditSink;
  metadataRedactionPolicy?: AuditMetadataRedactionPolicy;
}

@Module({})
export class StynxAuditModule {
  static forRoot(options: StynxAuditModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_AUDIT_SINK, useValue: options.sink },
      AuditInterceptor,
    ];
    if (options.metadataRedactionPolicy) {
      providers.push({
        provide: STYNX_AUDIT_METADATA_REDACTION_POLICY,
        useValue: options.metadataRedactionPolicy,
      });
    }

    return {
      module: StynxAuditModule,
      providers,
      exports: providers,
    };
  }
}
