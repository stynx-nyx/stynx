import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransactionalIdempotencyStore } from '@stynx-nyx/idempotency';
import {
  CommandModuleRequiredInterceptor,
  CommittedCommandResponseFilter,
  STYNX_TRANSACTIONAL_COMMAND_OPTIONS,
  TransactionalCommandInterceptor,
  type StynxTransactionalCommandModuleOptions,
} from './transactional-command';

@Module({})
export class StynxTransactionalCommandModule {
  static forRoot(options: StynxTransactionalCommandModuleOptions): DynamicModule {
    if (!options?.auditSink || typeof options.auditSink.writeInTransaction !== 'function') {
      throw new Error('Transactional command requires a same-transaction audit sink');
    }
    return {
      module: StynxTransactionalCommandModule,
      providers: [
        { provide: STYNX_TRANSACTIONAL_COMMAND_OPTIONS, useValue: options },
        TransactionalIdempotencyStore,
        TransactionalCommandInterceptor,
        CommandModuleRequiredInterceptor,
        CommittedCommandResponseFilter,
        { provide: APP_INTERCEPTOR, useExisting: TransactionalCommandInterceptor },
      ],
      exports: [TransactionalCommandInterceptor, TransactionalIdempotencyStore],
    };
  }
}
