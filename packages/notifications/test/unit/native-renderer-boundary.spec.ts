import { describe, expect, it } from 'vitest';
import { NotificationTemplateRenderer } from '../../src/templates/render.js';

const template = { id: 'native', version: 1, supportedChannels: ['inapp'] as const, bodyKey: 'body' };
function renderer(translate: (key: string) => unknown) {
  return new NotificationTemplateRenderer({ get: () => ({ translate }) } as never);
}
function renderBody(value: unknown) {
  return renderer(() => value).render(template, 'en-US', {});
}

describe('native renderer truncation preserves observed operations', () => {
  it.each([
    { label: 'zero', length: 0, short: true }, { label: 'boundary', length: 120, short: true },
    { label: 'long', length: 121, short: false }, { label: 'fraction', length: 120.5, short: false },
    { label: 'nan', length: NaN, short: false }, { label: 'infinity', length: Infinity, short: false },
    { label: 'negative infinity', length: -Infinity, short: true }, { label: 'null', length: null, short: true },
    { label: 'undefined', length: undefined, short: false }, { label: 'true', length: true, short: true },
    { label: 'false', length: false, short: true }, { label: 'empty', length: '', short: true },
    { label: 'string boundary', length: '120', short: true }, { label: 'string long', length: '121', short: false },
    { label: 'nonnumeric', length: 'bad', short: false }, { label: 'bigint boundary', length: 120n, short: true },
    { label: 'bigint long', length: 121n, short: false }, { label: 'huge positive', length: 10n ** 400n, short: false },
    { label: 'huge negative', length: -(10n ** 400n), short: true },
  ])('$label retains identity or the exact slice receiver and bounds', ({ length, short }) => {
    const calls: unknown[] = [];
    const value = {
      get length() { expect(this).toBe(value); calls.push('length'); return length; },
      get slice() {
        expect(this).toBe(value); calls.push('slice:get');
        return function (this: unknown, start: number, end: number) {
          expect(this).toBe(value); calls.push(['slice:call', start, end]); return 'cut';
        };
      },
    };
    const result = renderBody(value);
    expect(result.body).toBe(value);
    expect(result.inAppTitle).toBe(short ? value : 'cut…');
    expect(calls).toEqual(short ? ['length'] : ['length', 'slice:get', ['slice:call', 0, 119]]);
  });

  it.each([121, 121n, '121', 120])('length coercion %# uses number hint before slice and string hint afterward', (primitive) => {
    const calls: unknown[] = [];
    const value = {
      get length() { calls.push('length'); return { [Symbol.toPrimitive](hint: string) { calls.push(['length:primitive', hint]); return primitive; } }; },
      get slice() {
        calls.push('slice:get');
        return function (this: unknown, ...args: unknown[]) {
          expect(this).toBe(value); calls.push(['slice:call', ...args]);
          return { [Symbol.toPrimitive](hint: string) { calls.push(['result:primitive', hint]); return 'cut'; } };
        };
      },
    };
    expect(renderBody(value).inAppTitle).toBe(primitive === 120 ? value : 'cut…');
    expect(calls).toEqual(primitive === 120 ? ['length', ['length:primitive', 'number']] :
      ['length', ['length:primitive', 'number'], 'slice:get', ['slice:call', 0, 119], ['result:primitive', 'string']]);
  });

  it.each(['length', 'length:primitive', 'slice:get', 'slice:call', 'result:primitive'])('%s exception retains identity and stops later effects', (phase) => {
    const marker = new Error(phase); const calls: string[] = [];
    const observe = (step: string) => { calls.push(step); if (step === phase) throw marker; };
    const value = {
      get length() { observe('length'); return { [Symbol.toPrimitive]() { observe('length:primitive'); return 121; } }; },
      get slice() { observe('slice:get'); return function (this: unknown) { expect(this).toBe(value); observe('slice:call'); return { [Symbol.toPrimitive]() { observe('result:primitive'); return 'cut'; } }; }; },
    };
    expect(() => renderBody(value)).toThrow(marker);
    try { renderBody(value); } catch (error) { expect(error).toBe(marker); }
    const order = ['length', 'length:primitive', 'slice:get', 'slice:call', 'result:primitive'];
    expect(calls).toEqual([...order.slice(0, order.indexOf(phase) + 1), ...order.slice(0, order.indexOf(phase) + 1)]);
  });

  it.each([undefined, null, 1, {}, true])('noncallable slice %# preserves native failure after length', (slice) => {
    const calls: string[] = [];
    const value = { get length() { calls.push('length'); return 121; }, get slice() { calls.push('slice'); return slice; } };
    expect(() => renderBody(value)).toThrow('value.slice is not a function');
    expect(calls).toEqual(['length', 'slice']);
  });

  it.each([null, undefined])('nullish body %# retains native length access error', (body) => {
    expect(() => renderBody(body)).toThrow(`Cannot read properties of ${String(body)} (reading 'length')`);
  });
  it.each([3, 3n, Symbol('body')])('opaque primitive body %# is not normalized', (body) => {
    expect(() => renderBody(body)).toThrow('value.slice is not a function');
  });
  it('Symbol length fails before slice lookup', () => {
    const value = { length: Symbol('length'), get slice() { throw new Error('slice must not be read'); } };
    expect(() => renderBody(value)).toThrow(TypeError);
  });
  it.each([[1, 2], function opaque() {}, Object.create({ length: 2 })])('short non-string body %# retains exact identity', (body) => {
    expect(renderBody(body).inAppTitle).toBe(body);
  });
});

describe('native renderer content and evaluation order', () => {
  it('preserves rich subject/body/title identities in their existing order', () => {
    const subject = {}; const body = Symbol('body'); const title = () => undefined; const calls: string[] = [];
    const values: Record<string, unknown> = { subject, body, title };
    const result = renderer((key) => { calls.push(key); return values[key]; }).render(
      { ...template, subjectKey: 'subject', inAppTitleKey: 'title' }, 'en-US', {},
    );
    expect(result.subject).toBe(subject); expect(result.body).toBe(body); expect(result.inAppTitle).toBe(title);
    expect(calls).toEqual(['subject', 'body', 'title']);
  });
  it.each([undefined, null, false, 0, ''])('subject %# retains exact omission and nullish fallback', (subject) => {
    const body = ['opaque'];
    const result = renderer((key) => key === 'subject' ? subject : body).render({ ...template, subjectKey: 'subject' }, 'en-US', {});
    expect(Object.hasOwn(result, 'subject')).toBe(subject !== undefined);
    expect(result.subject).toBe(subject);
    expect(result.inAppTitle).toBe(subject ?? body);
  });
});
