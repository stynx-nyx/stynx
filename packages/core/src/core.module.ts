import {
  type DynamicModule,
  type ForwardReference,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import type { ZodTypeAny } from 'zod';
import {
  loadStynxConfiguration,
  type StynxCoreModuleAsyncOptions,
  type StynxCoreModuleOptions,
  StynxConfigService,
} from './config';
import { StynxErrorFilter } from './error.filter';
import { RequestContext, RequestContextMutator } from './request-context';
import { RequestContextInterceptor } from './request-context.interceptor';
import { SecretLoader } from './secret-loader';
import { SystemContext } from './system-context';
import { STYNX_CORE_CONFIG, STYNX_CORE_OPTIONS, STYNX_SYSTEM_OPERATION_SINK } from './tokens';

type ModuleImport = Type<unknown> | ForwardReference | DynamicModule | Promise<DynamicModule>;

function createConfigProvider(): Provider {
  return {
    provide: STYNX_CORE_CONFIG,
    inject: [STYNX_CORE_OPTIONS],
    useFactory: async <TSchema extends ZodTypeAny>(
      options: StynxCoreModuleOptions<TSchema>,
    ) => loadStynxConfiguration(options),
  };
}

function createSystemOperationSinkProvider(): Provider {
  return {
    provide: STYNX_SYSTEM_OPERATION_SINK,
    useValue: {
      write: async () => undefined,
    },
  };
}

@Module({})
export class StynxCoreModule {
  static forRoot<TSchema extends ZodTypeAny>(
    options: StynxCoreModuleOptions<TSchema>,
  ): DynamicModule {
    return this.createModule({
      provide: STYNX_CORE_OPTIONS,
      useValue: options,
    });
  }

  static forRootAsync<TSchema extends ZodTypeAny>(
    options: StynxCoreModuleAsyncOptions<TSchema>,
  ): DynamicModule {
    return this.createModule({
      provide: STYNX_CORE_OPTIONS,
      inject: (options.inject ?? []) as never[],
      useFactory: options.useFactory,
    }, (options.imports ?? []) as ModuleImport[]);
  }

  private static createModule(
    optionsProvider: Provider,
    imports: ModuleImport[] = [],
  ): DynamicModule {
    return {
      module: StynxCoreModule,
      global: true,
      imports: [ClsModule.forRoot({ global: true }), ...imports],
      providers: [
        optionsProvider,
        createConfigProvider(),
        createSystemOperationSinkProvider(),
        RequestContext,
        RequestContextMutator,
        StynxConfigService,
        SecretLoader,
        SystemContext,
        {
          provide: APP_INTERCEPTOR,
          useClass: RequestContextInterceptor,
        },
        {
          provide: APP_FILTER,
          useClass: StynxErrorFilter,
        },
      ],
      exports: [
        STYNX_CORE_OPTIONS,
        STYNX_CORE_CONFIG,
        STYNX_SYSTEM_OPERATION_SINK,
        RequestContext,
        RequestContextMutator,
        StynxConfigService,
        SecretLoader,
        SystemContext,
      ],
    };
  }
}
