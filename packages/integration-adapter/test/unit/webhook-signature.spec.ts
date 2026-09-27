import { createHmac } from 'node:crypto';
import {
  verifyWebhookSignature,
  type WebhookReplayStore,
  type WebhookVerificationInput,
  type WebhookVerificationOptions,
} from '../../src';

// UPS-HOOK-01: the store's single synchronous reservation is the atomic boundary.
class AtomicReplayStore implements WebhookReplayStore {
  readonly consumed = new Map<string, Date>();

  async consume(key: string, expiresAt: Date): Promise<boolean> {
    if (this.consumed.has(key)) return false;
    this.consumed.set(key, expiresAt);
    return true;
  }
}

const timestamp = '1700000000';
const nowMs = 1_700_000_000_000;
const secret = 'webhook-test-secret';
const rawBody = Buffer.from('{"event":"criação","count":1}\n', 'utf8');

function sign(body = rawBody, key = secret, stamp = timestamp): string {
  return `sha256=${createHmac('sha256', key).update(stamp).update('.').update(body).digest('hex')}`;
}

function input(overrides: Partial<WebhookVerificationInput> = {}): WebhookVerificationInput {
  return {
    rawBody,
    headers: { 'x-webhook-timestamp': timestamp, 'x-webhook-signature': sign() },
    ...overrides,
  };
}

function options(store: WebhookReplayStore, clockMs = nowMs): WebhookVerificationOptions {
  return {
    secret,
    clock: { now: () => new Date(clockMs) },
    maxSkewMs: 300_000,
    replayStore: store,
    replayNamespace: 'provider-a',
    signatureHeaderName: 'X-Webhook-Signature',
    timestampHeaderName: 'X-Webhook-Timestamp',
  };
}

