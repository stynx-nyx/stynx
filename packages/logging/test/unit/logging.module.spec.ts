import { RequestLoggingMiddleware } from '../../src/request-logging.middleware';
import { StynxLoggingModule } from '../../src/logging.module';
import { STYNX_LOGGING_OPTIONS } from '../../src/tokens';

describe('StynxLoggingModule', () => {
  it('wires default options and applies the request middleware', () => {
    const module = StynxLoggingModule.forRoot();
    expect(module.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: STYNX_LOGGING_OPTIONS, useValue: {} }),
    ]));

    const consumer = {
      apply: vi.fn(() => ({ forRoutes: vi.fn() })),
    };
    new StynxLoggingModule().configure(consumer as never);
    expect(consumer.apply).toHaveBeenCalledWith(RequestLoggingMiddleware);
  });
});
