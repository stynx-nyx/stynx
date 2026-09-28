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
    if (options.mismatchCode !== undefined
      && (typeof options.mismatchCode !== 'string'
        || !/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[a-zA-Z][a-zA-Z0-9_*-]*$/u.test(options.mismatchCode))) {
      throw new Error('Transactional command mismatchCode must match the error envelope errorCode pattern');
    }
    if (options.lockTimeoutMs !== undefined
      && (!Number.isSafeInteger(options.lockTimeoutMs) || options.lockTimeoutMs < 1)) {
      throw new Error('Transactional command lockTimeoutMs must be a positive safe integer');
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
