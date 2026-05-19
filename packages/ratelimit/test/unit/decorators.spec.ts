import 'reflect-metadata';
import { STYNX_RATE_LIMIT_ROUTE } from '../../src/constants';
import { RateLimit } from '../../src/decorators';

describe('RateLimit decorator', () => {
  it('attaches route metadata', () => {
    class Controller {
      handler(): void {}
    }

    RateLimit({ limit: 5, ttlSeconds: 60 })(Controller.prototype, 'handler', Object.getOwnPropertyDescriptor(Controller.prototype, 'handler')!);

    expect(Reflect.getMetadata(STYNX_RATE_LIMIT_ROUTE, Controller.prototype.handler)).toEqual({
      limit: 5,
      ttlSeconds: 60,
    });
  });
});
