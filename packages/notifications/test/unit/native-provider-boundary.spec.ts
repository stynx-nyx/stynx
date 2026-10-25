import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CircuitBreaker } from '@stynx-nyx/integration-adapter';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EmailSesChannelAdapter } from '../../src/adapters/email-ses.adapter.js';
import { SmsSnsChannelAdapter } from '../../src/adapters/sms-sns.adapter.js';

const base = {
  deliveryId: '11111111-1111-4111-8111-111111111111', notificationId: '11111111-1111-4111-8111-111111111111',
  tenantId: '11111111-1111-4111-8111-111111111111', locale: 'en-US',
  recipient: { subjectId: 'user', email: 'recipient@example.invalid', phone: '+15550000000' },
};
const providers = [
  { name: 'email', command: SendEmailCommand, method: 'sendEmail', make: (circuit?: CircuitBreaker) => new EmailSesChannelAdapter({ ses: { fromAddress: 'sender@example.invalid', region: 'us-east-1' } }, circuit) },
  { name: 'sms', command: PublishCommand, method: 'publish', make: (circuit?: CircuitBreaker) => new SmsSnsChannelAdapter({ sns: { region: 'us-east-1' } }, circuit) },
] as const;

for (const provider of providers) {
  describe(`${provider.name} fixed native boundary`, () => {
    it.each(['missing', 'false', 'zero', 'empty', 'null-id', 'undefined-id', 'string', 'changing-string',
      'second-nonstring', 'message-throw', 'send-getter-throw', 'input-getter-throw', 'send-throw', 'null-response', 'primitive-response'])(
      '%s retains exact native command, receiver, property order and response semantics', async (kind) => {
        const adapter = provider.make(); Reflect.get(adapter, 'client').destroy();
        const events: string[] = []; const marker = new Error('native sentinel');
        const body = { rich: 'body' }; const subject = { rich: 'subject' }; let gets = 0;
        let response: unknown = { get ignored() { throw new Error('ignored response field read'); } };
        if (kind === 'null-response') response = null;
        else if (kind === 'primitive-response') response = 3;
        else if (kind !== 'missing') Object.defineProperty(response, 'MessageId', { get() {
          expect(this).toBe(response); events.push('MessageId'); gets++;
          if (kind === 'message-throw') throw marker;
          const values: Record<string, unknown> = { false: false, zero: 0, empty: '', 'null-id': null, 'undefined-id': undefined,
            string: 'id', 'changing-string': gets === 1 ? 'first' : 'second', 'second-nonstring': gets === 1 ? 'first' : 3 };
          return values[kind];
        } });
        const client = { get send() {
          expect(this).toBe(client); events.push('send:get'); if (kind === 'send-getter-throw') throw marker;
          return async function (this: unknown, command: object) {
            expect(this).toBe(client); expect(Object.getPrototypeOf(command)).toBe(provider.command.prototype);
            const input = Reflect.get(command, 'input');
            expect(provider.name === 'email' ? input.Message.Body.Text.Data : input.Message).toBe(body);
            if (provider.name === 'email') expect(input.Message.Subject.Data).toBe(subject);
            events.push('send:call'); if (kind === 'send-throw') throw marker; return response;
          };
        } };
        Object.defineProperty(adapter, 'client', { get() { events.push('client'); return client; } });
        const input = {
          get recipient() { events.push('recipient'); if (kind === 'input-getter-throw') throw marker; return base.recipient; },
          get subject() { events.push('subject'); return subject; }, get body() { events.push('body'); return body; },
        };
        let result: unknown; let failure: unknown;
        try { result = await Reflect.apply(Reflect.get(adapter, provider.method), adapter, [input]); } catch (error) { failure = error; }
        const prefix = ['client', 'send:get', 'recipient', ...(provider.name === 'email' ? ['subject'] : []), 'body', 'send:call'];
        if (kind === 'send-getter-throw') expect(events).toEqual(prefix.slice(0, 2));
        else if (kind === 'input-getter-throw') expect(events).toEqual(prefix.slice(0, 3));
        else expect(events).toEqual([...prefix, ...Array.from({ length: gets }, () => 'MessageId')]);
        if (['message-throw', 'send-getter-throw', 'input-getter-throw', 'send-throw'].includes(kind)) expect(failure).toBe(marker);
        else if (kind === 'null-response') { expect(failure).toBeInstanceOf(TypeError); expect(Reflect.get(Object(failure), 'message')).toBe("Cannot read properties of null (reading 'MessageId')"); }
        else if (kind === 'second-nonstring') { expect(failure).toBeInstanceOf(TypeError); expect(Reflect.get(Object(failure), 'message')).toBe('Invalid provider message identifier'); }
        else { expect(failure).toBeUndefined(); expect(result).toEqual(kind === 'string' ? { status: 'SENT', providerMessageId: 'id' } : kind === 'changing-string' ? { status: 'SENT', providerMessageId: 'second' } : { status: 'SENT' }); }
        expect(gets).toBe(['string', 'changing-string', 'second-nonstring'].includes(kind) ? 2 :
          ['false', 'zero', 'empty', 'null-id', 'undefined-id', 'message-throw'].includes(kind) ? 1 : 0);
      },
    );
  });
}

