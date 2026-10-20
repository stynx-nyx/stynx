import {
  type DynamicModule,
  type ForwardReference,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule, ClsService } from 'nestjs-cls';
import { BadRequestException } from '@nestjs/common';
import { generateRequestId, normalizeRequestId } from './request-id.js';
import type { CoreClsStore } from './request-context.js';
import type { ZodTypeAny } from 'zod';
import {
  loadStynxConfiguration,
  type StynxCoreModuleAsyncOptions,
  type StynxCoreModuleOptions,
  StynxConfigService,
} from './config.js';
import { StynxErrorFilter } from './error.filter.js';
import { RequestContext, RequestContextMutator } from './request-context.js';
import { RequestContextInterceptor } from './request-context.interceptor.js';
import { SecretLoader } from './secret-loader.js';
import { SystemContext } from './system-context.js';
import { STYNX_CORE_CONFIG, STYNX_CORE_OPTIONS, STYNX_SYSTEM_OPERATION_SINK } from './tokens.js';

type ModuleImport = Type<unknown> | ForwardReference | DynamicModule | Promise<DynamicModule>;

// `nestjs-cls` creates a dynamic `ClsRootModule` for each `forRoot()` call.
// STYNX packages compose `StynxCoreModule.forRoot()` transitively, so creating
// that descriptor in every call produces multiple global ClsRootModule
// instances. Nest 11 performs the middleware-options lookup in the strict
// module context, which makes those duplicate roots fail during application
// boot. Keep one descriptor for the process and let every STYNX core import
// reference it.
const STYNX_CLS_MODULE = ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    setup: (
      cls: ClsService<CoreClsStore>,
      request: {
        headers: Record<string, unknown>;
        res?: { setHeader(name: string, value: string): void };
      },
    ) => {
      const supplied = request.headers['x-request-id'];
      const requestId = supplied === undefined ? generateRequestId() : normalizeRequestId(supplied);
      if (!requestId) throw new BadRequestException('X-Request-Id must be a valid UUIDv7');
      const rawLocale = request.headers['accept-language'];
      const locale = typeof rawLocale === 'string' ? rawLocale.split(',')[0]?.trim() : undefined;
      new RequestContextMutator(cls).initialize({
        requestId,
        startedAt: new Date(),
        ...(locale ? { locale } : {}),
      });
      request.res?.setHeader('X-Request-Id', requestId);
    },
  },
});

function createConfigProvider(): Provider {
  return {
    provide: STYNX_CORE_CONFIG,
    inject: [STYNX_CORE_OPTIONS],
    useFactory: async <TSchema extends ZodTypeAny>(options: StynxCoreModuleOptions<TSchema>) =>
      loadStynxConfiguration(options),
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

// Static imports keep the module graph statically readable (SM-20); only
// caller-supplied `forRootAsync({ imports })` stay on the dynamic module.
@Module({ imports: [STYNX_CLS_MODULE] })
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
    return this.createModule(
      {
        provide: STYNX_CORE_OPTIONS,
        inject: (options.inject ?? []) as never[],
        useFactory: options.useFactory,
      },
      (options.imports ?? []) as ModuleImport[],
    );
  }

  private static createModule(
    optionsProvider: Provider,
    imports: ModuleImport[] = [],
  ): DynamicModule {
    return {
      module: StynxCoreModule,
      global: true,
      ...(imports.length > 0 ? { imports } : {}),
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
