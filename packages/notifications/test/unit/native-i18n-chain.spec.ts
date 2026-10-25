import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { RequestContext, SystemContext, StynxError, StynxErrorFilter, STYNX_ERROR_TRANSLATOR } from '@stynx-nyx/core';
import { Database, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { CatalogService, LocaleService, ErrorTranslatorService } from '@stynx-nyx/i18n';
import { LocalizedErrorFilter } from '../../../i18n/src/localized-error.filter.js';
import { NotificationTemplateRenderer } from '../../src/templates/render.js';
import { NotificationDispatchService } from '../../src/dispatch.service.js';
import { InAppPostgresChannelAdapter } from '../../src/adapters/inapp-postgres.adapter.js';

afterEach(() => vi.restoreAllMocks());
const UUID = '11111111-1111-4111-8111-111111111111';
const i18nRequire = createRequire(resolve(__dirname, '../../../i18n/package.json'));
const pgRequire = createRequire(createRequire(resolve(__dirname, '../../package.json')).resolve('@stynx-nyx/data'));
const { prepareValue } = pgRequire(resolve(pgRequire.resolve('pg'), '../utils.js'));
const expressRequire = createRequire(i18nRequire.resolve('@nestjs/platform-express'));
const nativeJson = expressRequire('express').response.json;

function nativeValues() {
  const object = { opaque: true }; const array = [object]; const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  return [
    { name: 'object', value: object, single: object, rich: object },
    { name: 'array', value: array, single: array, rich: object },
    { name: 'true', value: true, single: true, rich: true }, { name: 'false', value: false, single: '', rich: false },
    { name: 'null', value: null, single: '', rich: null }, { name: 'undefined', value: undefined, single: '', rich: undefined },
    { name: 'number', value: 12, single: '12', rich: 12 }, { name: 'bigint', value: 4n, single: '4', rich: 4n },
    ...[Symbol('native'), () => object, cycle].map((value, index) => ({ name: ['symbol', 'function', 'cycle'][index], value, single: value, rich: value })),
  ];
}
function chain() {
  let catalog: CatalogService; let translator: ErrorTranslatorService;
  const context = { hasActiveContext: () => true, locale: 'en-US', tenantId: undefined, actorId: undefined };
  const moduleRef = { get(token: unknown) {
    if (token === RequestContext) return context;
    if (token === SystemContext) return { current() { throw new Error('system denied'); } };
    if (token === CatalogService) return catalog;
    if (token === ErrorTranslatorService || token === STYNX_ERROR_TRANSLATOR) return translator;
    return undefined;
  } };
  const messages = { single: '{value}', mixed: 'before {value} after', rich: '<rich>text</rich>', need: '{missing}', malformed: '{broken' };
  catalog = new CatalogService(moduleRef as never, { catalogs: { 'en-US': messages, 'pt-BR': messages } });
  const locale = new LocaleService(moduleRef as never, catalog); translator = new ErrorTranslatorService(locale);
  return { catalog, locale, translator, moduleRef, context };
}

describe('genuine native formatter through the public translation chain', () => {
  for (const language of ['pt-BR', 'fr-FR']) {
    it.each(nativeValues())(`${language} $name preserves exact native single, mixed and rich results`, ({ value, single, rich }) => {
      const { catalog, locale, translator } = chain();
      const call = (key: string, vars: Record<string, unknown>) => [
        catalog.translate(key, language, vars), locale.t(key, vars, language), translator.translate(key, language, vars),
      ];
      for (const result of call('single', { value })) expect(result).toBe(single);
      for (const result of call('rich', { rich: () => value })) expect(result).toBe(rich);
      for (const result of call('mixed', { value })) {
        if (typeof single === 'string') expect(result).toBe(`before ${single} after`);
        else { expect(result).toHaveLength(3); expect(Reflect.get(Object(result), '0')).toBe('before '); expect(Reflect.get(Object(result), '1')).toBe(single); expect(Reflect.get(Object(result), '2')).toBe(' after'); }
      }
    });
  }
  it('keeps native parse/missing-variable errors, callback identity and absent-key behavior', () => {
    const { catalog, locale, translator } = chain(); const marker = new Error('callback');
    for (const translate of [
      (key: string, vars: Record<string, unknown>) => catalog.translate(key, 'en-US', vars),
      (key: string, vars: Record<string, unknown>) => locale.t(key, vars, 'en-US'),
      (key: string, vars: Record<string, unknown>) => translator.translate(key, 'en-US', vars),
    ]) {
      expect(() => translate('malformed', {})).toThrow(); expect(() => translate('need', {})).toThrow();
      expect(translate('absent', {})).toBe('absent');
      try { translate('rich', { rich: () => { throw marker; } }); throw new Error('callback did not throw'); } catch (error) { expect(error).toBe(marker); }
    }
  });
  it('rejects unadmitted tenant access before reading variables', () => {
    const { catalog } = chain(); const read = vi.fn(() => ({}));
    expect(() => catalog.translate('single', 'en-US', { get value() { return read(); } }, UUID)).toThrow('system denied');
    expect(read).not.toHaveBeenCalled();
  });
});

for (const kind of ['core', 'localized']) {
  describe(`${kind} filter with native Express JSON`, () => {
    it.each(nativeValues().filter(({ name }) => ['object', 'array', 'undefined', 'symbol', 'bigint', 'cycle'].includes(name ?? '')))(
      '$name retains message presence before serialization and logging order', ({ name, value, rich }) => {
        const { moduleRef } = chain(); const events: string[] = []; let serialized: string | undefined;
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => { events.push('warn'); });
        const response = {
          app: { get: () => undefined }, get: () => undefined, set: () => undefined,
          send(body: string) { serialized = body; return this; },
          status(status: number) { expect(status).toBe(400); events.push('status'); return this; },
          json(body: object) {
            events.push('json'); expect(Object.hasOwn(body, 'message')).toBe(true); expect(Reflect.get(body, 'message')).toBe(rich);
            return Reflect.apply(nativeJson, this, [body]);
          },
        };
        const host = { switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => response }) };
        const filter = kind === 'core' ? new StynxErrorFilter(moduleRef as never) : new LocalizedErrorFilter(moduleRef as never);
        const exception = new StynxError('fallback', { code: 'NATIVE_PROBE', status: 400, messageKey: 'rich', context: { rich: () => value } });
        if (name === 'bigint' || name === 'cycle') {
          expect(() => filter.catch(exception, host as never)).toThrow(TypeError); expect(serialized).toBeUndefined();
          expect(events).toEqual(kind === 'core' ? ['warn', 'status', 'json'] : ['status', 'json']);
        } else {
          filter.catch(exception, host as never); const parsed = JSON.parse(serialized!);
          expect(Object.hasOwn(parsed, 'message')).toBe(name !== 'undefined' && name !== 'symbol');
          if (name === 'object' || name === 'array') expect(parsed.message).toEqual({ opaque: true });
          expect(events).toEqual(kind === 'core' ? ['warn', 'status', 'json'] : ['status', 'json', 'warn']);
        }
      },
    );
  });
}

