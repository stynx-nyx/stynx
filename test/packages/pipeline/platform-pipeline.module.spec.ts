import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from '@stynx/idempotency';
import { RateLimitGuard } from '@stynx/ratelimit';
import { SlaMonitorInterceptor } from '../../../packages/backend/src/sla/sla-monitor.interceptor';
import { StynxPlatformPipelineModule } from '../../../packages/backend/src/pipeline/platform-pipeline.module';

describe('StynxPlatformPipelineModule', () => {
  it('registers PEC-like global stack by default', () => {
    const dynamicModule = StynxPlatformPipelineModule.forRoot();
    const providers = dynamicModule.providers ?? [];

    expect(dynamicModule.imports).toHaveLength(3);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_GUARD,
          useExisting: RateLimitGuard,
        }),
        expect.objectContaining({
          provide: APP_INTERCEPTOR,
          useExisting: SlaMonitorInterceptor,
        }),
        expect.objectContaining({
          provide: APP_INTERCEPTOR,
          useExisting: IdempotencyInterceptor,
        }),
      ]),
    );
  });

  it('supports disabling specific global concerns', () => {
    const dynamicModule = StynxPlatformPipelineModule.forRoot({
      sla: false,
      idempotency: false,
    });
    const providers = dynamicModule.providers ?? [];

    expect(dynamicModule.imports).toHaveLength(1);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_GUARD,
          useExisting: RateLimitGuard,
        }),
      ]),
    );
    expect(providers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_INTERCEPTOR,
          useExisting: SlaMonitorInterceptor,
        }),
      ]),
    );
  });
});
