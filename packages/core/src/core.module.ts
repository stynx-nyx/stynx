import {
  type DynamicModule,
  type ForwardReference,
  type InjectionToken,
  type FactoryProvider,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule, ClsService } from 'nestjs-cls';
import { normalizeRequestId } from './request-id.js';
import { isProbeRequest, requestIdRejection } from './request-id-rejection.js';
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

// Nest's runtime accepts delayed forward references in factory injection and
// awaited class/forward-reference imports. Its published FactoryProvider and
// ModuleMetadata declarations describe a narrower subset. Validate the runtime
// shapes here, then install those fields reflectively without retyping a valid
// runtime value as the narrower vendor union or resolving it prematurely.
type RuntimeModuleImport = Type<unknown> | ForwardReference | DynamicModule | PromiseLike<unknown>;
type RuntimeInjectionToken = InjectionToken<unknown> | ForwardReference;
type RuntimeFactoryDependency =
  RuntimeInjectionToken | { token: RuntimeInjectionToken; optional: boolean };

function isModuleClass(value: unknown): value is Type<unknown> {
  return typeof value === 'function';
}

function isDynamicModule(value: unknown): value is DynamicModule {
  return (
    typeof value === 'object' && value !== null && 'module' in value && isModuleClass(value.module)
  );
}

function isForwardReference(value: unknown): value is ForwardReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'forwardRef' in value &&
    typeof value.forwardRef === 'function'
  );
}

function isRuntimeModuleImport(value: unknown): value is RuntimeModuleImport {
  if (isModuleClass(value) || isDynamicModule(value) || isForwardReference(value)) return true;
  // Nest awaits thenables when it compiles the module. Leave the original
  // thenable, its timing, and validation of its resolved module with Nest.
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function isRuntimeInjectionToken(value: unknown): value is RuntimeInjectionToken {
  return (
    typeof value === 'string' ||
    typeof value === 'symbol' ||
    typeof value === 'function' ||
    isForwardReference(value)
  );
}

function isRuntimeFactoryDependency(value: unknown): value is RuntimeFactoryDependency {
  return (
    isRuntimeInjectionToken(value) ||
    (typeof value === 'object' &&
      value !== null &&
      'token' in value &&
      isRuntimeInjectionToken(value.token) &&
      'optional' in value &&
      typeof value.optional === 'boolean')
  );
}

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
        method?: string;
        originalUrl?: string;
        url?: string;
        res?: { setHeader(name: string, value: string): void };
      },
    ) => {
      // A missing id is rejected exactly like an invalid one, before any guard
      // (authentication included) runs; no id is ever synthesised (SM-15).
      // Only a liveness/readiness probe may omit it, and then runs without a
      // request context (D-072).
      const rawRequestId = request.headers['x-request-id'];
      if (rawRequestId === undefined && isProbeRequest(request)) return;
      const requestId = normalizeRequestId(rawRequestId);
      if (!requestId) throw requestIdRejection();
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
    const imports = options.imports ?? [];
    const dependencies = options.inject ?? [];
    if (!imports.every(isRuntimeModuleImport)) {
      throw new TypeError('Invalid asynchronous core module import');
    }
    if (!dependencies.every(isRuntimeFactoryDependency)) {
      throw new TypeError('Invalid asynchronous core injection dependency');
    }
    const provider: FactoryProvider = {
      provide: STYNX_CORE_OPTIONS,
      useFactory: options.useFactory,
    };
    Reflect.set(provider, 'inject', dependencies);
    return this.createModule(provider, imports);
  }

  private static createModule(
    optionsProvider: Provider,
    imports: RuntimeModuleImport[] = [],
  ): DynamicModule {
    const module: DynamicModule = {
      module: StynxCoreModule,
      global: true,
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
    if (imports.length > 0) Reflect.set(module, 'imports', imports);
    return module;
  }
}