const sendBase = { deliveryId: UUID, notificationId: UUID, tenantId: UUID, recipient: { subjectId: 'user' }, locale: 'en-US' };
describe('in-app checked parameters retain the native pg domain', () => {
  it.each(nativeValues())('$name reaches exact original subject/body slots and native preparation', async ({ name, value }) => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const driver = { async query(sql: string, params: readonly unknown[]) { queries.push({ sql, params }); params.forEach((entry) => prepareValue(entry)); return { rows: [], rowCount: 1 }; } };
    const run: Transaction['run'] = (query, params) => executeTypedQuery(driver, query, params);
    const adapter = new InAppPostgresChannelAdapter({ get: () => ({ tx: (fn: (trx: { run: typeof run }) => unknown) => fn({ run }) }) } as never);
    const sent = adapter.send({ ...sendBase, subject: value, body: value });
    if (name === 'cycle') await expect(sent).rejects.toThrow(TypeError); else await expect(sent).resolves.toEqual({ status: 'DELIVERED' });
    expect(queries).toHaveLength(1); expect(queries[0]!.sql).toContain('insert into notifications.inbox_items');
    expect(queries[0]!.params[5]).toBe(value ?? ''); expect(queries[0]!.params[6]).toBe(value);
    expect(queries[0]!.params.slice(1, 5)).toEqual([UUID, 'user', UUID, UUID]); expect(queries[0]!.params[7]).toBe('en-US');
  });
  it('retains custom toPostgres receiver and driver exception identity', async () => {
    const marker = new Error('native pg'); let calls = 0;
    const value = { toPostgres() { expect(this).toBe(value); calls++; throw marker; } };
    const driver = { async query(_sql: string, params: readonly unknown[]) { params.forEach((entry) => prepareValue(entry)); return { rows: [], rowCount: 1 }; } };
    const run: Transaction['run'] = (query, params) => executeTypedQuery(driver, query, params);
    const adapter = new InAppPostgresChannelAdapter({ get: () => ({ tx: (fn: (trx: { run: typeof run }) => unknown) => fn({ run }) }) } as never);
    await expect(adapter.send({ ...sendBase, body: value })).rejects.toBe(marker); expect(calls).toBe(1);
  });
});

