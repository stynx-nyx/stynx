import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { z } from 'zod';
import { StynxCoreModule } from '../../src/core.module';
import { STYNX_CORE_CONFIG, STYNX_CORE_OPTIONS, STYNX_SYSTEM_OPERATION_SINK } from '../../src/tokens';

describe('StynxCoreModule', () => {
  it('wires sync and async option providers plus global infrastructure', async () => {
    const options = {
      appName: 'core-test',
      schema: z.object({}),
    };
    const syncModule = StynxCoreModule.forRoot(options);
    expect(syncModule.global).toBe(true);
    expect(syncModule.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: STYNX_CORE_OPTIONS, useValue: options }),
      expect.objectContaining({ provide: STYNX_CORE_CONFIG }),
      expect.objectContaining({ provide: STYNX_SYSTEM_OPERATION_SINK }),
      expect.objectContaining({ provide: APP_INTERCEPTOR }),
      expect.objectContaining({ provide: APP_FILTER }),
    ]));

    const asyncFactory = vi.fn(async () => options);
    const asyncModule = StynxCoreModule.forRootAsync({
      imports: [{ module: class DependencyModule {} }],
      inject: ['dep'],
      useFactory: asyncFactory,
    });
    expect(asyncModule.imports).toHaveLength(2);
    expect(asyncModule.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provide: STYNX_CORE_OPTIONS,
        inject: ['dep'],
        useFactory: asyncFactory,
      }),
    ]));

    const defaultAsyncModule = StynxCoreModule.forRootAsync({
      useFactory: asyncFactory,
    });
    expect(defaultAsyncModule.imports).toHaveLength(1);
    expect(defaultAsyncModule.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provide: STYNX_CORE_OPTIONS,
        inject: [],
      }),
    ]));

    const sinkProvider = syncModule.providers?.find((provider) =>
      typeof provider === 'object'
      && provider !== null
      && 'provide' in provider
      && provider.provide === STYNX_SYSTEM_OPERATION_SINK,
    ) as { useValue: { write: () => Promise<void> } };
    await expect(sinkProvider.useValue.write()).resolves.toBeUndefined();
  });
});
