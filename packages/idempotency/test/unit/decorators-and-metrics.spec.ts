import 'reflect-metadata';
import { STYNX_IDEMPOTENT_ROUTE, STYNX_NO_IDEMPOTENT_ROUTE } from '../../src/constants';
import { Idempotent, NoIdempotent } from '../../src/decorators';
import { InMemoryIdempotencyMetrics } from '../../src/metrics';

describe('idempotency decorators and metrics', () => {
  it('attaches idempotency metadata with default and custom options', () => {
    class Controller {
      defaultHandler(): void {}
      customHandler(): void {}
      disabledHandler(): void {}
    }

    Idempotent()(Controller.prototype, 'defaultHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'defaultHandler')!);
    Idempotent('X-Key', 123)(Controller.prototype, 'customHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'customHandler')!);
    NoIdempotent()(Controller.prototype, 'disabledHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'disabledHandler')!);

    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.defaultHandler)).toEqual({
      headerName: 'Idempotency-Key',
    });
    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.customHandler)).toEqual({
      headerName: 'X-Key',
      ttlMs: 123,
    });
    expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, Controller.prototype.disabledHandler)).toBe(true);
  });

  it('tracks replay counts in memory', () => {
    const metrics = new InMemoryIdempotencyMetrics();
    expect(metrics.snapshot()).toEqual({ replayCount: 0 });
    metrics.incrementReplay();
    metrics.incrementReplay();
    expect(metrics.snapshot()).toEqual({ replayCount: 2 });
  });
});
