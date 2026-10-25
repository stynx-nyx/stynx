import { StynxNotificationsModule } from '../../src/notifications.module.js';
import { STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS } from '../../src/tokens.js';

function factory(options: unknown) {
  const dynamic: unknown = Reflect.apply(StynxNotificationsModule.forRoot, StynxNotificationsModule, [options]);
  if (typeof dynamic !== 'object' || dynamic === null) throw new Error('Actual module required');
  const providers: unknown = Reflect.get(dynamic, 'providers');
  if (!Array.isArray(providers)) throw new Error('Actual providers required');
  const provider: unknown = providers.find((value: unknown) => typeof value === 'object' && value !== null && Reflect.get(value, 'provide') === STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS);
  if (typeof provider !== 'object' || provider === null) throw new Error('Actual adapter factory required');
  const create: unknown = Reflect.get(provider, 'useFactory');
  if (typeof create !== 'function') throw new Error('Actual adapter factory must be callable');
  return (...values: unknown[]) => {
    const result: unknown = Reflect.apply(create, undefined, values);
    if (!(result instanceof Map)) throw new Error('Actual adapter Map required');
    return result;
  };
}

describe('notification adapter map source preservation', () => {
  it('preserves built-in insertion order and custom key/value identities including overwrite', () => {
    const email = {}, sms = {}, push = {}, inapp = {}, replacement = {}, custom = {};
    const result = factory({ ses: {}, sns: {}, channelAdapters: { email: replacement, custom, push: replacement } })(email, sms, push, inapp);
    expect([...result.keys()]).toEqual(['email', 'sms', 'push', 'inapp', 'custom']);
    expect(result.get('email')).toBe(replacement); expect(result.get('push')).toBe(replacement); expect(result.get('sms')).toBe(sms); expect(result.get('inapp')).toBe(inapp); expect(result.get('custom')).toBe(custom);
  });
  it('retains own enumerable keys, ignores inherited/nonenumerable/symbol keys, and reads values in native order', () => {
    const events: string[] = []; const inherited = {}; const object = Object.create({ inherited });
    const custom = {}, zero = {};
    Object.defineProperties(object, { custom: { enumerable: true, get() { expect(this).toBe(object); events.push('custom'); return custom; } }, 0: { enumerable: true, get() { events.push('0'); return zero; } }, hidden: { value: {} } });
    Object.defineProperty(object, Symbol('ignored'), { enumerable: true, value: {} });
    const result = factory({ channelAdapters: object })({}, {}, {}, {});
    expect(events).toEqual(['0', 'custom']); expect([...result.keys()]).toEqual(['push', 'inapp', '0', 'custom']); expect(result.get('custom')).toBe(custom); expect(result.get('0')).toBe(zero);
  });
  it.each([undefined, null])('preserves nullish adapter default: %s', channelAdapters => {
    const push = {}, inapp = {}; const result = factory({ channelAdapters })({}, {}, push, inapp);
    expect([...result.keys()]).toEqual(['push', 'inapp']); expect(result.get('push')).toBe(push); expect(result.get('inapp')).toBe(inapp);
  });
  it('preserves the channelAdapters getter receiver and thrown identity', () => {
    const sentinel = new Error('adapter enumeration'); const options = { get channelAdapters() { expect(this).toBe(options); throw sentinel; } };
    let caught: unknown;
    try { factory(options)({}, {}, {}, {}); } catch (error) { caught = error; }
    expect(caught).toBe(sentinel);
  });
  it('retains own undefined and __proto__ entries without normalization', () => {
    const value = {}; const channelAdapters = Object.defineProperty({ custom: undefined }, '__proto__', { enumerable: true, value });
    const result = factory({ channelAdapters })({}, {}, {}, {});
    expect(result.has('custom')).toBe(true); expect(result.get('custom')).toBeUndefined(); expect(result.get('__proto__')).toBe(value);
  });
});
