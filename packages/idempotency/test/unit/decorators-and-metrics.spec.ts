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

  it('marks the object overload as transactional while preserving the positional overload', () => {
    class Controller {
      transactional(): void {}
      legacy(): void {}
    }

    const objectOverload = Idempotent as unknown as (options: {
      transactional: true;
      headerName?: string;
      ttlMs?: number;
    }) => MethodDecorator;
    objectOverload({ transactional: true, headerName: 'X-Command-Key', ttlMs: 30000 })(
      Controller.prototype, 'transactional', Object.getOwnPropertyDescriptor(Controller.prototype, 'transactional')!,
    );
    Idempotent('X-Legacy-Key', 30000)(
      Controller.prototype, 'legacy', Object.getOwnPropertyDescriptor(Controller.prototype, 'legacy')!,
    );

    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.transactional)).toEqual({
      transactional: true,
      headerName: 'X-Command-Key',
      ttlMs: 30000,
    });
    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.legacy)).toEqual({
      headerName: 'X-Legacy-Key',
      ttlMs: 30000,
    });
  });

  it('omits a zero positional TTL so the configured default remains authoritative', () => {
    class Controller { handler(): void {} }
    Idempotent('X-Key', 0)(
      Controller.prototype, 'handler', Object.getOwnPropertyDescriptor(Controller.prototype, 'handler')!,
    );
    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.handler))
      .toEqual({ headerName: 'X-Key' });
  });

  it('defaults the header name for object options without an override', () => {
    class Controller { handler(): void {} }
    Idempotent({ transactional: true })(
      Controller.prototype, 'handler', Object.getOwnPropertyDescriptor(Controller.prototype, 'handler')!,
    );
    expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, Controller.prototype.handler))
      .toEqual({ transactional: true, headerName: 'Idempotency-Key' });
  });
});
