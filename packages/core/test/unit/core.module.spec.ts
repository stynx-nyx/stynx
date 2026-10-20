import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { z } from 'zod';
import { StynxCoreModule } from '../../src/core.module.js';
import {
  STYNX_CORE_CONFIG,
  STYNX_CORE_OPTIONS,
  STYNX_SYSTEM_OPERATION_SINK,
} from '../../src/tokens.js';

// SM-20: the CLS import is static `@Module` metadata, read without forRoot().
function staticImports(): unknown[] {
  return (Reflect.getMetadata(MODULE_METADATA.IMPORTS, StynxCoreModule) ?? []) as unknown[];
}

describe('StynxCoreModule', () => {
  it('wires sync and async option providers plus global infrastructure', async () => {
    const options = {
      appName: 'core-test',
      schema: z.object({}),
    };
    const syncModule = StynxCoreModule.forRoot(options);
    expect(syncModule.global).toBe(true);
    expect(syncModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: STYNX_CORE_OPTIONS, useValue: options }),
        expect.objectContaining({ provide: STYNX_CORE_CONFIG }),
        expect.objectContaining({ provide: STYNX_SYSTEM_OPERATION_SINK }),
        expect.objectContaining({ provide: APP_INTERCEPTOR }),
        expect.objectContaining({ provide: APP_FILTER }),
      ]),
    );

    const asyncFactory = vi.fn(async () => options);
    const asyncModule = StynxCoreModule.forRootAsync({
      imports: [{ module: class DependencyModule {} }],
      inject: ['dep'],
      useFactory: asyncFactory,
    });
    // Only the caller's imports stay dynamic; the CLS import is static (SM-20).
    expect(asyncModule.imports).toHaveLength(1);
    expect(staticImports()).toHaveLength(1);
    expect(asyncModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: STYNX_CORE_OPTIONS,
          inject: ['dep'],
          useFactory: asyncFactory,
        }),
      ]),
    );

    const defaultAsyncModule = StynxCoreModule.forRootAsync({
      useFactory: asyncFactory,
    });
    expect(defaultAsyncModule.imports).toBe(undefined);
    expect(syncModule.imports).toBe(undefined);
    expect(defaultAsyncModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: STYNX_CORE_OPTIONS,
          inject: [],
        }),
      ]),
    );

    const sinkProvider = syncModule.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === STYNX_SYSTEM_OPERATION_SINK,
    ) as { useValue: { write: () => Promise<void> } };
    await expect(sinkProvider.useValue.write()).resolves.toBe(undefined);
  });

  it('reuses one global CLS root registration across composed core modules', () => {
    const first = StynxCoreModule.forRoot({
      appName: 'first-consumer',
      schema: z.object({}),
    });
    const second = StynxCoreModule.forRoot({
      appName: 'second-consumer',
      schema: z.object({}),
    });

    // Neither dynamic module carries its own CLS import; both share the one
    // static descriptor on the StynxCoreModule class (SM-20).
    expect(first.imports).toBe(undefined);
    expect(second.imports).toBe(undefined);
    expect(first.module).toBe(second.module);
    expect(staticImports()).toHaveLength(1);
  });

  it('mounts the shared CLS request seed before guards and keeps it on one descriptor', () => {
    const first = StynxCoreModule.forRoot({
      appName: 'first-consumer',
      schema: z.object({}),
    });
    const second = StynxCoreModule.forRoot({
      appName: 'second-consumer',
      schema: z.object({}),
    });

    expect(first.imports).toBe(undefined);
    const clsModuleDescriptor = staticImports()[0] as {
      imports?: Array<{
        providers?: Array<{ provide?: unknown; useValue?: { middleware?: unknown } }>;
      }>;
    };
    const clsRootDescriptor = clsModuleDescriptor.imports?.[0];
    const clsOptions = clsRootDescriptor?.providers?.find(
      (provider) => provider.useValue && typeof provider.useValue === 'object',
    )?.useValue;

    expect(clsOptions).toEqual(
      expect.objectContaining({
        middleware: expect.objectContaining({
          mount: true,
          setup: expect.any(Function),
        }),
      }),
    );
    expect(second.module).toBe(first.module);
    expect(staticImports()[0]).toBe(clsModuleDescriptor);
  });
});