function nativeValues() {
  const object = { opaque: true }; const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  return [['string', 'plain'], ['object', object], ['array', [object]], ['boolean', true], ['number', 12],
    ['null', null], ['undefined', undefined], ['bigint', 4n], ['symbol', Symbol('opaque')], ['function', () => object], ['cycle', cycle]] as const;
}

for (const provider of providers) {
  describe(`${provider.name} actual SDK local serializer`, () => {
    it.each(nativeValues())('%s preserves opaque inputs through the fixed command into native serialization', async (_name, value) => {
      const requests: string[] = []; const identities: boolean[] = [];
      const requestHandler = {
        async handle(request: { body?: unknown }) {
          expect(typeof request.body).toBe('string'); requests.push(String(request.body));
          const operation = provider.name === 'email' ? 'SendEmail' : 'Publish';
          const namespace = provider.name === 'email' ? 'http://ses.amazonaws.com/doc/2010-12-01/' : 'http://sns.amazonaws.com/doc/2010-03-31/';
          return { response: { statusCode: 200, headers: { 'content-type': 'text/xml' }, body: Buffer.from(`<${operation}Response xmlns="${namespace}"><${operation}Result><MessageId>local-id</MessageId></${operation}Result><ResponseMetadata><RequestId>local-request</RequestId></ResponseMetadata></${operation}Response>`) } };
        }, destroy() {},
      };
      const config = { region: 'us-east-1', credentials: { accessKeyId: 'LOCAL_TEST_ONLY', secretAccessKey: 'LOCAL_TEST_ONLY' }, maxAttempts: 1, requestHandler };
      const client = provider.name === 'email' ? new SESClient(config) : new SNSClient(config);
      client.middlewareStack.add((next) => async (args) => {
        const input = Object(args.input);
        identities.push((provider.name === 'email' ? input.Message.Body.Text.Data : input.Message) === value);
        if (provider.name === 'email') identities.push(input.Message.Subject.Data === (value ?? ''));
        return next(args);
      }, { step: 'initialize', name: 'nativeIdentityObservation' });
      const adapter = provider.make(); Reflect.get(adapter, 'client').destroy(); Reflect.set(adapter, 'client', client);
      try {
        await expect(adapter.send({ ...base, body: value, subject: value })).resolves.toEqual({ status: 'SENT', providerMessageId: 'local-id' });
        expect(identities).toEqual(provider.name === 'email' ? [true, true] : [true]);
        expect(requests).toHaveLength(1);
        const fields = new URLSearchParams(requests[0]);
        const key = provider.name === 'email' ? 'Message.Body.Text.Data' : 'Message';
        expect(fields.get(key)).toBe(value === null || value === undefined ? null : String(value));
        if (provider.name === 'email') expect(fields.get('Message.Subject.Data')).toBe(String(value ?? ''));
      } finally { client.destroy(); }
    });
  });
}

for (const provider of providers) {
  describe(`${provider.name} integration boundary ordering`, () => {
    it('retains missing-address and body-error precedence while the existing unkeyed circuit remains unconsulted', async () => {
      const denied = new Error('circuit denied'); denied.name = 'CircuitDenied';
      const beforeRequest = vi.fn(async () => { throw denied; });
      const circuit = { beforeRequest, recordSuccess: vi.fn(), recordFailure: vi.fn(), snapshot: vi.fn() };
      const adapter = provider.make(circuit as never); Reflect.get(adapter, 'client').destroy();
      const send = vi.fn(); Reflect.set(adapter, 'client', { send });
      const readBody = vi.fn(() => { throw new Error('body must not be read'); });
      await expect(adapter.send({ ...base, recipient: { subjectId: 'user' }, get body() { return readBody(); } })).rejects.toBeInstanceOf(Error);
      expect(beforeRequest).not.toHaveBeenCalled();
      await expect(adapter.send({ ...base, get body() { return readBody(); } })).resolves.toEqual({
        status: 'FAILED', errorCode: provider.name === 'email' ? 'SES_SEND_FAILED' : 'SNS_PUBLISH_FAILED', errorDetail: 'Error',
      });
      expect(beforeRequest).not.toHaveBeenCalled(); expect(readBody).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled();
      expect(circuit.recordFailure).not.toHaveBeenCalled();
    });
    it('retains the single provider attempt and existing timeout classification', async () => {
      vi.useFakeTimers(); const adapter = provider.make(); Reflect.get(adapter, 'client').destroy();
      const send = vi.fn(() => new Promise(() => {})); Reflect.set(adapter, 'client', { send });
      const pending = expect(adapter.send({ ...base, body: { opaque: true } })).resolves.toEqual({
        status: 'FAILED', errorCode: provider.name === 'email' ? 'SES_SEND_FAILED' : 'SNS_PUBLISH_FAILED', errorDetail: 'Error',
      });
      await vi.advanceTimersByTimeAsync(10_000); await pending;
      expect(send).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    });
  });
}