describe('UPS-HOOK-01 verifyWebhookSignature', () => {
  it('authenticates the exact raw Buffer and returns Unix seconds with the verified HMAC replay key', async () => {
    const store = new AtomicReplayStore();
    const result = await verifyWebhookSignature(input(), options(store));
    const digest = sign().slice('sha256='.length);
    expect(result).toEqual({
      verified: true,
      timestamp: 1_700_000_000,
      replayKey: `provider-a:${timestamp}:${digest}`,
    });
    expect([...store.consumed]).toEqual([
      [`provider-a:${timestamp}:${digest}`, new Date(1_700_000_300_001)],
    ]);
    expect(
      await verifyWebhookSignature(
        input({ rawBody: Buffer.from('{"count":1,"event":"criação"}\n') }),
        options(new AtomicReplayStore()),
      ),
    ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
    const oneByteChanged = Buffer.from(rawBody);
    oneByteChanged[0] ^= 1;
    expect(
      await verifyWebhookSignature(
        input({ rawBody: oneByteChanged }),
        options(new AtomicReplayStore()),
      ),
    ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
    expect(
      await verifyWebhookSignature(input(), {
        ...options(new AtomicReplayStore()),
        secret: 'wrong-secret',
      }),
    ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
  });

  it('accepts both inclusive millisecond boundaries and rejects one millisecond outside either edge', async () => {
    for (const clockMs of [1_699_999_700_000, 1_700_000_300_000]) {
      const store = new AtomicReplayStore();
      expect(await verifyWebhookSignature(input(), options(store, clockMs))).toMatchObject({
        verified: true,
        timestamp: 1_700_000_000,
      });
      expect([...store.consumed.values()][0]?.getTime()).toBe(1_700_000_300_001);
    }
    for (const clockMs of [1_699_999_699_999, 1_700_000_300_001]) {
      expect(
        await verifyWebhookSignature(input(), options(new AtomicReplayStore(), clockMs)),
      ).toEqual({ verified: false, reason: 'OUTSIDE_WINDOW' });
    }
  });

  it('requires raw body, configured lowercase header lookups, and nonempty headers', async () => {
    const base = options(new AtomicReplayStore());
    expect(
      await verifyWebhookSignature(input({ rawBody: undefined as unknown as Buffer }), base),
    ).toEqual({ verified: false, reason: 'MISSING_RAW_BODY' });
    for (const headers of [
      { 'x-webhook-timestamp': timestamp },
      { 'x-webhook-signature': sign() },
      { 'x-webhook-timestamp': timestamp, 'x-webhook-signature': '' },
      { 'x-webhook-timestamp': '', 'x-webhook-signature': sign() },
    ]) {
      expect(await verifyWebhookSignature(input({ headers }), base)).toEqual({
        verified: false,
        reason: 'MISSING_HEADER',
      });
    }
    const custom = {
      ...base,
      signatureHeaderName: 'X-Custom-Signature',
      timestampHeaderName: 'X-Custom-Timestamp',
    };
    expect(
      await verifyWebhookSignature(
        input({ headers: { 'x-custom-timestamp': timestamp, 'x-custom-signature': sign() } }),
        custom,
      ),
    ).toMatchObject({ verified: true });
  });

  it('rejects whitespace, duplicate headers, and non-ten-digit timestamps without consuming a key', async () => {
    const store = new AtomicReplayStore();
    for (const value of [
      ` ${timestamp}`,
      `${timestamp} `,
      [timestamp],
      '170000000',
      '17000000000',
      '170000000x',
      '-700000000',
    ]) {
      expect(
        await verifyWebhookSignature(
          input({ headers: { 'x-webhook-timestamp': value, 'x-webhook-signature': sign() } }),
          options(store),
        ),
      ).toEqual({ verified: false, reason: 'INVALID_TIMESTAMP' });
    }
    for (const value of [
      ` ${sign()}`,
      `${sign()} `,
      [sign()],
      'sha256=abc',
      sign().replace('sha256=', ''),
      `sha256=${'x'.repeat(64)}`,
    ]) {
      expect(
        await verifyWebhookSignature(
          input({ headers: { 'x-webhook-timestamp': timestamp, 'x-webhook-signature': value } }),
          options(store),
        ),
      ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
    }
    expect(store.consumed.size).toBe(0);
  });

  it('uses one normalized replay identity across concurrent requests and uppercase signature text', async () => {
    const store = new AtomicReplayStore();
    const [a, b] = await Promise.all([
      verifyWebhookSignature(input(), options(store)),
      verifyWebhookSignature(input(), options(store)),
    ]);
    expect([a.verified, b.verified].sort()).toEqual([false, true]);
    expect([a, b].find((value) => !value.verified)).toEqual({ verified: false, reason: 'REPLAY' });
    expect(await verifyWebhookSignature(input(), options(store))).toEqual({
      verified: false,
      reason: 'REPLAY',
    });
    const upper = sign().toUpperCase();
    expect(
      await verifyWebhookSignature(
        input({ headers: { 'x-webhook-timestamp': timestamp, 'x-webhook-signature': upper } }),
        options(store),
      ),
    ).toEqual({ verified: false, reason: 'REPLAY' });
    expect(store.consumed.size).toBe(1);
  });

  it('does not let unsigned tenant or event headers change the default replay identity', async () => {
    const store = new AtomicReplayStore();
    const first = input({
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': sign(),
        'x-tenant-id': 'tenant-a',
        'x-event-id': 'event-a',
      },
    });
    const altered = input({
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': sign(),
        'x-tenant-id': 'tenant-b',
        'x-event-id': 'event-b',
      },
    });
    expect(await verifyWebhookSignature(first, options(store))).toMatchObject({ verified: true });
    expect(await verifyWebhookSignature(altered, options(store))).toEqual({
      verified: false,
      reason: 'REPLAY',
    });
    expect(store.consumed.size).toBe(1);
  });

  it('passes the original validated timestamp text to a custom message and authenticates added fields', async () => {
    const store = new AtomicReplayStore();
    const body = Buffer.from([0, 255, 46, 10]);
    const tenant = 'tenant-a';
    const event = 'event-a';
    const message = vi.fn((value: WebhookVerificationInput) =>
      Buffer.concat([
        Buffer.from(
          `${value.headers['x-webhook-timestamp']}.${value.headers['x-tenant-id']}.${value.headers['x-event-id']}.`,
        ),
        value.rawBody,
      ]),
    );
    const digest = createHmac('sha256', secret)
      .update(`${timestamp}.${tenant}.${event}.`)
      .update(body)
      .digest('hex');
    const original = input({
      rawBody: body,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': `sha256=${digest}`,
        'x-tenant-id': tenant,
        'x-event-id': event,
      },
    });
    const configured = { ...options(store), message };
    expect(await verifyWebhookSignature(original, configured)).toMatchObject({ verified: true });
    expect(message).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: body,
        headers: expect.objectContaining({ 'x-webhook-timestamp': timestamp }),
      }),
    );
    for (const changed of [
      { ...original.headers, 'x-tenant-id': 'tenant-b' },
      { ...original.headers, 'x-event-id': 'event-b' },
    ]) {
      expect(
        await verifyWebhookSignature(input({ rawBody: body, headers: changed }), {
          ...configured,
          replayStore: new AtomicReplayStore(),
        }),
      ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
    }
  });

  it('fails closed on store errors and invalid configuration without exposing secrets in errors', async () => {
    const store: WebhookReplayStore = {
      consume: vi.fn(async () => {
        throw new Error('replay store unavailable');
      }),
    };
    await expect(verifyWebhookSignature(input(), options(store))).rejects.toThrow(
      'replay store unavailable',
    );
    for (const invalid of [
      { secret: '' },
      { secret: undefined },
      { replayNamespace: '' },
      { maxSkewMs: 0 },
      { maxSkewMs: Number.POSITIVE_INFINITY },
    ]) {
      await expect(
        verifyWebhookSignature(input(), { ...options(new AtomicReplayStore()), ...invalid }),
      ).rejects.toThrow();
    }
    const consumeBeforeHmac = vi.fn(async () => true);
    expect(
      await verifyWebhookSignature(
        input({
          headers: {
            'x-webhook-timestamp': timestamp,
            'x-webhook-signature': sign(rawBody, 'wrong-secret'),
          },
        }),
        options({ consume: consumeBeforeHmac }),
      ),
    ).toEqual({ verified: false, reason: 'INVALID_SIGNATURE' });
    expect(consumeBeforeHmac).not.toHaveBeenCalled();
    await expect(
      verifyWebhookSignature(input(), {
        ...options(new AtomicReplayStore()),
        clock: {
          now: () => {
            throw new Error('clock unavailable');
          },
        },
      }),
    ).rejects.toThrow('clock unavailable');
  });
});
