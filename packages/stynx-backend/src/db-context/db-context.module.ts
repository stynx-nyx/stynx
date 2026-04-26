import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { DbContextApplier } from '@stech/stynx-contracts';
import { DbContextInterceptor, type DbClientResolver } from './db-context.interceptor';
import {
  STYNX_DB_CLIENT_RESOLVER,
  STYNX_DB_CONTEXT_APPLIER,
  STYNX_REQUEST_DB_CLIENT_LIFECYCLE,
} from './constants';
import {
  PgSessionDbContextApplier,
  type PgSessionDbContextApplierOptions,
} from './pg-session-db-context.applier';
import type { RequestDbClientLifecycle } from './request-db-client-lifecycle';

export interface StynxDbContextModuleOptions {
  applier?: DbContextApplier;
  pgSessionApplier?: PgSessionDbContextApplierOptions;
  clientResolver?: DbClientResolver;
  requestDbClientLifecycle?: RequestDbClientLifecycle;
}

@Module({})
export class StynxDbContextModule {
  static forRoot(options: StynxDbContextModuleOptions): DynamicModule {
    const applier =
      options.applier ??
      (options.pgSessionApplier
        ? new PgSessionDbContextApplier(options.pgSessionApplier)
        : undefined);

    if (!applier) {
      throw new Error(
        'StynxDbContextModule.forRoot requires either `applier` or `pgSessionApplier`',
      );
    }

    const providers: Provider[] = [
      { provide: STYNX_DB_CONTEXT_APPLIER, useValue: applier },
      DbContextInterceptor,
    ];

    if (options.clientResolver) {
      providers.push({ provide: STYNX_DB_CLIENT_RESOLVER, useValue: options.clientResolver });
    }
    if (options.requestDbClientLifecycle) {
      providers.push({
        provide: STYNX_REQUEST_DB_CLIENT_LIFECYCLE,
        useValue: options.requestDbClientLifecycle,
      });
    }

    return {
      module: StynxDbContextModule,
      providers,
      exports: providers,
    };
  }
}
