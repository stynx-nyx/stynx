import { generateRequestId } from '@stynx-nyx/core';
import supertest from 'supertest';

export type { Response, Test } from 'supertest';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'head', 'options']);

type SupertestApp = Parameters<typeof supertest>[0];
type SupertestOptions = Parameters<typeof supertest>[1];

/**
 * `supertest` as a well-behaved STYNX client: every request carries a fresh
 * client-minted UUIDv7 `X-Request-Id`, because STYNX rejects a missing id with
 * 400 VALIDATION and never synthesises one (SM-15). A test that sets
 * `x-request-id` itself overrides this value; a test that probes a missing id
 * imports plain `supertest` instead.
 */
export default function request(app: SupertestApp, options?: SupertestOptions) {
  const agent = supertest(app, options);
  return new Proxy(agent, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (
        typeof property === 'string' &&
        HTTP_METHODS.has(property) &&
        typeof value === 'function'
      ) {
        return (...args: unknown[]) =>
          (value as (...input: unknown[]) => supertest.Test)
            .apply(target, args)
            .set('X-Request-Id', generateRequestId());
      }
      return value;
    },
  });
}