for (const channel of ['email', 'inapp'] as const) {
  describe(`${channel} admitted native dispatch`, () => {
    it.each(nativeValues().filter(({ name }) => ['object', 'array', 'true', 'number', 'null'].includes(name ?? '')))(
      '$name reaches the custom adapter with rendered identities before persistence', async ({ value, single }) => {
        const events: string[] = []; let catalog: CatalogService; let database: unknown;
        let rendered: ReturnType<NotificationTemplateRenderer['render']> | undefined;
        const context = { hasActiveContext: () => true, tenantId: UUID, actorId: UUID, locale: 'en-US' };
        const moduleRef = { get(token: unknown) { if (token === RequestContext) return context; if (token === CatalogService) return catalog; if (token === Database) return database; throw new Error('unexpected provider'); } };
        catalog = new CatalogService(moduleRef as never, { catalogs: { 'en-US': { single: '{value}' } } });
        const claimed = { id: UUID, tenant_id: UUID, notification_id: UUID, channel, attempt_count: 0, max_attempts: 5, recipient_subject_id: 'user', recipient_email: 'recipient@example.invalid', recipient_phone: null, recipient_push_token: null, template_id: 'native', template_version: 1, locale: 'en-US', variables: { value } };
        const driver = { async query(sql: string) { events.push(sql.startsWith('select d.id') ? 'claim' : sql.includes('attempt_count') ? 'mark' : 'persist'); return { rows: sql.startsWith('select d.id') ? [claimed] : [], rowCount: 1 }; } };
        const run: Transaction['run'] = (query, params) => executeTypedQuery(driver, query, params);
        database = { tx: (fn: (trx: { run: typeof run }) => unknown) => fn({ run }) };
        const renderer = new NotificationTemplateRenderer(moduleRef as never);
        const observedRenderer = { render(...args: Parameters<NotificationTemplateRenderer['render']>) { rendered = renderer.render(...args); return rendered; } };
        const adapter = { channel, async send(input: { body: unknown; subject?: unknown }) {
          events.push('send'); expect(rendered).toBeDefined(); expect(input.body).toBe(rendered!.body);
          expect(input.subject).toBe(channel === 'inapp' ? rendered!.inAppTitle : rendered!.subject);
          expect(input.body).toEqual(single); expect(input.subject).toEqual(single); return { status: 'SENT' as const };
        } };
        const service = new NotificationDispatchService(moduleRef as never,
          { resolve: () => ({ id: 'native', version: 1, supportedChannels: [channel], bodyKey: 'single', subjectKey: 'single' }) } as never,
          observedRenderer as never, new Map([[channel, adapter]]),
          { retryPolicies: { [channel]: { maxAttempts: 1, baseDelayMs: 0, jitterRatio: 0 } } });
        await expect(service.dispatchDue({ now: new Date('2026-01-01T00:00:00Z') })).resolves.toEqual({ claimed: 1, outcomes: [{ deliveryId: UUID, channel, status: 'SENT' }] });
        expect(events).toEqual(['claim', 'mark', 'send', 'persist']);
      },
    );
  });
}
